package inventory

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/appliance"
)

type Snapshot struct {
	Schema                string            `json:"schema"`
	ObservedAt            time.Time         `json:"observed_at"`
	Hostname              string            `json:"hostname"`
	MachineID             string            `json:"machine_id"`
	BootID                string            `json:"boot_id,omitempty"`
	OSRelease             map[string]string `json:"os_release"`
	Kernel                string            `json:"kernel"`
	Architecture          string            `json:"architecture"`
	CPU                   json.RawMessage   `json:"cpu,omitempty"`
	MemoryBytes           uint64            `json:"memory_bytes,omitempty"`
	Virtualization        string            `json:"virtualization,omitempty"`
	KVMAvailable          bool              `json:"kvm_available"`
	SELinux               string            `json:"selinux,omitempty"`
	InitiatorIQN          string            `json:"initiator_iqn,omitempty"`
	Network               json.RawMessage   `json:"network,omitempty"`
	Links                 json.RawMessage   `json:"links,omitempty"`
	Routes                json.RawMessage   `json:"routes,omitempty"`
	NetworkConnections    string            `json:"network_connections,omitempty"`
	NICs                  []NIC             `json:"nics,omitempty"`
	FCAdapters            []FCAdapter       `json:"fc_adapters,omitempty"`
	NVMeHostNQN           string            `json:"nvme_host_nqn,omitempty"`
	RDMA                  json.RawMessage   `json:"rdma,omitempty"`
	NFSMounts             json.RawMessage   `json:"nfs_mounts,omitempty"`
	Bonds                 map[string]string `json:"bonds,omitempty"`
	Block                 json.RawMessage   `json:"block,omitempty"`
	PCI                   string            `json:"pci,omitempty"`
	GPU                   string            `json:"gpu,omitempty"`
	ISCSISessions         string            `json:"iscsi_sessions,omitempty"`
	Multipath             string            `json:"multipath,omitempty"`
	LVMPhysical           json.RawMessage   `json:"lvm_physical,omitempty"`
	LVMGroups             json.RawMessage   `json:"lvm_groups,omitempty"`
	DRBDStatus            string            `json:"drbd_status,omitempty"`
	Services              map[string]string `json:"services"`
	UnitEnablement        map[string]string `json:"unit_enablement,omitempty"`
	AgentSystemd          map[string]string `json:"agent_systemd,omitempty"`
	Hardening             map[string]bool   `json:"hardening,omitempty"`
	BootstrapTokenPresent bool              `json:"bootstrap_token_present"`
	Packages              map[string]string `json:"packages"`
	Sealed                bool              `json:"sealed"`
	SealIntegrityOK       bool              `json:"seal_integrity_ok,omitempty"`
	SealDrift             []string          `json:"seal_drift,omitempty"`
	RebootRequired        bool              `json:"reboot_required"`
}

func CollectEnrollment(ctx context.Context) Snapshot {
	host, _ := os.Hostname()
	return Snapshot{
		Schema:         "layersentry-agent-inventory/v3",
		ObservedAt:     time.Now().UTC(),
		Hostname:       strings.Split(host, ".")[0],
		MachineID:      readTrim("/etc/machine-id"),
		BootID:         readTrim("/proc/sys/kernel/random/boot_id"),
		OSRelease:      osRelease(),
		Kernel:         command(ctx, "uname", "-r"),
		Architecture:   runtime.GOARCH,
		Virtualization: command(ctx, "systemd-detect-virt"),
		SELinux:        command(ctx, "getenforce"),
		Network:        jsonCommand(ctx, "ip", "-j", "addr", "show"),
		Links:          jsonCommand(ctx, "ip", "-j", "link", "show"),
		Routes:         jsonCommand(ctx, "ip", "-j", "route", "show", "table", "all"),
		Services:       map[string]string{},
		Packages:       map[string]string{},
	}
}

func Collect(ctx context.Context) Snapshot {
	host, _ := os.Hostname()
	s := Snapshot{
		Schema: "layersentry-agent-inventory/v3", ObservedAt: time.Now().UTC(),
		Hostname: strings.Split(host, ".")[0], MachineID: readTrim("/etc/machine-id"),
		OSRelease: osRelease(), Architecture: runtime.GOARCH,
		Packages: map[string]string{}, Services: map[string]string{}, UnitEnablement: map[string]string{}, AgentSystemd: map[string]string{}, Bonds: bondingState(),
	}
	s.BootID = readTrim("/proc/sys/kernel/random/boot_id")
	s.Kernel = command(ctx, "uname", "-r")
	s.CPU = jsonCommand(ctx, "lscpu", "-J")
	s.MemoryBytes = memoryBytes()
	s.Virtualization = command(ctx, "systemd-detect-virt")
	_, s.KVMAvailable = fileExists("/dev/kvm")
	s.SELinux = command(ctx, "getenforce")
	s.InitiatorIQN = initiatorIQN()
	s.Network = jsonCommand(ctx, "ip", "-j", "addr", "show")
	s.Links = jsonCommand(ctx, "ip", "-j", "link", "show")
	s.Routes = jsonCommand(ctx, "ip", "-j", "route", "show", "table", "all")
	s.NetworkConnections = command(ctx, "nmcli", "-t", "-f", "NAME,UUID,TYPE,DEVICE", "connection", "show")
	s.NICs = CollectNICs(ctx)
	s.FCAdapters = CollectFCAdapters()
	s.NVMeHostNQN = readTrim("/etc/nvme/hostnqn")
	s.RDMA = jsonCommand(ctx, "rdma", "-j", "link", "show")
	s.NFSMounts = jsonCommand(ctx, "findmnt", "-J", "-t", "nfs,nfs4", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS")
	s.Block = jsonCommand(ctx, "lsblk", "-J", "-b", "-o", "NAME,KNAME,PATH,PKNAME,TYPE,SIZE,WWN,SERIAL,MODEL,VENDOR,TRAN,HCTL,FSTYPE,MOUNTPOINTS")
	s.PCI = command(ctx, "lspci", "-Dnnk")
	s.GPU = filterGPU(s.PCI)
	s.ISCSISessions = command(ctx, "iscsiadm", "-m", "session", "-P", "1")
	s.Multipath = command(ctx, "multipath", "-ll")
	s.LVMPhysical = jsonCommand(ctx, "pvs", "--reportformat", "json", "--units", "b", "--nosuffix", "-o", "pv_name,pv_uuid,vg_name,vg_uuid,pv_size,deviceidtype,deviceid")
	s.LVMGroups = jsonCommand(ctx, "vgs", "--reportformat", "json", "--units", "b", "--nosuffix", "-o", "vg_name,vg_uuid,vg_size,vg_free,pv_count,lv_count")
	s.DRBDStatus = command(ctx, "drbdadm", "status")
	for _, pkg := range []string{
		"layersentry-host-agent", "opennebula-node-kvm", "qemu-kvm", "libvirt", "device-mapper-multipath", "lvm2", "iscsi-initiator-utils", "NetworkManager", "firewalld", "openssh-server", "sudo", "policycoreutils", "fapolicyd",
		"linstor-controller", "linstor-satellite", "linstor-client", "linstor-opennebula", "kmod-drbd", "drbd-utils",
	} {
		if v := command(ctx, "rpm", "-q", "--qf", "%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}", pkg); v != "" {
			s.Packages[pkg] = v
		}
	}
	for _, service := range []string{"NetworkManager", "iscsid", "multipathd", "libvirtd", "virtqemud", "firewalld", "fapolicyd", "sshd", "layersentry-host-agent", "layersentry-host-agent-update.timer", "linstor-controller", "linstor-satellite"} {
		if v := command(ctx, "systemctl", "is-active", service); v != "" {
			s.Services[service] = v
		}
	}
	for _, unit := range []string{"dnf-makecache.timer", "dnf-automatic.timer", "packagekit.service", "packagekit-offline-update.service", "layersentry-host-agent-update.timer"} {
		if v := command(ctx, "systemctl", "is-enabled", unit); v != "" {
			s.UnitEnablement[unit] = v
		}
	}
	for _, property := range []string{"Restart", "WatchdogUSec", "InvocationID", "ActiveEnterTimestampMonotonic"} {
		if v := command(ctx, "systemctl", "show", "--property="+property, "--value", "layersentry-host-agent.service"); v != "" {
			s.AgentSystemd[property] = v
		}
	}
	_, s.BootstrapTokenPresent = fileExists("/etc/layersentry/bootstrap-token")
	_, s.Sealed = fileExists("/etc/layersentry/host-sealed.json")
	if s.Sealed {
		s.Hardening = appliance.ReadHardeningEvidence()
		verification := privilegedIntegrityVerification(ctx)
		s.SealIntegrityOK = verification.Valid
		s.SealDrift = verification.Drift
		if s.Hardening == nil {
			s.Hardening = map[string]bool{}
		}
		s.Hardening["integrity_verified"] = verification.Valid
	}
	s.RebootRequired = rebootRequired(ctx)
	return s
}

func decodeIntegrityVerification(value string) appliance.Verification {
	verification := appliance.Verification{Schema: "layersentry-sealed-appliance-verification/v1", Valid: false, Drift: []string{"privileged integrity verification unavailable"}}
	var parsed appliance.Verification
	if json.Unmarshal([]byte(value), &parsed) == nil && parsed.Schema == "layersentry-sealed-appliance-verification/v1" {
		return parsed
	}
	return verification
}

func privilegedIntegrityVerification(parent context.Context) appliance.Verification {
	value := command(parent, "sudo", "-n", "/opt/layersentry/agent/current/layersentry-host-agent", "integrity-status")
	return decodeIntegrityVerification(value)
}

func command(parent context.Context, name string, args ...string) string {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

func jsonCommand(parent context.Context, name string, args ...string) json.RawMessage {
	v := command(parent, name, args...)
	if v == "" || !json.Valid([]byte(v)) {
		return nil
	}
	return json.RawMessage(v)
}

func readTrim(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func initiatorIQN() string {
	for _, line := range strings.Split(readTrim("/etc/iscsi/initiatorname.iscsi"), "\n") {
		if strings.HasPrefix(line, "InitiatorName=iqn.") {
			return strings.TrimPrefix(line, "InitiatorName=")
		}
	}
	return ""
}

func osRelease() map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(readTrim("/etc/os-release"), "\n") {
		if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		out[parts[0]] = strings.Trim(parts[1], `"`)
	}
	return out
}

func memoryBytes() uint64 {
	for _, line := range strings.Split(readTrim("/proc/meminfo"), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "MemTotal:" {
			kb, err := strconv.ParseUint(fields[1], 10, 64)
			if err == nil {
				return kb * 1024
			}
		}
	}
	return 0
}

func bondingState() map[string]string {
	result := map[string]string{}
	matches, _ := filepath.Glob("/proc/net/bonding/*")
	for _, path := range matches {
		if body, err := os.ReadFile(path); err == nil {
			result[filepath.Base(path)] = strings.TrimSpace(string(body))
		}
	}
	return result
}

func filterGPU(pci string) string {
	var lines []string
	for _, line := range strings.Split(pci, "\n") {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "vga compatible controller") || strings.Contains(lower, "3d controller") || strings.Contains(lower, "display controller") {
			lines = append(lines, strings.TrimSpace(line))
		}
	}
	return strings.Join(lines, "\n")
}

func fileExists(path string) (os.FileInfo, bool) {
	info, err := os.Stat(path)
	return info, err == nil
}

func rebootRequired(parent context.Context) bool {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "needs-restarting", "-r")
	if err := cmd.Run(); err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			return exit.ExitCode() == 1
		}
	}
	return false
}
