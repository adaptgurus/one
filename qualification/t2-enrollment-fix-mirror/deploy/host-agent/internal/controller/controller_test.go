package controller

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
)

func testController(t *testing.T) (*Server, *Store, ed25519.PrivateKey, *x509.Certificate) {
	t.Helper()
	_, caKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	caTemplate := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "LayerSentry test CA"}, NotBefore: now.Add(-time.Hour), NotAfter: now.Add(24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature}
	der, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, caKey.Public(), caKey)
	if err != nil {
		t.Fatal(err)
	}
	ca, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	_, signingKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(t.TempDir(), "controller.json"))
	if err != nil {
		t.Fatal(err)
	}
	server, err := New(Config{Store: store, CA: ca, CAKey: caKey, SigningKey: signingKey, AdminToken: "TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ", CertTTL: 12 * time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	return server, store, signingKey, ca
}

func makeCSR(t *testing.T, site, host string) string {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{Subject: pkix.Name{CommonName: host, Organization: []string{"LayerSentry", site}}}, key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der}))
}

func enrollFixture(t *testing.T, server *Server, store *Store, site, host, machineID string) *x509.Certificate {
	t.Helper()
	token := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if err := store.AddBootstrap(site, host, token, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-enroll/v1", "site": site, "host": host, "csr_pem": makeCSR(t, site, host), "inventory": inventory.Snapshot{Schema: "layersentry-agent-inventory/v1", Hostname: host, MachineID: machineID}})
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/enroll", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("fixture enrollment failed: %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		CertPEM string `json:"cert_pem"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode([]byte(response.CertPEM))
	if block == nil {
		t.Fatal("fixture returned no certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	return cert
}

func TestEnrollmentConsumesTokenAndAllowsExactKeyReplay(t *testing.T) {
	server, store, _, ca := testController(t)
	token := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if err := store.AddBootstrap("dc1", "kvm01", token, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-enroll/v1", "site": "dc1", "host": "kvm01", "csr_pem": makeCSR(t, "dc1", "kvm01"), "inventory": inventory.Snapshot{Schema: "layersentry-agent-inventory/v1", Hostname: "kvm01", MachineID: "machine-1"}})
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/enroll", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("enrollment failed: %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Schema  string `json:"schema"`
		CertPEM string `json:"cert_pem"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	block, _ := pem.Decode([]byte(response.CertPEM))
	if block == nil {
		t.Fatal("no certificate returned")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(ca)
	if _, err := cert.Verify(x509.VerifyOptions{Roots: pool, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}}); err != nil {
		t.Fatalf("issued certificate does not verify: %v", err)
	}
	if !identityMatches(cert.Subject, "dc1", "kvm01") {
		t.Fatal("issued certificate identity not bound to requested host/site")
	}

	replay := httptest.NewRecorder()
	replayReq := httptest.NewRequest(http.MethodPost, "/v1/agent/enroll", bytes.NewReader(body))
	replayReq.Header.Set("Authorization", "Bearer "+token)
	server.Handler().ServeHTTP(replay, replayReq)
	if replay.Code != http.StatusOK {
		t.Fatalf("exact enrollment replay failed: %d %s", replay.Code, replay.Body.String())
	}
	var replayResponse struct {
		CertPEM string `json:"cert_pem"`
	}
	if err := json.Unmarshal(replay.Body.Bytes(), &replayResponse); err != nil {
		t.Fatal(err)
	}
	if replayResponse.CertPEM != response.CertPEM {
		t.Fatal("exact enrollment replay returned a different certificate")
	}

	differentBody, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-enroll/v1", "site": "dc1", "host": "kvm01", "csr_pem": makeCSR(t, "dc1", "kvm01"), "inventory": inventory.Snapshot{Schema: "layersentry-agent-inventory/v1", Hostname: "kvm01", MachineID: "machine-1"}})
	different := httptest.NewRecorder()
	differentReq := httptest.NewRequest(http.MethodPost, "/v1/agent/enroll", bytes.NewReader(differentBody))
	differentReq.Header.Set("Authorization", "Bearer "+token)
	server.Handler().ServeHTTP(different, differentReq)
	if different.Code != http.StatusUnauthorized {
		t.Fatalf("bootstrap replay with different key accepted: %d", different.Code)
	}
}

func TestPollDeliversSignedJobAndPersistsReceipt(t *testing.T) {
	server, store, signingKey, _ := testController(t)
	clientCert := enrollFixture(t, server, store, "dc1", "kvm01", "machine-1")
	now := time.Now().UTC()
	job := protocol.Job{Schema: "layersentry-agent-job/v1", OperationID: "op-1", Site: "dc1", Host: "kvm01", Action: "host.seal", IssuedAt: now, ExpiresAt: now.Add(10 * time.Minute), Payload: json.RawMessage(`{}`)}
	if err := job.Sign(signingKey); err != nil {
		t.Fatal(err)
	}
	if err := store.Queue(job, now); err != nil {
		t.Fatal(err)
	}
	pollBody, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-poll/v1", "site": "dc1", "host": "kvm01", "inventory": inventory.Snapshot{MachineID: "machine-1"}})
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/poll", bytes.NewReader(pollBody))
	req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{clientCert}}
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("poll failed: %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Schema string         `json:"schema"`
		Jobs   []protocol.Job `json:"jobs"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Jobs) != 1 {
		t.Fatalf("expected one job, got %d", len(response.Jobs))
	}
	if err := response.Jobs[0].Verify(signingKey.Public().(ed25519.PublicKey), "dc1", "kvm01", time.Now().UTC()); err != nil {
		t.Fatalf("delivered job does not verify: %v", err)
	}

	receipt := protocol.Receipt{Schema: "layersentry-agent-receipt/v1", OperationID: "op-1", Host: "kvm01", Action: "host.seal", Status: "UNKNOWN", StartedAt: now, FinishedAt: now.Add(time.Second)}
	pollBody, _ = json.Marshal(map[string]any{"schema": "layersentry-agent-poll/v1", "site": "dc1", "host": "kvm01", "inventory": inventory.Snapshot{MachineID: "machine-1"}, "receipts": []protocol.Receipt{receipt}})
	req = httptest.NewRequest(http.MethodPost, "/v1/agent/poll", bytes.NewReader(pollBody))
	req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{clientCert}}
	recorder = httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("receipt poll failed: %d %s", recorder.Code, recorder.Body.String())
	}
	if state := store.Snapshot(); state.Jobs["op-1"].State != "UNKNOWN" {
		t.Fatalf("uncertain receipt was not preserved as UNKNOWN: %q", state.Jobs["op-1"].State)
	}
	reopened, err := OpenStore(store.path)
	if err != nil {
		t.Fatal(err)
	}
	if reopened.Snapshot().Jobs["op-1"].State != "UNKNOWN" {
		t.Fatal("job state did not survive controller restart")
	}
}

func TestAdminRejectsDuplicateOperationID(t *testing.T) {
	server, store, _, _ := testController(t)
	_ = enrollFixture(t, server, store, "dc1", "kvm01", "machine-1")
	body := []byte(`{"operation_id":"dup-1","site":"dc1","host":"kvm01","action":"host.seal","payload":{},"ttl_seconds":60}`)
	for i, want := range []int{http.StatusCreated, http.StatusConflict} {
		req := httptest.NewRequest(http.MethodPost, "/v1/admin/jobs", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, req)
		if recorder.Code != want {
			t.Fatalf("attempt %d: got %d want %d (%s)", i+1, recorder.Code, want, recorder.Body.String())
		}
	}
}

func TestDeliveredExpiredJobBecomesUnknown(t *testing.T) {
	_, store, signingKey, _ := testController(t)
	now := time.Now().UTC()
	job := protocol.Job{Schema: "layersentry-agent-job/v1", OperationID: "op-uncertain", Site: "dc1", Host: "kvm01", Action: "host.seal", IssuedAt: now.Add(-time.Minute), ExpiresAt: now.Add(time.Second), Payload: json.RawMessage(`{}`)}
	if err := job.Sign(signingKey); err != nil {
		t.Fatal(err)
	}
	if err := store.Queue(job, now); err != nil {
		t.Fatal(err)
	}
	if jobs, err := store.Deliver("dc1", "kvm01", now); err != nil || len(jobs) != 1 {
		t.Fatalf("initial delivery failed: %v jobs=%d", err, len(jobs))
	}
	if jobs, err := store.Deliver("dc1", "kvm01", now.Add(2*time.Second)); err != nil || len(jobs) != 0 {
		t.Fatalf("expired redelivery result: %v jobs=%d", err, len(jobs))
	}
	if state := store.Snapshot().Jobs["op-uncertain"].State; state != "UNKNOWN" {
		t.Fatalf("expired delivered job state=%q, want UNKNOWN", state)
	}
}

func TestEnrollmentRejectsWrongManagementIPWithoutConsumingToken(t *testing.T) {
	server, store, _, _ := testController(t)
	token := "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if err := store.AddBootstrapForIP("dc1", "kvm01", token, "10.10.10.31", time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	inventoryFor := func(ip string) inventory.Snapshot {
		network := json.RawMessage(`[ {"ifname":"eth0","addr_info":[{"family":"inet","local":"` + ip + `","scope":"global"}]} ]`)
		return inventory.Snapshot{Schema: "layersentry-agent-inventory/v3", Hostname: "kvm01", MachineID: "machine-ip", Network: network}
	}
	requestFor := func(ip string) *http.Request {
		body, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-enroll/v1", "site": "dc1", "host": "kvm01", "csr_pem": makeCSR(t, "dc1", "kvm01"), "inventory": inventoryFor(ip)})
		req := httptest.NewRequest(http.MethodPost, "/v1/agent/enroll", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		return req
	}
	bad := httptest.NewRecorder()
	server.Handler().ServeHTTP(bad, requestFor("10.10.10.32"))
	if bad.Code != http.StatusUnauthorized {
		t.Fatalf("wrong IP enrollment accepted: %d %s", bad.Code, bad.Body.String())
	}
	good := httptest.NewRecorder()
	server.Handler().ServeHTTP(good, requestFor("10.10.10.31"))
	if good.Code != http.StatusOK {
		t.Fatalf("correct IP enrollment failed after mismatch: %d %s", good.Code, good.Body.String())
	}
}

func TestAdminBootstrapBindsExpectedManagementIP(t *testing.T) {
	server, store, _, _ := testController(t)
	body := []byte(`{"site":"dc1","host":"host01","management_ip":"10.10.10.31","ttl_seconds":600}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/admin/bootstrap", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("bootstrap failed: %d %s", recorder.Code, recorder.Body.String())
	}
	state := store.Snapshot()
	if len(state.Bootstraps) != 1 {
		t.Fatalf("bootstrap count=%d", len(state.Bootstraps))
	}
	for _, value := range state.Bootstraps {
		if value.ExpectedManagementIP != "10.10.10.31" {
			t.Fatalf("management IP binding=%q", value.ExpectedManagementIP)
		}
	}
	bad := httptest.NewRequest(http.MethodPost, "/v1/admin/bootstrap", bytes.NewReader([]byte(`{"site":"dc1","host":"host02","management_ip":"invalid"}`)))
	bad.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	badRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(badRecorder, bad)
	if badRecorder.Code != http.StatusBadRequest {
		t.Fatalf("invalid IP accepted: %d", badRecorder.Code)
	}
}

func TestAdminEnrollmentSelfTestAllChecksPass(t *testing.T) {
	server, _, _, _ := testController(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/admin/enrollment-self-test", nil)
	req.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("self-test failed: %d %s", recorder.Code, recorder.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"wrong_site_rejected", "wrong_host_rejected", "wrong_management_ip_rejected", "correct_token_consumed", "token_replay_rejected", "expired_token_rejected"} {
		if result[key] != true {
			t.Fatalf("%s not proven: %#v", key, result)
		}
	}
}

func TestEnrollmentAndPollRecordDistinctLifecycleTimes(t *testing.T) {
	server, store, _, _ := testController(t)
	cert := enrollFixture(t, server, store, "dc1", "kvm01", "machine-lifecycle")
	before := store.Snapshot().Hosts[hostKey("dc1", "kvm01")]
	if before.EnrolledAt.IsZero() || before.BootstrapConsumedAt.IsZero() {
		t.Fatalf("enrollment lifecycle timestamps missing: %#v", before)
	}
	if !before.LastPollAt.IsZero() {
		t.Fatalf("last poll must be zero before first mTLS poll: %s", before.LastPollAt)
	}
	pollBody, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-poll/v1", "site": "dc1", "host": "kvm01", "inventory": inventory.Snapshot{Schema: "layersentry-agent-inventory/v3", MachineID: "machine-lifecycle"}})
	req := httptest.NewRequest(http.MethodPost, "/v1/agent/poll", bytes.NewReader(pollBody))
	req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("poll failed: %d %s", recorder.Code, recorder.Body.String())
	}
	after := store.Snapshot().Hosts[hostKey("dc1", "kvm01")]
	if after.LastPollAt.IsZero() || after.LastPollAt.Before(after.EnrolledAt) {
		t.Fatalf("mTLS poll timestamp missing/invalid: %#v", after)
	}
}

func TestControllerRecordsSealedRestartAndRebootEvidence(t *testing.T) {
	server, store, _, _ := testController(t)
	cert := enrollFixture(t, server, store, "dc1", "kvm01", "machine-audit")
	poll := func(inv inventory.Snapshot) {
		body, _ := json.Marshal(map[string]any{"schema": "layersentry-agent-poll/v1", "site": "dc1", "host": "kvm01", "inventory": inv})
		req := httptest.NewRequest(http.MethodPost, "/v1/agent/poll", bytes.NewReader(body))
		req.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusOK {
			t.Fatalf("poll failed: %d %s", recorder.Code, recorder.Body.String())
		}
	}
	base := inventory.Snapshot{Schema: "layersentry-agent-inventory/v3", MachineID: "machine-audit", BootID: "boot-1", Sealed: true, SealIntegrityOK: true, AgentSystemd: map[string]string{"InvocationID": "inv-1"}}
	poll(base)
	restarted := base
	restarted.AgentSystemd = map[string]string{"InvocationID": "inv-2"}
	poll(restarted)
	host := store.Snapshot().Hosts[hostKey("dc1", "kvm01")]
	if host.AgentRestartObservedAt.IsZero() {
		t.Fatal("same-boot sealed agent restart was not recorded")
	}
	rebooted := restarted
	rebooted.BootID = "boot-2"
	rebooted.AgentSystemd = map[string]string{"InvocationID": "inv-3"}
	poll(rebooted)
	host = store.Snapshot().Hosts[hostKey("dc1", "kvm01")]
	if host.RebootObservedAt.IsZero() {
		t.Fatal("sealed reboot with integrity before/after was not recorded")
	}
}
