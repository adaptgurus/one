package storagecheck

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type fakeRunner struct{ calls []string }

func (r *fakeRunner) Run(_ context.Context, name string, args ...string) (string, error) {
	call := name + " " + strings.Join(args, " ")
	r.calls = append(r.calls, call)
	switch name {
	case "mount":
		return "", nil
	case "umount":
		return "", nil
	case "findmnt":
		return `{"filesystems":[{"target":"/tmp/x","source":"10.0.0.10:/images","fstype":"nfs4","options":"ro"}]}`, nil
	case "nvme":
		return `{"Subsystems":[{"Name":"nvme-subsys0","NQN":"nqn.2026-09.io.layersentry:prod"},{"Paths":[{"Name":"nvme0","Transport":"rdma"},{"Name":"nvme1","Transport":"rdma"}]}]}`, nil
	case "ceph":
		if strings.Contains(call, " health ") {
			return `{"status":"HEALTH_OK"}`, nil
		}
		if strings.Contains(call, " osd pool ls ") {
			return `["prod","images"]`, nil
		}
	}
	return "", errors.New("unexpected command: " + call)
}

func TestNFSVerifyUsesFixedReadOnlyOptions(t *testing.T) {
	old := nfsCheckRoot
	nfsCheckRoot = t.TempDir()
	defer func() { nfsCheckRoot = old }()
	r := &fakeRunner{}
	result, err := VerifyNFS(context.Background(), NFSRequest{Server: "10.0.0.10", Export: "/images", Version: "4.2"}, r)
	if err != nil {
		t.Fatal(err)
	}
	if result["reachable"] != true {
		t.Fatal("NFS not marked reachable")
	}
	joined := strings.Join(r.calls, "\n")
	if !strings.Contains(joined, "ro,nosuid,nodev,vers=4.2") {
		t.Fatalf("unsafe mount options: %s", joined)
	}
}

func TestNFSRejectsUnsafeServerAndExport(t *testing.T) {
	old := nfsCheckRoot
	nfsCheckRoot = t.TempDir()
	defer func() { nfsCheckRoot = old }()
	for _, req := range []NFSRequest{
		{Server: "10.0.0.10;id", Export: "/images"},
		{Server: "10.0.0.10", Export: "images"},
		{Server: "10.0.0.10", Export: "/images/../etc"},
		{Server: "10.0.0.10", Export: "/images", Version: "9"},
	} {
		if _, err := VerifyNFS(context.Background(), req, &fakeRunner{}); err == nil {
			t.Fatalf("unsafe NFS request accepted: %+v", req)
		}
	}
}

func TestNVMeVerifyExactNQNPathCountAndTransport(t *testing.T) {
	r := &fakeRunner{}
	result, err := VerifyNVMe(context.Background(), NVMeRequest{SubsystemNQN: "nqn.2026-09.io.layersentry:prod", MinPaths: 2, Transport: "rdma"}, r)
	if err != nil {
		t.Fatal(err)
	}
	if result["paths"] != 2 {
		t.Fatalf("paths=%v", result["paths"])
	}
	if _, err := VerifyNVMe(context.Background(), NVMeRequest{SubsystemNQN: "nqn.2026-09.io.layersentry:other", MinPaths: 1}, r); err == nil {
		t.Fatal("wrong NQN accepted")
	}
	if _, err := VerifyNVMe(context.Background(), NVMeRequest{SubsystemNQN: "nqn.2026-09.io.layersentry:prod", MinPaths: 3}, r); err == nil {
		t.Fatal("insufficient paths accepted")
	}
}

func TestCephVerifyUsesLocalClientAndExactPool(t *testing.T) {
	r := &fakeRunner{}
	result, err := VerifyCeph(context.Background(), CephRequest{Cluster: "ceph", Client: "layersentry", Pool: "prod"}, r)
	if err != nil {
		t.Fatal(err)
	}
	if result["pool_visible"] != true {
		t.Fatal("pool not visible")
	}
	joined := strings.Join(r.calls, "\n")
	if !strings.Contains(joined, "--id layersentry") {
		t.Fatalf("client id missing: %s", joined)
	}
	if _, err := VerifyCeph(context.Background(), CephRequest{Cluster: "ceph", Client: "bad;id", Pool: "prod"}, r); err == nil {
		t.Fatal("unsafe ceph client accepted")
	}
}
