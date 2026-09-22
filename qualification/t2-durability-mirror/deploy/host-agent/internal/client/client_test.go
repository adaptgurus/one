package client

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateEnrollmentKeyPersistsAndReuses(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pki", "client.key")
	pub1, priv1, err := loadOrCreateEnrollmentKey(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() == 0 {
		t.Fatal("persisted enrollment key is empty")
	}
	pub2, priv2, err := loadOrCreateEnrollmentKey(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(pub1, pub2) || !bytes.Equal(priv1, priv2) {
		t.Fatal("enrollment key was regenerated instead of reused")
	}
}

func TestLoadOrCreateEnrollmentKeyRejectsMalformedExistingKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "client.key")
	if err := os.WriteFile(path, []byte("not-a-private-key"), 0o640); err != nil {
		t.Fatal(err)
	}
	if _, _, err := loadOrCreateEnrollmentKey(path); err == nil {
		t.Fatal("malformed existing enrollment key was accepted")
	}
}
