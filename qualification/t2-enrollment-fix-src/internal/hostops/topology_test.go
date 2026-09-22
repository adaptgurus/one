package hostops

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/topology"
)

type topologyRunner struct {
	calls    []string
	state    []byte
	failPing bool
}

func (r *topologyRunner) Run(_ context.Context, name string, args ...string) (string, error) {
	call := name + " " + strings.Join(args, " ")
	r.calls = append(r.calls, call)
	if name == "nmcli" && len(args) >= 5 && args[0] == "-g" {
		iface := args[len(args)-1]
		return "/org/freedesktop/NetworkManager/Devices/" + strings.TrimPrefix(iface, "eno"), nil
	}
	if name == "busctl" && strings.Contains(call, "CheckpointCreate") {
		return `o "/org/freedesktop/NetworkManager/Checkpoint/42"`, nil
	}
	if name == "nmstatectl" && len(args) == 1 && args[0] == "version" {
		return "2.2.0", nil
	}
	if name == "nmstatectl" && len(args) == 2 && args[0] == "apply" {
		body, err := os.ReadFile(args[1])
		if err != nil {
			return "", err
		}
		if !json.Valid(body) {
			return "", errors.New("invalid nmstate JSON")
		}
		r.state = append([]byte(nil), body...)
		return "applied", nil
	}
	if name == "ip" && len(args) >= 4 && args[0] == "link" && args[1] == "show" {
		return "state UP", nil
	}
	if name == "ping" {
		if r.failPing {
			return "", errors.New("unreachable")
		}
		return "1 packets transmitted, 1 received", nil
	}
	if name == "busctl" && (strings.Contains(call, "CheckpointDestroy") || strings.Contains(call, "CheckpointRollback")) {
		return "ok", nil
	}
	return "", errors.New("unexpected command: " + call)
}

func hostTopologyRequest() topology.Request {
	return topology.Request{TimeoutSeconds: 180, RequiredTargets: []string{"10.10.10.1"}, Fabrics: []topology.Fabric{
		{Role: "management", Interfaces: []string{"eno1", "eno2"}, BondMode: "active-backup", Address: "10.10.10.31/24", Gateway: "10.10.10.1", VLAN: 10, MTU: 1500},
		{Role: "workload", Interfaces: []string{"eno3", "eno4"}, BondMode: "active-backup", MTU: 9000},
		{Role: "storage_a", Interfaces: []string{"eno5"}, Address: "10.10.30.31/24", VLAN: 30, MTU: 9000},
		{Role: "storage_b", Interfaces: []string{"eno6"}, Address: "10.10.31.31/24", VLAN: 31, MTU: 9000},
		{Role: "migration", SharedWith: "workload", Address: "10.10.20.31/24", VLAN: 20, MTU: 9000},
	}}
}

func TestTopologyPrepareApplyVerifyCommitsCheckpoint(t *testing.T) {
	oldRoot := checkpointRoot
	checkpointRoot = t.TempDir()
	defer func() { checkpointRoot = oldRoot }()
	runner := &topologyRunner{}
	req := hostTopologyRequest()
	if _, err := topologyPrepare(context.Background(), "topology-1", req, runner); err != nil {
		t.Fatal(err)
	}
	req.CheckpointOperationID = "topology-1"
	if _, err := topologyApply(context.Background(), req, runner); err != nil {
		t.Fatal(err)
	}
	if !json.Valid(runner.state) || bytesContains(runner.state, []byte("shell")) {
		t.Fatal("unsafe/invalid nmstate payload")
	}
	if _, err := topologyVerify(context.Background(), req, runner); err != nil {
		t.Fatal(err)
	}
	file, _ := checkpointFile("topology-1")
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf("checkpoint not removed: %v", err)
	}
	joined := strings.Join(runner.calls, "\n")
	for _, expected := range []string{"CheckpointCreate", "nmstatectl apply", "ping -c 1 -W 2 10.10.10.1", "CheckpointDestroy"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("missing call %s\n%s", expected, joined)
		}
	}
}

func bytesContains(body, needle []byte) bool { return strings.Contains(string(body), string(needle)) }

func TestTopologyVerifyFailureKeepsCheckpointForAutomaticRollback(t *testing.T) {
	oldRoot := checkpointRoot
	checkpointRoot = t.TempDir()
	defer func() { checkpointRoot = oldRoot }()
	runner := &topologyRunner{failPing: true}
	req := hostTopologyRequest()
	if _, err := topologyPrepare(context.Background(), "topology-2", req, runner); err != nil {
		t.Fatal(err)
	}
	req.CheckpointOperationID = "topology-2"
	if _, err := topologyVerify(context.Background(), req, runner); err == nil {
		t.Fatal("unreachable required target was accepted")
	}
	file, _ := checkpointFile("topology-2")
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("checkpoint should remain armed: %v", err)
	}
}

func TestTopologyExplicitRollbackRemovesCheckpoint(t *testing.T) {
	oldRoot := checkpointRoot
	checkpointRoot = t.TempDir()
	defer func() { checkpointRoot = oldRoot }()
	runner := &topologyRunner{}
	req := hostTopologyRequest()
	if _, err := topologyPrepare(context.Background(), "topology-3", req, runner); err != nil {
		t.Fatal(err)
	}
	req.CheckpointOperationID = "topology-3"
	if _, err := topologyRollback(context.Background(), req, runner); err != nil {
		t.Fatal(err)
	}
	file, _ := checkpointFile("topology-3")
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatalf("checkpoint remains after rollback: %v", err)
	}
	if !strings.Contains(strings.Join(runner.calls, "\n"), "CheckpointRollback") {
		t.Fatal("rollback DBus call missing")
	}
}

func TestTopologyActionRejectsRawDesiredStateField(t *testing.T) {
	payload := json.RawMessage(`{"fabrics":[],"desired_state":{"shell":"id"}}`)
	if _, err := Execute(context.Background(), "topology-x", "network.topology.prepare", payload, &topologyRunner{}); err == nil {
		t.Fatal("controller-supplied raw desired state field was accepted")
	}
}

func TestTopologyApplyRequiresMatchingPreparedInterfaceSet(t *testing.T) {
	oldRoot := checkpointRoot
	checkpointRoot = t.TempDir()
	defer func() { checkpointRoot = oldRoot }()
	if err := saveTopologyCheckpoint("topology-4", "/org/freedesktop/NetworkManager/Checkpoint/9", []string{"eno99"}); err != nil {
		t.Fatal(err)
	}
	req := hostTopologyRequest()
	req.CheckpointOperationID = "topology-4"
	if _, err := topologyApply(context.Background(), req, &topologyRunner{}); err == nil {
		t.Fatal("mismatched checkpoint interface set was accepted")
	}
}

var _ = filepath.Join
