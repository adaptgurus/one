package controller

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
)

func TestControllerStateRetentionPrunesOldBootstrapAndJobs(t *testing.T) {
	store, err := OpenStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	consumed := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	unconsumed := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if err := store.AddBootstrap("dc1", "host1", consumed, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := store.ConsumeBootstrap(consumed, "dc1", "host1", now); err != nil {
		t.Fatal(err)
	}
	if err := store.AddBootstrap("dc1", "host2", unconsumed, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	job := protocol.Job{Schema: "layersentry-agent-job/v1", OperationID: "old-job", Site: "dc1", Host: "host1", Action: "tools.ensure", IssuedAt: now, ExpiresAt: now.Add(time.Hour), Payload: json.RawMessage(`{}`)}
	if err := store.Queue(job, now); err != nil {
		t.Fatal(err)
	}
	if err := store.Prune(now.Add(31 * 24 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	state := store.Snapshot()
	if len(state.Bootstraps) != 0 {
		t.Fatalf("old bootstrap records retained: %#v", state.Bootstraps)
	}
	if len(state.Jobs) != 0 {
		t.Fatalf("old job records retained: %#v", state.Jobs)
	}
}

func TestControllerStateRetentionKeepsRecentAuditRecords(t *testing.T) {
	store, err := OpenStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	token := "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if err := store.AddBootstrap("dc1", "host1", token, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := store.ConsumeBootstrap(token, "dc1", "host1", now); err != nil {
		t.Fatal(err)
	}
	job := protocol.Job{Schema: "layersentry-agent-job/v1", OperationID: "recent-job", Site: "dc1", Host: "host1", Action: "tools.ensure", IssuedAt: now, ExpiresAt: now.Add(time.Hour), Payload: json.RawMessage(`{}`)}
	if err := store.Queue(job, now); err != nil {
		t.Fatal(err)
	}
	if err := store.Prune(now.Add(12 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	state := store.Snapshot()
	if len(state.Bootstraps) != 1 || len(state.Jobs) != 1 {
		t.Fatalf("recent audit records pruned too early: %#v", state)
	}
}
