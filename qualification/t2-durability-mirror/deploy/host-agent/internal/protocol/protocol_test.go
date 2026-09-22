package protocol

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"testing"
	"time"
)

func signJob(t *testing.T, priv ed25519.PrivateKey, j *Job) {
	t.Helper()
	if err := j.Sign(priv); err != nil {
		t.Fatal(err)
	}
}

func TestJobVerify(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	payload, _ := json.Marshal(map[string]string{"mode": "safe"})
	j := Job{Schema: "layersentry-agent-job/v1", OperationID: "op-1", Site: "dc1", Host: "kvm01", Action: "host.seal", IssuedAt: now.Add(-time.Minute), ExpiresAt: now.Add(5 * time.Minute), Payload: payload}
	signJob(t, priv, &j)
	if err := j.Verify(pub, "dc1", "kvm01", now); err != nil {
		t.Fatal(err)
	}
	bad := j
	bad.Host = "kvm02"
	if err := bad.Verify(pub, "dc1", "kvm01", now); err == nil {
		t.Fatal("wrong host accepted")
	}
	expired := j
	expired.ExpiresAt = now.Add(-time.Second)
	signJob(t, priv, &expired)
	if err := expired.Verify(pub, "dc1", "kvm01", now); err == nil {
		t.Fatal("expired job accepted")
	}
}

func TestSignedJobSurvivesJSONPersistence(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	j := Job{
		Schema:      "layersentry-agent-job/v1",
		OperationID: "op-persist-1",
		Site:        "dc1",
		Host:        "kvm01",
		Action:      "network.prepare",
		IssuedAt:    now.Add(-time.Second),
		ExpiresAt:   now.Add(5 * time.Minute),
		Payload:     json.RawMessage("{ \n  \"mtu\": 9000, \"interface\": \"ens2\"\n}"),
	}
	if err := j.Sign(priv); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.MarshalIndent(j, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	var restored Job
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatal(err)
	}
	if err := restored.Verify(pub, "dc1", "kvm01", now); err != nil {
		t.Fatalf("persisted signed job no longer verifies: %v", err)
	}
}

func TestPayloadTamperRejected(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	j := Job{Schema: "layersentry-agent-job/v1", OperationID: "op-tamper", Site: "dc1", Host: "kvm01", Action: "host.seal", IssuedAt: now, ExpiresAt: now.Add(time.Minute), Payload: json.RawMessage(`{"mode":"safe"}`)}
	if err := j.Sign(priv); err != nil {
		t.Fatal(err)
	}
	j.Payload = json.RawMessage(`{"mode":"unsafe"}`)
	if err := j.Verify(pub, "dc1", "kvm01", now); err == nil {
		t.Fatal("tampered payload accepted")
	}
}

func TestSmartInstallerActionsAreTypedAndShellIsRejected(t *testing.T) {
	for _, action := range []string{"network.recommend", "diagnostics.collect", "tools.ensure"} {
		if !AllowedAction(action) {
			t.Fatalf("expected smart installer action %q to be allowed", action)
		}
	}
	for _, action := range []string{"shell", "command.run", "file.write"} {
		if AllowedAction(action) {
			t.Fatalf("generic remote execution action %q must remain rejected", action)
		}
	}
}
