package storagecheck

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
)

type Runner interface {
	Run(context.Context, string, ...string) (string, error)
}

var nfsCheckRoot = "/run/layersentry/nfs-check"

var (
	hostRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$`)
	nqnRE  = regexp.MustCompile(`^nqn\.[0-9]{4}-[0-9]{2}\.[A-Za-z0-9.-]+:[A-Za-z0-9._:+-]{1,192}$`)
	nameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$`)
)

type NFSRequest struct {
	Server  string `json:"server"`
	Export  string `json:"export"`
	Version string `json:"version,omitempty"`
}

type NVMeRequest struct {
	SubsystemNQN string `json:"subsystem_nqn"`
	MinPaths     int    `json:"min_paths,omitempty"`
	Transport    string `json:"transport,omitempty"`
}

type CephRequest struct {
	Cluster string `json:"cluster,omitempty"`
	Client  string `json:"client"`
	Pool    string `json:"pool"`
}

func validateServer(value string) error {
	if ip := net.ParseIP(value); ip != nil {
		return nil
	}
	if !hostRE.MatchString(value) || strings.HasPrefix(value, "-") {
		return errors.New("invalid storage server")
	}
	return nil
}

func VerifyNFS(ctx context.Context, req NFSRequest, runner Runner) (map[string]any, error) {
	if err := validateServer(req.Server); err != nil {
		return nil, err
	}
	if req.Export == "" || !strings.HasPrefix(req.Export, "/") || path.Clean(req.Export) != req.Export || strings.ContainsAny(req.Export, "\x00\r\n\t") {
		return nil, errors.New("NFS export must be a clean absolute path")
	}
	version := req.Version
	if version == "" {
		version = "4.2"
	}
	if version != "3" && version != "4.1" && version != "4.2" {
		return nil, errors.New("NFS version must be 3, 4.1 or 4.2")
	}
	root := nfsCheckRoot
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(root, "verify-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	source := req.Server + ":" + req.Export
	options := "ro,nosuid,nodev,vers=" + version
	if _, err := runner.Run(ctx, "mount", "-t", "nfs", "-o", options, source, dir); err != nil {
		return nil, err
	}
	defer runner.Run(context.Background(), "umount", dir)
	out, err := runner.Run(ctx, "findmnt", "-J", "-T", dir, "-o", "TARGET,SOURCE,FSTYPE,OPTIONS")
	if err != nil {
		return nil, err
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(out), &parsed) != nil {
		return nil, errors.New("NFS verification returned invalid JSON")
	}
	return map[string]any{"server": req.Server, "export": req.Export, "version": version, "reachable": true, "mount": parsed}, nil
}

type nvmeDocument struct {
	Subsystems []map[string]any `json:"Subsystems"`
}

func VerifyNVMe(ctx context.Context, req NVMeRequest, runner Runner) (map[string]any, error) {
	if !nqnRE.MatchString(req.SubsystemNQN) {
		return nil, errors.New("invalid NVMe subsystem NQN")
	}
	if req.MinPaths == 0 {
		req.MinPaths = 2
	}
	if req.MinPaths < 1 || req.MinPaths > 64 {
		return nil, errors.New("NVMe min_paths must be 1..64")
	}
	if req.Transport != "" && req.Transport != "tcp" && req.Transport != "rdma" {
		return nil, errors.New("NVMe transport must be tcp or rdma")
	}
	out, err := runner.Run(ctx, "nvme", "list-subsys", "-o", "json")
	if err != nil {
		return nil, err
	}
	var doc nvmeDocument
	if err := json.Unmarshal([]byte(out), &doc); err != nil {
		return nil, fmt.Errorf("decode nvme list-subsys: %w", err)
	}
	current := ""
	count := 0
	transports := map[string]int{}
	for _, row := range doc.Subsystems {
		if nqn, ok := row["NQN"].(string); ok && nqn != "" {
			current = nqn
			continue
		}
		paths, ok := row["Paths"].([]any)
		if !ok || current != req.SubsystemNQN {
			continue
		}
		for _, raw := range paths {
			path, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			transport, _ := path["Transport"].(string)
			if req.Transport != "" && transport != req.Transport {
				continue
			}
			count++
			transports[transport]++
		}
	}
	if count < req.MinPaths {
		return nil, fmt.Errorf("NVMe subsystem has %d qualifying paths, require at least %d", count, req.MinPaths)
	}
	return map[string]any{"subsystem_nqn": req.SubsystemNQN, "paths": count, "min_paths": req.MinPaths, "transports": transports}, nil
}

func VerifyCeph(ctx context.Context, req CephRequest, runner Runner) (map[string]any, error) {
	cluster := req.Cluster
	if cluster == "" {
		cluster = "ceph"
	}
	if !nameRE.MatchString(cluster) || !nameRE.MatchString(req.Client) || !nameRE.MatchString(req.Pool) {
		return nil, errors.New("invalid Ceph cluster/client/pool name")
	}
	healthRaw, err := runner.Run(ctx, "ceph", "--cluster", cluster, "--id", req.Client, "health", "--format", "json")
	if err != nil {
		return nil, err
	}
	var health map[string]any
	if json.Unmarshal([]byte(healthRaw), &health) != nil {
		return nil, errors.New("Ceph health returned invalid JSON")
	}
	poolsRaw, err := runner.Run(ctx, "ceph", "--cluster", cluster, "--id", req.Client, "osd", "pool", "ls", "--format", "json")
	if err != nil {
		return nil, err
	}
	var pools []string
	if json.Unmarshal([]byte(poolsRaw), &pools) != nil {
		return nil, errors.New("Ceph pool list returned invalid JSON")
	}
	found := false
	for _, pool := range pools {
		if pool == req.Pool {
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("Ceph pool %s is not visible to configured client", req.Pool)
	}
	return map[string]any{"cluster": cluster, "client": req.Client, "pool": req.Pool, "health": health, "pool_visible": true}, nil
}

func Port(value string) (int, error) {
	v, err := strconv.Atoi(value)
	if err != nil || v < 1 || v > 65535 {
		return 0, errors.New("invalid port")
	}
	return v, nil
}
