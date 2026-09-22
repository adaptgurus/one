package hostops

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/storagecheck"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/topology"
)

var checkpointRoot = "/var/lib/layersentry/agent-root/network-checkpoints"

var (
	ifaceRE = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,32}$`)
	uuidRE  = regexp.MustCompile(`^[0-9A-Fa-f-]{36}$`)
	iqnRE   = regexp.MustCompile(`^iqn\.[0-9]{4}-[0-9]{2}\.[A-Za-z0-9.-]+:[A-Za-z0-9._:+-]{1,192}$`)
	wwidRE  = regexp.MustCompile(`^[A-Za-z0-9._:+-]{8,192}$`)
	dbusRE  = regexp.MustCompile(`^/org/freedesktop/NetworkManager/Checkpoint/[0-9]+$`)
)

type Runner interface {
	Run(context.Context, string, ...string) (string, error)
}

type ExecRunner struct{}

func (ExecRunner) Run(parent context.Context, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return strings.TrimSpace(stdout.String()), fmt.Errorf("%s: %w: %s", name, err, bounded(stderr.String()))
	}
	return strings.TrimSpace(stdout.String()), nil
}

type NetworkRequest struct {
	Interface             string   `json:"interface"`
	ConnectionUUID        string   `json:"connection_uuid,omitempty"`
	CheckpointOperationID string   `json:"checkpoint_operation_id,omitempty"`
	TimeoutSeconds        uint32   `json:"timeout_seconds,omitempty"`
	IPv4Address           string   `json:"ipv4_address,omitempty"`
	Gateway               string   `json:"gateway,omitempty"`
	DNS                   []string `json:"dns,omitempty"`
	MTU                   int      `json:"mtu,omitempty"`
	RequiredTargets       []string `json:"required_targets,omitempty"`
}

type ISCSIRequest struct {
	TargetIQN string `json:"target_iqn"`
	Portal    string `json:"portal"`
	Interface string `json:"interface,omitempty"`
	AuthMode  string `json:"auth_mode,omitempty"`
}

type MultipathRequest struct {
	WWID     string `json:"wwid"`
	MinPaths int    `json:"min_paths,omitempty"`
}

type LVMRequest struct {
	WWID string `json:"wwid"`
}

type LVMSystemRequest struct {
	WWID        string `json:"wwid"`
	DatastoreID int    `json:"datastore_id"`
}

type DiagnosticsRequest struct {
	Scopes []string `json:"scopes,omitempty"`
}

func Execute(ctx context.Context, operationID, action string, payload json.RawMessage, runner Runner) (any, error) {
	if runner == nil {
		runner = ExecRunner{}
	}
	switch action {
	case "nfs.verify":
		var req storagecheck.NFSRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return storagecheck.VerifyNFS(ctx, req, runner)
	case "nvme.verify":
		var req storagecheck.NVMeRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return storagecheck.VerifyNVMe(ctx, req, runner)
	case "ceph.verify":
		var req storagecheck.CephRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return storagecheck.VerifyCeph(ctx, req, runner)
	case "block.verify":
		var req MultipathRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return multipathVerify(ctx, req, runner)
	case "network.topology.prepare":
		var req topology.Request
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return topologyPrepare(ctx, operationID, req, runner)
	case "network.topology.apply":
		var req topology.Request
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return topologyApply(ctx, req, runner)
	case "network.topology.verify":
		var req topology.Request
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return topologyVerify(ctx, req, runner)
	case "network.topology.rollback":
		var req topology.Request
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return topologyRollback(ctx, req, runner)
	case "diagnostics.collect":
		var req DiagnosticsRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return diagnosticsCollect(ctx, req, runner)
	case "network.preflight":
		var req NetworkRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return networkPreflight(ctx, req, runner)
	case "network.prepare":
		var req NetworkRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return networkPrepare(ctx, operationID, req, runner)
	case "network.apply":
		var req NetworkRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return networkApply(ctx, req, runner)
	case "network.verify":
		var req NetworkRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return networkVerify(ctx, req, runner)
	case "network.rollback":
		var req NetworkRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return networkRollback(ctx, req, runner)
	case "iscsi.inventory":
		return commandEvidence(ctx, runner, "iscsiadm", "-m", "session", "-P", "1")
	case "iscsi.configure":
		var req ISCSIRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return iscsiConfigure(ctx, req, runner)
	case "iscsi.login":
		var req ISCSIRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return iscsiLogin(ctx, req, false, runner)
	case "iscsi.logout":
		var req ISCSIRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return iscsiLogin(ctx, req, true, runner)
	case "iscsi.verify":
		var req ISCSIRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return iscsiVerify(ctx, req, runner)
	case "multipath.inventory":
		return commandEvidence(ctx, runner, "multipath", "-ll")
	case "multipath.verify":
		var req MultipathRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return multipathVerify(ctx, req, runner)
	case "lvm.inventory":
		return lvmInventory(ctx, runner)
	case "lvmdevices.verify":
		var req LVMRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return lvmDevices(ctx, req, false, runner)
	case "lvmdevices.configure":
		var req LVMRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return lvmDevices(ctx, req, true, runner)
	case "lvm.system.initialize":
		var req LVMSystemRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return lvmSystem(ctx, req, true, runner)
	case "lvm.system.verify":
		var req LVMSystemRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		return lvmSystem(ctx, req, false, runner)
	case "storage.verify":
		var req MultipathRequest
		if err := decode(payload, &req); err != nil {
			return nil, err
		}
		mp, err := multipathVerify(ctx, req, runner)
		if err != nil {
			return nil, err
		}
		lvm, err := lvmDevices(ctx, LVMRequest{WWID: req.WWID}, false, runner)
		if err != nil {
			return nil, err
		}
		return map[string]any{"multipath": mp, "lvmdevices": lvm}, nil
	default:
		return nil, fmt.Errorf("unsupported typed host operation %q", action)
	}
}

func decode(payload json.RawMessage, out any) error {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	return nil
}

func validateInterface(value string) error {
	if !ifaceRE.MatchString(value) || strings.HasPrefix(value, "-") {
		return errors.New("invalid interface")
	}
	return nil
}

func networkPreflight(ctx context.Context, req NetworkRequest, runner Runner) (any, error) {
	if err := validateInterface(req.Interface); err != nil {
		return nil, err
	}
	state, err := runner.Run(ctx, "nmcli", "-g", "GENERAL.STATE,GENERAL.CONNECTION,GENERAL.DBUS-PATH", "device", "show", req.Interface)
	if err != nil {
		return nil, err
	}
	links, _ := runner.Run(ctx, "ip", "-j", "link", "show", "dev", req.Interface)
	addresses, _ := runner.Run(ctx, "ip", "-j", "addr", "show", "dev", req.Interface)
	return map[string]any{"interface": req.Interface, "nm_state": state, "links": rawJSONOrString(links), "addresses": rawJSONOrString(addresses)}, nil
}

func networkPrepare(ctx context.Context, operationID string, req NetworkRequest, runner Runner) (any, error) {
	if err := validateInterface(req.Interface); err != nil {
		return nil, err
	}
	if operationID == "" || strings.ContainsAny(operationID, `/\\`) {
		return nil, errors.New("invalid operation ID")
	}
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 180
	}
	if req.TimeoutSeconds < 30 || req.TimeoutSeconds > 900 {
		return nil, errors.New("network checkpoint timeout outside allowed range")
	}
	pathText, err := runner.Run(ctx, "nmcli", "-g", "GENERAL.DBUS-PATH", "device", "show", req.Interface)
	if err != nil {
		return nil, err
	}
	devicePath := strings.TrimSpace(strings.Split(pathText, "\n")[0])
	if !strings.HasPrefix(devicePath, "/org/freedesktop/NetworkManager/Devices/") {
		return nil, errors.New("NetworkManager device path rejected")
	}
	out, err := runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointCreate", "aouu", "1", devicePath, strconv.FormatUint(uint64(req.TimeoutSeconds), 10), "2")
	if err != nil {
		return nil, err
	}
	checkpoint := parseObjectPath(out)
	if !dbusRE.MatchString(checkpoint) {
		return nil, errors.New("invalid NetworkManager checkpoint response")
	}
	if err := saveCheckpoint(operationID, checkpoint, req.Interface); err != nil {
		return nil, err
	}
	return map[string]any{"checkpoint_operation_id": operationID, "checkpoint": checkpoint, "interface": req.Interface, "timeout_seconds": req.TimeoutSeconds}, nil
}

func networkApply(ctx context.Context, req NetworkRequest, runner Runner) (any, error) {
	if err := validateInterface(req.Interface); err != nil {
		return nil, err
	}
	if !uuidRE.MatchString(req.ConnectionUUID) {
		return nil, errors.New("connection UUID rejected")
	}
	if req.CheckpointOperationID == "" {
		return nil, errors.New("checkpoint_operation_id required")
	}
	checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
	if err != nil {
		return nil, err
	}
	if checkpoint.Interface != req.Interface {
		return nil, errors.New("checkpoint interface mismatch")
	}
	args := []string{"connection", "modify", "uuid", req.ConnectionUUID}
	if req.IPv4Address != "" {
		if _, _, err := net.ParseCIDR(req.IPv4Address); err != nil {
			return nil, errors.New("invalid IPv4 address/CIDR")
		}
		args = append(args, "ipv4.method", "manual", "ipv4.addresses", req.IPv4Address)
	}
	if req.Gateway != "" {
		if ip := net.ParseIP(req.Gateway); ip == nil || ip.To4() == nil {
			return nil, errors.New("invalid IPv4 gateway")
		}
		args = append(args, "ipv4.gateway", req.Gateway)
	}
	if len(req.DNS) > 0 {
		if len(req.DNS) > 4 {
			return nil, errors.New("too many DNS servers")
		}
		for _, value := range req.DNS {
			if net.ParseIP(value) == nil {
				return nil, errors.New("invalid DNS address")
			}
		}
		args = append(args, "ipv4.dns", strings.Join(req.DNS, ","))
	}
	if req.MTU != 0 {
		if req.MTU < 576 || req.MTU > 9216 {
			return nil, errors.New("MTU outside allowed range")
		}
		args = append(args, "802-3-ethernet.mtu", strconv.Itoa(req.MTU))
	}
	if len(args) == 4 {
		return nil, errors.New("network.apply contains no approved changes")
	}
	if _, err := runner.Run(ctx, "nmcli", args...); err != nil {
		return nil, err
	}
	if _, err := runner.Run(ctx, "nmcli", "connection", "up", "uuid", req.ConnectionUUID, "ifname", req.Interface); err != nil {
		return nil, err
	}
	return networkPreflight(ctx, req, runner)
}

func networkVerify(ctx context.Context, req NetworkRequest, runner Runner) (any, error) {
	evidence, err := networkPreflight(ctx, req, runner)
	if err != nil {
		return nil, err
	}
	if len(req.RequiredTargets) > 32 {
		return nil, errors.New("too many network verification targets")
	}
	results := map[string]string{}
	for _, target := range req.RequiredTargets {
		if !safeTarget(target) {
			return nil, fmt.Errorf("invalid verification target %q", target)
		}
		out, err := runner.Run(ctx, "ping", "-c", "1", "-W", "2", target)
		if err != nil {
			return nil, fmt.Errorf("required target %s unreachable: %w", target, err)
		}
		results[target] = bounded(out)
	}
	if req.CheckpointOperationID != "" {
		checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
		if err != nil {
			return nil, err
		}
		if checkpoint.Interface != req.Interface {
			return nil, errors.New("checkpoint interface mismatch")
		}
		if _, err := runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointDestroy", "o", checkpoint.Path); err != nil {
			return nil, err
		}
		_ = removeCheckpoint(req.CheckpointOperationID)
	}
	return map[string]any{"preflight": evidence, "reachability": results, "checkpoint_committed": req.CheckpointOperationID != ""}, nil
}

func networkRollback(ctx context.Context, req NetworkRequest, runner Runner) (any, error) {
	if req.CheckpointOperationID == "" {
		return nil, errors.New("checkpoint_operation_id required")
	}
	checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
	if err != nil {
		return nil, err
	}
	out, err := runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointRollback", "o", checkpoint.Path)
	if err != nil {
		return nil, err
	}
	_, _ = runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointDestroy", "o", checkpoint.Path)
	_ = removeCheckpoint(req.CheckpointOperationID)
	return map[string]any{"checkpoint_operation_id": req.CheckpointOperationID, "rollback": bounded(out)}, nil
}

func topologyPrepare(ctx context.Context, operationID string, req topology.Request, runner Runner) (any, error) {
	rendered, err := topology.Render(req)
	if err != nil {
		return nil, err
	}
	if operationID == "" || strings.ContainsAny(operationID, `/\\`) {
		return nil, errors.New("invalid operation ID")
	}
	timeout := req.TimeoutSeconds
	if timeout == 0 {
		timeout = 180
	}
	if timeout < 30 || timeout > 900 {
		return nil, errors.New("network checkpoint timeout outside allowed range")
	}
	paths := make([]string, 0, len(rendered.PhysicalInterfaces))
	for _, iface := range rendered.PhysicalInterfaces {
		text, err := runner.Run(ctx, "nmcli", "-g", "GENERAL.DBUS-PATH", "device", "show", iface)
		if err != nil {
			return nil, err
		}
		path := strings.TrimSpace(strings.Split(text, "\n")[0])
		if !strings.HasPrefix(path, "/org/freedesktop/NetworkManager/Devices/") {
			return nil, errors.New("NetworkManager device path rejected")
		}
		paths = append(paths, path)
	}
	args := []string{"call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointCreate", "aouu", strconv.Itoa(len(paths))}
	args = append(args, paths...)
	args = append(args, strconv.FormatUint(uint64(timeout), 10), "2")
	out, err := runner.Run(ctx, "busctl", args...)
	if err != nil {
		return nil, err
	}
	checkpoint := parseObjectPath(out)
	if !dbusRE.MatchString(checkpoint) {
		return nil, errors.New("invalid NetworkManager checkpoint response")
	}
	if err := saveTopologyCheckpoint(operationID, checkpoint, rendered.PhysicalInterfaces); err != nil {
		return nil, err
	}
	return map[string]any{"checkpoint_operation_id": operationID, "interfaces": rendered.PhysicalInterfaces, "timeout_seconds": timeout}, nil
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	aa := append([]string(nil), a...)
	bb := append([]string(nil), b...)
	sort.Strings(aa)
	sort.Strings(bb)
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}

func topologyApply(ctx context.Context, req topology.Request, runner Runner) (any, error) {
	if req.CheckpointOperationID == "" {
		return nil, errors.New("checkpoint_operation_id required")
	}
	rendered, err := topology.Render(req)
	if err != nil {
		return nil, err
	}
	checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
	if err != nil {
		return nil, err
	}
	if !sameStrings(checkpoint.Interfaces, rendered.PhysicalInterfaces) {
		return nil, errors.New("topology checkpoint interface set mismatch")
	}
	if _, err := runner.Run(ctx, "nmstatectl", "version"); err != nil {
		return nil, errors.New("nmstatectl is required before topology apply")
	}
	tmp, err := os.CreateTemp("", "layersentry-nmstate-*.json")
	if err != nil {
		return nil, err
	}
	path := tmp.Name()
	defer os.Remove(path)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return nil, err
	}
	if _, err := tmp.Write(rendered.Nmstate); err != nil {
		tmp.Close()
		return nil, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}
	out, err := runner.Run(ctx, "nmstatectl", "apply", path)
	if err != nil {
		return nil, err
	}
	return map[string]any{"result_interfaces": rendered.ResultInterfaces, "nmstate_result": bounded(out)}, nil
}

func topologyVerify(ctx context.Context, req topology.Request, runner Runner) (any, error) {
	if req.CheckpointOperationID == "" {
		return nil, errors.New("checkpoint_operation_id required")
	}
	rendered, err := topology.Render(req)
	if err != nil {
		return nil, err
	}
	checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
	if err != nil {
		return nil, err
	}
	if !sameStrings(checkpoint.Interfaces, rendered.PhysicalInterfaces) {
		return nil, errors.New("topology checkpoint interface set mismatch")
	}
	interfaces := map[string]string{}
	for role, iface := range rendered.ResultInterfaces {
		out, err := runner.Run(ctx, "ip", "link", "show", "dev", iface)
		if err != nil {
			return nil, fmt.Errorf("%s interface %s is not up/present: %w", role, iface, err)
		}
		interfaces[role] = bounded(out)
	}
	if len(req.RequiredTargets) > 32 {
		return nil, errors.New("too many network verification targets")
	}
	reachability := map[string]string{}
	for _, target := range req.RequiredTargets {
		if !safeTarget(target) {
			return nil, fmt.Errorf("invalid verification target %q", target)
		}
		out, err := runner.Run(ctx, "ping", "-c", "1", "-W", "2", target)
		if err != nil {
			return nil, fmt.Errorf("required target %s unreachable: %w", target, err)
		}
		reachability[target] = bounded(out)
	}
	if _, err := runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointDestroy", "o", checkpoint.Path); err != nil {
		return nil, err
	}
	_ = removeCheckpoint(req.CheckpointOperationID)
	return map[string]any{"interfaces": interfaces, "reachability": reachability, "checkpoint_committed": true}, nil
}

func topologyRollback(ctx context.Context, req topology.Request, runner Runner) (any, error) {
	if req.CheckpointOperationID == "" {
		return nil, errors.New("checkpoint_operation_id required")
	}
	checkpoint, err := loadCheckpoint(req.CheckpointOperationID)
	if err != nil {
		return nil, err
	}
	out, err := runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointRollback", "o", checkpoint.Path)
	if err != nil {
		return nil, err
	}
	_, _ = runner.Run(ctx, "busctl", "call", "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "CheckpointDestroy", "o", checkpoint.Path)
	_ = removeCheckpoint(req.CheckpointOperationID)
	return map[string]any{"checkpoint_operation_id": req.CheckpointOperationID, "rollback": bounded(out)}, nil
}

func validateISCSI(req ISCSIRequest) error {
	if !iqnRE.MatchString(req.TargetIQN) {
		return errors.New("target IQN rejected")
	}
	if req.AuthMode != "" && req.AuthMode != "none" {
		return errors.New("CHAP credentials require the separate approved secret-delivery path")
	}
	if req.Interface != "" {
		if err := validateInterface(req.Interface); err != nil {
			return err
		}
	}
	host, port, err := net.SplitHostPort(req.Portal)
	if err != nil || host == "" || port == "" {
		return errors.New("portal must be host:port")
	}
	p, err := strconv.Atoi(port)
	if err != nil || p < 1 || p > 65535 {
		return errors.New("invalid portal port")
	}
	if strings.HasPrefix(host, "-") {
		return errors.New("invalid portal host")
	}
	return nil
}

func iscsiArgs(req ISCSIRequest) []string {
	args := []string{"-m", "node", "-T", req.TargetIQN, "-p", req.Portal}
	if req.Interface != "" {
		args = append(args, "-I", req.Interface)
	}
	return args
}

func iscsiConfigure(ctx context.Context, req ISCSIRequest, runner Runner) (any, error) {
	if err := validateISCSI(req); err != nil {
		return nil, err
	}
	args := iscsiArgs(req)
	if _, err := runner.Run(ctx, "iscsiadm", append(args, "-o", "new")...); err != nil {
		// Existing exact node records are safe to reconcile; verify before update.
		if _, verifyErr := runner.Run(ctx, "iscsiadm", append(args, "-o", "show")...); verifyErr != nil {
			return nil, err
		}
	}
	if _, err := runner.Run(ctx, "iscsiadm", append(args, "-o", "update", "-n", "node.startup", "-v", "automatic")...); err != nil {
		return nil, err
	}
	return iscsiVerify(ctx, req, runner)
}

func iscsiLogin(ctx context.Context, req ISCSIRequest, logout bool, runner Runner) (any, error) {
	if err := validateISCSI(req); err != nil {
		return nil, err
	}
	action := "--login"
	if logout {
		action = "--logout"
	}
	out, err := runner.Run(ctx, "iscsiadm", append(iscsiArgs(req), action)...)
	if err != nil {
		return nil, err
	}
	return map[string]any{"target_iqn": req.TargetIQN, "portal": req.Portal, "result": bounded(out)}, nil
}

func iscsiVerify(ctx context.Context, req ISCSIRequest, runner Runner) (any, error) {
	if err := validateISCSI(req); err != nil {
		return nil, err
	}
	out, err := runner.Run(ctx, "iscsiadm", "-m", "session")
	if err != nil {
		return nil, err
	}
	found := false
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		for _, field := range fields {
			if field == req.TargetIQN {
				found = true
			}
		}
	}
	if !found {
		return nil, errors.New("exact approved iSCSI target is not logged in")
	}
	return map[string]any{"target_iqn": req.TargetIQN, "portal": req.Portal, "sessions": bounded(out)}, nil
}

func multipathVerify(ctx context.Context, req MultipathRequest, runner Runner) (any, error) {
	if !wwidRE.MatchString(req.WWID) {
		return nil, errors.New("WWID rejected")
	}
	if req.MinPaths == 0 {
		req.MinPaths = 2
	}
	if req.MinPaths < 1 || req.MinPaths > 32 {
		return nil, errors.New("minimum path count rejected")
	}
	active, err := runner.Run(ctx, "systemctl", "is-active", "multipathd")
	if err != nil || strings.TrimSpace(active) != "active" {
		return nil, errors.New("multipathd is not active")
	}
	maps, err := runner.Run(ctx, "multipath", "-ll", req.WWID)
	if err != nil {
		return nil, err
	}
	if !containsExactToken(maps, req.WWID) {
		return nil, errors.New("exact multipath WWID not found")
	}
	paths, err := runner.Run(ctx, "multipathd", "show", "paths", "format", "%w|%d|%t|%o")
	if err != nil {
		return nil, err
	}
	count := 0
	for _, line := range strings.Split(paths, "\n") {
		parts := strings.Split(line, "|")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) == req.WWID {
			count++
		}
	}
	if count < req.MinPaths {
		return nil, fmt.Errorf("multipath WWID has %d paths, require at least %d", count, req.MinPaths)
	}
	return map[string]any{"wwid": req.WWID, "path_count": count, "map": bounded(maps)}, nil
}

func lvmInventory(ctx context.Context, runner Runner) (any, error) {
	pvs, err := runner.Run(ctx, "pvs", "--reportformat", "json", "-o", "pv_name,pv_uuid,vg_name,vg_uuid,deviceidtype,deviceid")
	if err != nil {
		return nil, err
	}
	vgs, err := runner.Run(ctx, "vgs", "--reportformat", "json", "-o", "vg_name,vg_uuid,pv_count,lv_count")
	if err != nil {
		return nil, err
	}
	return map[string]any{"pvs": rawJSONOrString(pvs), "vgs": rawJSONOrString(vgs)}, nil
}

func lvmDevices(ctx context.Context, req LVMRequest, configure bool, runner Runner) (any, error) {
	if !wwidRE.MatchString(req.WWID) {
		return nil, errors.New("WWID rejected")
	}
	stable := "/dev/disk/by-id/dm-uuid-mpath-" + req.WWID
	if configure {
		if _, err := os.Lstat(stable); err != nil {
			return nil, fmt.Errorf("stable multipath device is absent: %w", err)
		}
		if _, err := runner.Run(ctx, "lvmdevices", "--adddev", stable); err != nil {
			return nil, err
		}
	}
	check, err := runner.Run(ctx, "lvmdevices", "--check")
	if err != nil {
		return nil, err
	}
	listed, err := runner.Run(ctx, "lvmdevices")
	if err != nil {
		return nil, err
	}
	if !containsExactToken(listed, stable) && !strings.Contains(listed, "dm-uuid-mpath-"+req.WWID) {
		return nil, errors.New("expected multipath device is absent from the LVM devices file")
	}
	return map[string]any{"wwid": req.WWID, "stable_device": stable, "check": bounded(check)}, nil
}

type pvsReport struct {
	Report []struct {
		PV []struct {
			PVName string `json:"pv_name"`
			VGName string `json:"vg_name"`
		} `json:"pv"`
	} `json:"report"`
}

func lvmSystemState(ctx context.Context, stable, resolved, expectedVG string, runner Runner) (bool, error) {
	raw, err := runner.Run(ctx, "pvs", "--reportformat", "json", "-o", "pv_name,vg_name")
	if err != nil {
		return false, err
	}
	var report pvsReport
	if err := json.Unmarshal([]byte(raw), &report); err != nil {
		return false, fmt.Errorf("decode pvs state: %w", err)
	}
	found := false
	vg := ""
	for _, group := range report.Report {
		for _, pv := range group.PV {
			name := strings.TrimSpace(pv.PVName)
			if name != stable && name != resolved {
				continue
			}
			if found {
				return false, errors.New("exact storage device appears as more than one LVM PV")
			}
			found = true
			vg = strings.TrimSpace(pv.VGName)
		}
	}
	if !found {
		return false, nil
	}
	if vg != expectedVG {
		if vg == "" {
			return false, errors.New("exact storage device is already an unowned LVM PV; manual reconciliation required")
		}
		return false, fmt.Errorf("exact storage device belongs to unexpected VG %q", vg)
	}
	count, err := runner.Run(ctx, "vgs", "--noheadings", "-o", "pv_count", expectedVG)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(count) != "1" {
		return false, errors.New("expected system datastore VG does not contain exactly one PV")
	}
	return true, nil
}

func lvmSystem(ctx context.Context, req LVMSystemRequest, initialize bool, runner Runner) (any, error) {
	if !wwidRE.MatchString(req.WWID) {
		return nil, errors.New("WWID rejected")
	}
	if req.DatastoreID < 0 || req.DatastoreID > 1000000000 {
		return nil, errors.New("datastore_id rejected")
	}
	if _, err := multipathVerify(ctx, MultipathRequest{WWID: req.WWID, MinPaths: 2}, runner); err != nil {
		return nil, err
	}
	stable := "/dev/disk/by-id/dm-uuid-mpath-" + req.WWID
	if initialize {
		if _, err := lvmDevices(ctx, LVMRequest{WWID: req.WWID}, true, runner); err != nil {
			return nil, err
		}
	} else {
		if _, err := lvmDevices(ctx, LVMRequest{WWID: req.WWID}, false, runner); err != nil {
			return nil, err
		}
	}
	resolved, err := runner.Run(ctx, "readlink", "-f", stable)
	if err != nil {
		return nil, err
	}
	resolved = strings.TrimSpace(resolved)
	if !strings.HasPrefix(resolved, "/dev/") || strings.ContainsAny(resolved, "\x00\r\n") {
		return nil, errors.New("stable storage device resolved outside /dev")
	}
	expectedVG := "vg-one-" + strconv.Itoa(req.DatastoreID)
	ready, err := lvmSystemState(ctx, stable, resolved, expectedVG, runner)
	if err != nil {
		return nil, err
	}
	if ready {
		return map[string]any{"wwid": req.WWID, "datastore_id": req.DatastoreID, "vg": expectedVG, "stable_device": stable, "idempotent": true}, nil
	}
	if !initialize {
		return nil, errors.New("expected system datastore VG is not initialized on the exact WWID")
	}
	tree, err := runner.Run(ctx, "lsblk", "-nr", "-o", "TYPE", resolved)
	if err != nil {
		return nil, err
	}
	lines := strings.Fields(tree)
	if len(lines) != 1 || lines[0] != "mpath" {
		return nil, errors.New("exact multipath device has child devices or unexpected block topology")
	}
	signatures, err := runner.Run(ctx, "wipefs", "--noheadings", "-n", "-o", "TYPE", stable)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(signatures) != "" {
		return nil, errors.New("exact multipath device contains an existing signature; refusing initialization")
	}
	if _, err := runner.Run(ctx, "pvcreate", "--yes", "--zero", "y", stable); err != nil {
		return nil, err
	}
	if _, err := runner.Run(ctx, "vgcreate", expectedVG, stable); err != nil {
		return nil, fmt.Errorf("vgcreate failed after pvcreate; storage state requires reconciliation: %w", err)
	}
	ready, err = lvmSystemState(ctx, stable, resolved, expectedVG, runner)
	if err != nil {
		return nil, err
	}
	if !ready {
		return nil, errors.New("post-create LVM verification failed")
	}
	return map[string]any{"wwid": req.WWID, "datastore_id": req.DatastoreID, "vg": expectedVG, "stable_device": stable, "idempotent": false}, nil
}

func commandEvidence(ctx context.Context, runner Runner, name string, args ...string) (any, error) {
	out, err := runner.Run(ctx, name, args...)
	if err != nil {
		return nil, err
	}
	return map[string]any{"output": bounded(out)}, nil
}

func rawJSONOrString(value string) any {
	if json.Valid([]byte(value)) {
		return json.RawMessage(value)
	}
	return bounded(value)
}

func containsExactToken(value, expected string) bool {
	for _, field := range strings.Fields(value) {
		if field == expected {
			return true
		}
	}
	return false
}

func safeTarget(value string) bool {
	if value == "" || len(value) > 253 || strings.HasPrefix(value, "-") {
		return false
	}
	for _, r := range value {
		if !(r == '.' || r == ':' || r == '-' || r == '_' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z') {
			return false
		}
	}
	return true
}

type checkpointRecord struct {
	Path       string   `json:"path"`
	Interface  string   `json:"interface,omitempty"`
	Interfaces []string `json:"interfaces,omitempty"`
}

func checkpointFile(operationID string) (string, error) {
	if operationID == "" || strings.ContainsAny(operationID, `/\\`) {
		return "", errors.New("invalid checkpoint operation ID")
	}
	return filepath.Join(checkpointRoot, operationID+".json"), nil
}

func saveCheckpoint(operationID, path, iface string) error {
	file, err := checkpointFile(operationID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(checkpointRoot, 0o700); err != nil {
		return err
	}
	body, _ := json.Marshal(checkpointRecord{Path: path, Interface: iface, Interfaces: []string{iface}})
	tmp, err := os.CreateTemp(checkpointRoot, ".checkpoint-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, file)
}

func saveTopologyCheckpoint(operationID, path string, interfaces []string) error {
	file, err := checkpointFile(operationID)
	if err != nil {
		return err
	}
	if len(interfaces) == 0 {
		return errors.New("topology checkpoint requires interfaces")
	}
	if err := os.MkdirAll(checkpointRoot, 0o700); err != nil {
		return err
	}
	body, _ := json.Marshal(checkpointRecord{Path: path, Interfaces: interfaces})
	tmp, err := os.CreateTemp(checkpointRoot, ".checkpoint-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(name, file)
}

func loadCheckpoint(operationID string) (checkpointRecord, error) {
	file, err := checkpointFile(operationID)
	if err != nil {
		return checkpointRecord{}, err
	}
	body, err := os.ReadFile(file)
	if err != nil {
		return checkpointRecord{}, err
	}
	var record checkpointRecord
	if err := json.Unmarshal(body, &record); err != nil {
		return checkpointRecord{}, err
	}
	if !dbusRE.MatchString(record.Path) {
		return checkpointRecord{}, errors.New("stored checkpoint state rejected")
	}
	if len(record.Interfaces) == 0 && record.Interface != "" {
		record.Interfaces = []string{record.Interface}
	}
	if len(record.Interfaces) == 0 {
		return checkpointRecord{}, errors.New("stored checkpoint has no interfaces")
	}
	for _, iface := range record.Interfaces {
		if validateInterface(iface) != nil {
			return checkpointRecord{}, errors.New("stored checkpoint state rejected")
		}
	}
	return record, nil
}

func removeCheckpoint(operationID string) error {
	file, err := checkpointFile(operationID)
	if err != nil {
		return err
	}
	if err := os.Remove(file); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func parseObjectPath(value string) string {
	for _, field := range strings.Fields(value) {
		candidate := strings.Trim(field, `"`)
		if dbusRE.MatchString(candidate) {
			return candidate
		}
	}
	return ""
}

func bounded(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 8192 {
		return value[len(value)-8192:]
	}
	return value
}

type diagnosticCommand struct {
	Key  string
	Name string
	Args []string
}

func diagnosticsCollect(ctx context.Context, req DiagnosticsRequest, runner Runner) (any, error) {
	allowed := map[string][]diagnosticCommand{
		"system": {
			{Key: "kernel", Name: "uname", Args: []string{"-r"}},
			{Key: "virtualization", Name: "systemd-detect-virt"},
			{Key: "cpu", Name: "lscpu", Args: []string{"-J"}},
			{Key: "memory", Name: "free", Args: []string{"-b"}},
		},
		"network": {
			{Key: "links", Name: "ip", Args: []string{"-s", "-j", "link", "show"}},
			{Key: "routes", Name: "ip", Args: []string{"-j", "route", "show", "table", "all"}},
			{Key: "rdma", Name: "rdma", Args: []string{"-j", "link", "show"}},
		},
		"storage": {
			{Key: "block", Name: "lsblk", Args: []string{"-J", "-b", "-o", "NAME,KNAME,PATH,PKNAME,TYPE,SIZE,WWN,SERIAL,MODEL,VENDOR,TRAN,HCTL,FSTYPE,MOUNTPOINTS"}},
			{Key: "scsi", Name: "lsscsi", Args: []string{"-g"}},
			{Key: "multipath", Name: "multipath", Args: []string{"-ll"}},
			{Key: "iscsi", Name: "iscsiadm", Args: []string{"-m", "session", "-P", "1"}},
			{Key: "nvme", Name: "nvme", Args: []string{"list", "-o", "json"}},
			{Key: "nvme_subsystems", Name: "nvme", Args: []string{"list-subsys", "-o", "json"}},
		},
		"virtualization": {
			{Key: "node", Name: "virsh", Args: []string{"nodeinfo"}},
			{Key: "domains", Name: "virsh", Args: []string{"list", "--all"}},
			{Key: "libvirtd", Name: "systemctl", Args: []string{"is-active", "libvirtd"}},
			{Key: "virtqemud", Name: "systemctl", Args: []string{"is-active", "virtqemud"}},
		},
	}
	if len(req.Scopes) == 0 {
		req.Scopes = []string{"system", "network", "storage", "virtualization"}
	}
	if len(req.Scopes) > len(allowed) {
		return nil, errors.New("too many diagnostic scopes")
	}
	seen := map[string]bool{}
	result := map[string]any{"schema": "layersentry-host-diagnostics/v1"}
	for _, scope := range req.Scopes {
		if seen[scope] {
			return nil, fmt.Errorf("duplicate diagnostic scope %q", scope)
		}
		seen[scope] = true
		commands, ok := allowed[scope]
		if !ok {
			return nil, fmt.Errorf("unsupported diagnostic scope %q", scope)
		}
		scopeResult := map[string]any{}
		for _, spec := range commands {
			out, err := runner.Run(ctx, spec.Name, spec.Args...)
			if err != nil {
				scopeResult[spec.Key] = map[string]any{"available": false, "error": bounded(err.Error())}
				continue
			}
			scopeResult[spec.Key] = map[string]any{"available": true, "value": rawJSONOrString(bounded(out))}
		}
		result[scope] = scopeResult
	}
	return result, nil
}
