package main

import (
	"crypto/ed25519"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/controller"
)

var Version = "dev"

func main() {
	if len(os.Args) == 2 {
		switch os.Args[1] {
		case "version":
			fmt.Println(Version)
			return
		case "self-test":
			if err := controllerSelfTest(); err != nil {
				fatalIf(err)
			}
			fmt.Println(Version)
			return
		}
	}
	listen := flag.String("listen", ":9443", "HTTPS listen address")
	state := flag.String("state", "/var/lib/layersentry/controller/host-agent-state.json", "durable controller state")
	tlsCert := flag.String("tls-cert", "/etc/layersentry/controller/server.crt", "server TLS certificate")
	tlsKey := flag.String("tls-key", "/etc/layersentry/controller/server.key", "server TLS private key")
	caCert := flag.String("ca-cert", "/etc/layersentry/controller/agent-ca.crt", "agent identity CA certificate")
	caKey := flag.String("ca-key", "/etc/layersentry/controller/agent-ca.key", "agent identity CA Ed25519 private key")
	signingKey := flag.String("signing-key", "/etc/layersentry/controller/job-signing.key", "job signing Ed25519 private key")
	adminTokenFile := flag.String("admin-token-file", "/etc/layersentry/controller/admin.token", "root-owned admin bearer token file")
	certTTL := flag.Duration("client-cert-ttl", 30*24*time.Hour, "issued agent certificate lifetime")
	flag.Parse()

	store, err := controller.OpenStore(*state)
	fatalIf(err)
	ca, err := loadCertificate(*caCert)
	fatalIf(err)
	if !ca.IsCA {
		fatalIf(errors.New("configured agent CA certificate is not a CA"))
	}
	caPrivate, err := loadEd25519PrivateKey(*caKey)
	fatalIf(err)
	jobPrivate, err := loadEd25519PrivateKey(*signingKey)
	fatalIf(err)
	adminTokenBytes, err := os.ReadFile(*adminTokenFile)
	fatalIf(err)
	adminToken := strings.TrimSpace(string(adminTokenBytes))
	if len(adminToken) < 32 || len(adminToken) > 4096 {
		fatalIf(errors.New("admin token length rejected"))
	}

	api, err := controller.New(controller.Config{Store: store, CA: ca, CAKey: caPrivate, SigningKey: jobPrivate, AdminToken: adminToken, CertTTL: *certTTL})
	fatalIf(err)

	clientRoots := x509.NewCertPool()
	caPEM, err := os.ReadFile(*caCert)
	fatalIf(err)
	if !clientRoots.AppendCertsFromPEM(caPEM) {
		fatalIf(errors.New("agent CA file contains no certificates"))
	}

	server := &http.Server{
		Addr:              *listen,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      45 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
		TLSConfig: &tls.Config{
			MinVersion: tls.VersionTLS13,
			ClientCAs:  clientRoots,
			// Enrollment deliberately has no client certificate yet. Poll handlers
			// enforce a verified, host/site-bound client certificate explicitly.
			ClientAuth: tls.VerifyClientCertIfGiven,
		},
	}
	log.Printf("LayerSentry host controller listening on %s", *listen)
	fatalIf(server.ListenAndServeTLS(*tlsCert, *tlsKey))
}

func controllerSelfTest() error {
	if Version == "" {
		return errors.New("empty version")
	}
	_, err := os.Executable()
	return err
}

func loadCertificate(path string) (*x509.Certificate, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(body)
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("%s does not contain a certificate", path)
	}
	return x509.ParseCertificate(block.Bytes)
}

func loadEd25519PrivateKey(path string) (ed25519.PrivateKey, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(body)
	if block == nil {
		return nil, fmt.Errorf("%s is not PEM", path)
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(ed25519.PrivateKey)
	if !ok || len(key) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("%s is not an Ed25519 private key", path)
	}
	return key, nil
}

func fatalIf(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
