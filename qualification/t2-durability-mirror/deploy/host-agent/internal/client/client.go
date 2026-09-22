package client

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
)

type Client struct {
	cfg  config.Config
	http *http.Client
	key  ed25519.PublicKey
}

type enrollRequest struct {
	Schema    string             `json:"schema"`
	Site      string             `json:"site"`
	Host      string             `json:"host"`
	CSRPEM    string             `json:"csr_pem"`
	Inventory inventory.Snapshot `json:"inventory"`
}

type enrollResponse struct {
	Schema  string `json:"schema"`
	CertPEM string `json:"cert_pem"`
}

type pollRequest struct {
	Schema    string             `json:"schema"`
	Site      string             `json:"site"`
	Host      string             `json:"host"`
	Inventory inventory.Snapshot `json:"inventory"`
	Receipts  []protocol.Receipt `json:"receipts,omitempty"`
}

type pollResponse struct {
	Schema string         `json:"schema"`
	Jobs   []protocol.Job `json:"jobs"`
}

func EnrollIfNeeded(ctx context.Context, cfg config.Config) error {
	if fileOK(cfg.ClientCertFile) && fileOK(cfg.ClientKeyFile) {
		return nil
	}
	if cfg.BootstrapFile == "" {
		return errors.New("agent is not enrolled and no bootstrap_token_file is configured")
	}
	token, err := os.ReadFile(cfg.BootstrapFile)
	if err != nil {
		return fmt.Errorf("read bootstrap token: %w", err)
	}
	secret := strings.TrimSpace(string(token))
	if secret == "" || len(secret) > 4096 {
		return errors.New("invalid bootstrap token")
	}

	pub, priv, err := loadOrCreateEnrollmentKey(cfg.ClientKeyFile)
	if err != nil {
		return err
	}
	csrDER, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkixName(cfg.Site, cfg.Host)}, priv)
	if err != nil {
		return err
	}
	csr := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: csrDER})
	body, _ := json.Marshal(enrollRequest{
		Schema: "layersentry-agent-enroll/v1", Site: cfg.Site, Host: cfg.Host,
		CSRPEM: string(csr), Inventory: inventory.CollectEnrollment(ctx),
	})
	roots, err := loadRoots(cfg.CAFile)
	if err != nil {
		return err
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: roots}}
	httpClient := &http.Client{Transport: transport, Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(cfg.ControllerURL, "/")+"/v1/agent/enroll", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+secret)
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("enrollment rejected: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	var er enrollResponse
	if err := json.Unmarshal(data, &er); err != nil || er.Schema != "layersentry-agent-enroll-result/v1" {
		return errors.New("invalid enrollment response")
	}
	if err := verifyCertificateForKey(er.CertPEM, pub, roots); err != nil {
		return err
	}
	if err := atomicWrite(cfg.ClientCertFile, []byte(er.CertPEM), 0o644); err != nil {
		return err
	}
	// Bootstrap material is root-owned configuration. The unprivileged agent
	// persists its client identity but must not mutate /etc/layersentry.
	// The root-owned service wrapper removes the bootstrap token only after
	// this enrollment step succeeds and both identity files are present.
	return nil
}

func loadOrCreateEnrollmentKey(path string) (ed25519.PublicKey, ed25519.PrivateKey, error) {
	if fileOK(path) {
		body, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, err
		}
		block, _ := pem.Decode(body)
		if block == nil || block.Type != "PRIVATE KEY" {
			return nil, nil, errors.New("existing enrollment key is not PKCS8 PEM")
		}
		value, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, nil, err
		}
		private, ok := value.(ed25519.PrivateKey)
		if !ok || len(private) != ed25519.PrivateKeySize {
			return nil, nil, errors.New("existing enrollment key is not Ed25519")
		}
		public := private.Public().(ed25519.PublicKey)
		return public, private, nil
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(private)
	if err != nil {
		return nil, nil, err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	if err := atomicWrite(path, keyPEM, 0o640); err != nil {
		return nil, nil, err
	}
	return public, private, nil
}

func New(cfg config.Config) (*Client, error) {
	roots, err := loadRoots(cfg.CAFile)
	if err != nil {
		return nil, err
	}
	cert, err := tls.LoadX509KeyPair(cfg.ClientCertFile, cfg.ClientKeyFile)
	if err != nil {
		return nil, err
	}
	key, err := loadSigningKey(cfg.SigningKeyFile)
	if err != nil {
		return nil, err
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{
		MinVersion: tls.VersionTLS13, RootCAs: roots, Certificates: []tls.Certificate{cert},
	}}
	return &Client{cfg: cfg, http: &http.Client{Transport: transport, Timeout: 40 * time.Second}, key: key}, nil
}

func (c *Client) Poll(ctx context.Context, receipts []protocol.Receipt) ([]protocol.Job, error) {
	body, _ := json.Marshal(pollRequest{Schema: "layersentry-agent-poll/v1", Site: c.cfg.Site, Host: c.cfg.Host, Inventory: inventory.Collect(ctx), Receipts: receipts})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.cfg.ControllerURL, "/")+"/v1/agent/poll", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("poll rejected: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var pr pollResponse
	if err := json.Unmarshal(data, &pr); err != nil || pr.Schema != "layersentry-agent-poll-result/v1" {
		return nil, errors.New("invalid poll response")
	}
	for i := range pr.Jobs {
		if err := pr.Jobs[i].Verify(c.key, c.cfg.Site, c.cfg.Host, time.Now().UTC()); err != nil {
			return nil, fmt.Errorf("reject controller job %q: %w", pr.Jobs[i].OperationID, err)
		}
	}
	return pr.Jobs, nil
}

func loadRoots(path string) (*x509.CertPool, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	p := x509.NewCertPool()
	if !p.AppendCertsFromPEM(b) {
		return nil, errors.New("CA file contains no certificates")
	}
	return p, nil
}

func loadSigningKey(path string) (ed25519.PublicKey, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	blk, _ := pem.Decode(b)
	if blk == nil {
		return nil, errors.New("controller signing key must be PEM")
	}
	v, err := x509.ParsePKIXPublicKey(blk.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := v.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("controller signing key must be Ed25519")
	}
	return key, nil
}

func verifyCertificateForKey(certPEM string, public crypto.PublicKey, roots *x509.CertPool) error {
	blk, _ := pem.Decode([]byte(certPEM))
	if blk == nil {
		return errors.New("enrollment returned no certificate")
	}
	cert, err := x509.ParseCertificate(blk.Bytes)
	if err != nil {
		return err
	}
	pub, ok := cert.PublicKey.(ed25519.PublicKey)
	expected, ok2 := public.(ed25519.PublicKey)
	if !ok || !ok2 || !pub.Equal(expected) {
		return errors.New("certificate public key does not match generated key")
	}
	_, err = cert.Verify(x509.VerifyOptions{Roots: roots, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}})
	return err
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	if path == "" {
		return errors.New("empty output path")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".agent-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err := f.Chmod(mode); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}

func fileOK(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.Mode().IsRegular() && st.Size() > 0
}

func pkixName(site, host string) pkix.Name {
	return pkix.Name{CommonName: host, Organization: []string{"LayerSentry", site}}
}
