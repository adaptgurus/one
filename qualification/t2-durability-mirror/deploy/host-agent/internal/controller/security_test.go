package controller

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAdminStateRedactsBootstrapAndJobPayload(t *testing.T) {
	server, store, _, _ := testController(t)
	_ = enrollFixture(t, server, store, "dc1", "kvm01", "machine-1")

	bootstrapToken := "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if err := store.AddBootstrap("dc1", "kvm02", bootstrapToken, time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	secretMarker := "PRIVATE-REPO-PASSWORD-MUST-NOT-LEAK"
	jobBody, _ := json.Marshal(map[string]any{
		"operation_id": "repo-op-1",
		"site":         "dc1",
		"host":         "kvm01",
		"action":       "repo.configure",
		"payload":      map[string]any{"username": "repo-user", "password": secretMarker},
		"ttl_seconds":  60,
	})
	jobReq := httptest.NewRequest(http.MethodPost, "/v1/admin/jobs", bytes.NewReader(jobBody))
	jobReq.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	jobRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(jobRecorder, jobReq)
	if jobRecorder.Code != http.StatusCreated {
		t.Fatalf("queue job failed: %d %s", jobRecorder.Code, jobRecorder.Body.String())
	}

	stateReq := httptest.NewRequest(http.MethodGet, "/v1/admin/state", nil)
	stateReq.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	stateRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(stateRecorder, stateReq)
	if stateRecorder.Code != http.StatusOK {
		t.Fatalf("state request failed: %d", stateRecorder.Code)
	}
	body := stateRecorder.Body.String()
	if strings.Contains(body, bootstrapToken) || strings.Contains(body, tokenHash(bootstrapToken)) {
		t.Fatal("bootstrap token material leaked in admin state")
	}
	if strings.Contains(body, secretMarker) || strings.Contains(body, "\"payload\"") {
		t.Fatal("job payload leaked in admin state")
	}
}

func TestDisabledHostCannotPollOrReceiveNewJob(t *testing.T) {
	server, store, _, _ := testController(t)
	cert := enrollFixture(t, server, store, "dc1", "kvm01", "machine-1")
	if err := store.SetHostDisabled("dc1", "kvm01", true); err != nil {
		t.Fatal(err)
	}

	pollBody, _ := json.Marshal(map[string]any{
		"schema":    "layersentry-agent-poll/v1",
		"site":      "dc1",
		"host":      "kvm01",
		"inventory": map[string]any{"machine_id": "machine-1"},
	})
	pollReq := httptest.NewRequest(http.MethodPost, "/v1/agent/poll", bytes.NewReader(pollBody))
	pollReq.TLS = &tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}
	pollRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(pollRecorder, pollReq)
	if pollRecorder.Code != http.StatusForbidden {
		t.Fatalf("disabled host poll returned %d, want 403", pollRecorder.Code)
	}

	jobBody := []byte(`{"operation_id":"blocked-op","site":"dc1","host":"kvm01","action":"host.seal","payload":{},"ttl_seconds":60}`)
	jobReq := httptest.NewRequest(http.MethodPost, "/v1/admin/jobs", bytes.NewReader(jobBody))
	jobReq.Header.Set("Authorization", "Bearer TEST-TOKEN-ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	jobRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(jobRecorder, jobReq)
	if jobRecorder.Code != http.StatusConflict {
		t.Fatalf("job queued for disabled host: %d %s", jobRecorder.Code, jobRecorder.Body.String())
	}
}
