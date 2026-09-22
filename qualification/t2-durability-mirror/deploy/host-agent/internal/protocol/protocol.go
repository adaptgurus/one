package protocol

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"
)

var operationIDRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

// Job is the only controller-to-agent execution primitive. Payload is data, not
// a shell command. The local privileged executor maps Action to a fixed handler.
type Job struct {
	Schema        string          `json:"schema"`
	OperationID   string          `json:"operation_id"`
	Site          string          `json:"site"`
	Host          string          `json:"host"`
	Action        string          `json:"action"`
	IssuedAt      time.Time       `json:"issued_at"`
	ExpiresAt     time.Time       `json:"expires_at"`
	Payload       json.RawMessage `json:"payload"`
	PayloadSHA256 string          `json:"payload_sha256"`
	Signature     string          `json:"signature"`
}

type signedJob struct {
	Schema        string          `json:"schema"`
	OperationID   string          `json:"operation_id"`
	Site          string          `json:"site"`
	Host          string          `json:"host"`
	Action        string          `json:"action"`
	IssuedAt      time.Time       `json:"issued_at"`
	ExpiresAt     time.Time       `json:"expires_at"`
	Payload       json.RawMessage `json:"payload"`
	PayloadSHA256 string          `json:"payload_sha256"`
}

func canonicalPayload(payload json.RawMessage) (json.RawMessage, error) {
	if len(payload) == 0 {
		return json.RawMessage("null"), nil
	}
	if !json.Valid(payload) {
		return nil, errors.New("job payload is not valid JSON")
	}
	var out bytes.Buffer
	if err := json.Compact(&out, payload); err != nil {
		return nil, err
	}
	return json.RawMessage(out.Bytes()), nil
}

func PayloadDigest(payload json.RawMessage) (string, error) {
	canonical, err := canonicalPayload(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

func (j Job) signingBytes() ([]byte, error) {
	canonical, err := canonicalPayload(j.Payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(signedJob{j.Schema, j.OperationID, j.Site, j.Host, j.Action, j.IssuedAt.UTC(), j.ExpiresAt.UTC(), canonical, j.PayloadSHA256})
}

// Sign normalizes the JSON payload before computing its digest and signature.
// This makes a job safe to persist/reload through JSON without invalidating the
// cryptographic envelope merely because insignificant payload whitespace changed.
func (j *Job) Sign(key ed25519.PrivateKey) error {
	if len(key) != ed25519.PrivateKeySize {
		return errors.New("invalid Ed25519 private key")
	}
	canonical, err := canonicalPayload(j.Payload)
	if err != nil {
		return err
	}
	j.Payload = canonical
	j.PayloadSHA256, err = PayloadDigest(canonical)
	if err != nil {
		return err
	}
	body, err := j.signingBytes()
	if err != nil {
		return err
	}
	j.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key, body))
	return nil
}

func (j Job) Verify(key ed25519.PublicKey, site, host string, now time.Time) error {
	if j.Schema != "layersentry-agent-job/v1" {
		return errors.New("unsupported job schema")
	}
	if !operationIDRE.MatchString(j.OperationID) {
		return errors.New("invalid operation ID")
	}
	if j.Site != site || j.Host != host {
		return errors.New("job site/host mismatch")
	}
	if now.Before(j.IssuedAt.Add(-2*time.Minute)) || !now.Before(j.ExpiresAt) || j.ExpiresAt.Sub(j.IssuedAt) > 30*time.Minute {
		return errors.New("job validity window rejected")
	}
	if !AllowedAction(j.Action) {
		return fmt.Errorf("action %q is not allowed", j.Action)
	}
	digest, err := PayloadDigest(j.Payload)
	if err != nil {
		return err
	}
	if digest != j.PayloadSHA256 {
		return errors.New("payload digest mismatch")
	}
	sig, err := base64.StdEncoding.DecodeString(j.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return errors.New("invalid job signature encoding")
	}
	body, err := j.signingBytes()
	if err != nil {
		return err
	}
	if !ed25519.Verify(key, body, sig) {
		return errors.New("job signature verification failed")
	}
	return nil
}

func AllowedAction(action string) bool {
	switch action {
	case "inventory.collect", "health.collect", "network.recommend", "diagnostics.collect", "tools.ensure", "repo.configure", "updates.apply", "host.seal", "agent.self-update",
		"nfs.verify", "block.verify", "nvme.verify", "ceph.verify", "network.topology.prepare", "network.topology.apply", "network.topology.verify", "network.topology.rollback",
		"network.preflight", "network.prepare", "network.apply", "network.verify", "network.rollback",
		"iscsi.inventory", "iscsi.configure", "iscsi.login", "iscsi.verify", "iscsi.logout",
		"multipath.inventory", "multipath.verify", "lvm.inventory", "lvmdevices.verify", "lvmdevices.configure", "lvm.system.initialize", "lvm.system.verify", "storage.verify":
		return true
	default:
		return false
	}
}

type Receipt struct {
	Schema      string    `json:"schema"`
	OperationID string    `json:"operation_id"`
	Host        string    `json:"host"`
	Action      string    `json:"action"`
	Status      string    `json:"status"`
	StartedAt   time.Time `json:"started_at"`
	FinishedAt  time.Time `json:"finished_at"`
	Detail      string    `json:"detail,omitempty"`
	Evidence    any       `json:"evidence,omitempty"`
}
