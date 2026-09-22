package appliance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var ifaceRE = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,32}$`)

type Runner interface {
	Run(context.Context, string, ...string) (string, error)
}

type Request struct {
	Role                string   `json:"role"`
	ManagementCIDR      string   `json:"management_cidr"`
	ManagementInterface string   `json:"management_interface"`
	MigrationCIDR       string   `json:"migration_cidr,omitempty"`
	MigrationInterface  string   `json:"migration_interface,omitempty"`
	WorkloadInterface   string   `json:"workload_interface,omitempty"`
	StorageInterfaces   []string `json:"storage_interfaces,omitempty"`
	BackupInterface     string   `json:"backup_interface,omitempty"`
	ControllerLocal     bool     `json:"controller_local,omitempty"`
	NFS                 bool     `json:"nfs,omitempty"`
}

type Result struct {
	Schema    string            `json:"schema"`
	Role      string            `json:"role"`
	SELinux   string            `json:"selinux"`
	Firewall  string            `json:"firewall"`
	Fapolicyd string            `json:"fapolicyd"`
	Integrity map[string]string `json:"integrity_sha256"`
	SealedAt  time.Time         `json:"sealed_at"`
}

func Validate(req Request) error {
	if req.Role != "platform" && req.Role != "compute" {
		return errors.New("role must be platform or compute")
	}
	if err := validateCIDR(req.ManagementCIDR); err != nil {
		return fmt.Errorf("management_cidr: %w", err)
	}
	if !ifaceRE.MatchString(req.ManagementInterface) {
		return errors.New("management_interface rejected")
	}
	if req.Role == "compute" {
		if err := validateCIDR(req.MigrationCIDR); err != nil {
			return fmt.Errorf("migration_cidr: %w", err)
		}
		if !ifaceRE.MatchString(req.MigrationInterface) {
			return errors.New("migration_interface rejected")
		}
		if !ifaceRE.MatchString(req.WorkloadInterface) {
			return errors.New("workload_interface rejected")
		}
	}
	if len(req.StorageInterfaces) > 2 {
		return errors.New("at most two storage interfaces are supported")
	}
	for _, name := range req.StorageInterfaces {
		if !ifaceRE.MatchString(name) {
			return errors.New("storage interface rejected")
		}
	}
	if req.BackupInterface != "" && !ifaceRE.MatchString(req.BackupInterface) {
		return errors.New("backup_interface rejected")
	}
	return nil
}

func validateCIDR(value string) error {
	ip, network, err := net.ParseCIDR(value)
	if err != nil || ip.To4() == nil || network.IP.To4() == nil {
		return errors.New("must be an IPv4 CIDR")
	}
	return nil
}

func richRule(cidr, port, protocol string) string {
	return fmt.Sprintf(`rule family="ipv4" source address="%s" port port="%s" protocol="%s" accept`, cidr, port, protocol)
}

func addZone(ctx context.Context, runner Runner, zone string) error {
	_, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--new-zone="+zone)
	if err != nil {
		// Existing zones are expected on reseal; verify they exist before ignoring.
		out, verifyErr := runner.Run(ctx, "firewall-cmd", "--permanent", "--get-zones")
		if verifyErr != nil || !containsWord(out, zone) {
			return fmt.Errorf("create firewall zone %s: %w", zone, err)
		}
	}
	return nil
}

func containsWord(value, word string) bool {
	for _, field := range strings.Fields(value) {
		if field == word {
			return true
		}
	}
	return false
}

func connectionForInterface(ctx context.Context, runner Runner, iface string) (string, error) {
	out, err := runner.Run(ctx, "nmcli", "-g", "GENERAL.CONNECTION", "device", "show", iface)
	if err != nil {
		return "", err
	}
	name := strings.TrimSpace(strings.Split(out, "\n")[0])
	if name == "" || name == "--" || strings.ContainsAny(name, "\r\n\x00") {
		return "", fmt.Errorf("no active NetworkManager connection for %s", iface)
	}
	return name, nil
}

var rootPrefix string

func rooted(path string) string {
	if rootPrefix == "" {
		return path
	}
	return filepath.Join(rootPrefix, filepath.FromSlash(strings.TrimPrefix(path, "/")))
}

func ensureSELinuxConfig(path string) error {
	body, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	lines := strings.Split(strings.ReplaceAll(string(body), "\r\n", "\n"), "\n")
	seenMode, seenType := false, false
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "SELINUX=") {
			lines[i] = "SELINUX=enforcing"
			seenMode = true
		}
		if strings.HasPrefix(trim, "SELINUXTYPE=") {
			lines[i] = "SELINUXTYPE=targeted"
			seenType = true
		}
	}
	if !seenMode {
		lines = append(lines, "SELINUX=enforcing")
	}
	if !seenType {
		lines = append(lines, "SELINUXTYPE=targeted")
	}
	content := strings.TrimRight(strings.Join(lines, "\n"), "\n") + "\n"
	return os.WriteFile(path, []byte(content), 0o644)
}

func ensureFapolicydSHA256(path string) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.ReplaceAll(string(body), "\r\n", "\n"), "\n")
	seen := false
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "integrity") && strings.Contains(trim, "=") {
			lines[i] = "integrity = sha256"
			seen = true
		}
	}
	if !seen {
		lines = append(lines, "integrity = sha256")
	}
	return os.WriteFile(path, []byte(strings.TrimRight(strings.Join(lines, "\n"), "\n")+"\n"), 0o640)
}

func sha256File(path string) (string, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:]), nil
}

func integrityManifest(paths []string) (map[string]string, error) {
	result := map[string]string{}
	for _, path := range paths {
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("integrity path %s: %w", path, err)
		}
		digest, err := sha256File(path)
		if err != nil {
			return nil, err
		}
		result[path] = digest
	}
	return result, nil
}

func setSELinuxContext(ctx context.Context, runner Runner, pathExpr, typ string) error {
	if _, err := runner.Run(ctx, "semanage", "fcontext", "-a", "-t", typ, pathExpr); err != nil {
		if _, modifyErr := runner.Run(ctx, "semanage", "fcontext", "-m", "-t", typ, pathExpr); modifyErr != nil {
			return fmt.Errorf("persist SELinux context for %s: %w", pathExpr, modifyErr)
		}
	}
	return nil
}

func ignoreRun(ctx context.Context, runner Runner, name string, args ...string) {
	_, _ = runner.Run(ctx, name, args...)
}

func resetZone(ctx context.Context, runner Runner, zone string) error {
	ignoreRun(ctx, runner, "firewall-cmd", "--permanent", "--delete-zone="+zone)
	if _, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--new-zone="+zone); err != nil {
		return err
	}
	if _, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--zone="+zone, "--set-target=DROP"); err != nil {
		return err
	}
	return nil
}

func addRichRule(ctx context.Context, runner Runner, zone, rule string) error {
	_, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--zone="+zone, "--add-rich-rule="+rule)
	return err
}

func bindZone(ctx context.Context, runner Runner, iface, zone string) error {
	connection, err := connectionForInterface(ctx, runner, iface)
	if err != nil {
		return err
	}
	_, err = runner.Run(ctx, "nmcli", "connection", "modify", connection, "connection.zone", zone)
	return err
}

func configureFirewall(ctx context.Context, req Request, runner Runner) error {
	if _, err := runner.Run(ctx, "systemctl", "enable", "--now", "firewalld"); err != nil {
		return err
	}
	for _, zone := range []string{"ls-management", "ls-migration", "ls-storage-a", "ls-storage-b", "ls-backup"} {
		if err := resetZone(ctx, runner, zone); err != nil {
			return fmt.Errorf("reset firewall zone %s: %w", zone, err)
		}
	}
	if _, err := runner.Run(ctx, "firewall-cmd", "--set-default-zone=drop"); err != nil {
		return err
	}
	if err := bindZone(ctx, runner, req.ManagementInterface, "ls-management"); err != nil {
		return err
	}
	managementRules := [][2]string{{"22", "tcp"}, {"4124", "tcp"}, {"4124", "udp"}}
	if req.Role == "platform" {
		managementRules = append(managementRules,
			[2]string{"2474", "tcp"}, [2]string{"2616", "tcp"},
			[2]string{"2633", "tcp"}, [2]string{"5030", "tcp"},
			[2]string{"29876", "tcp"},
		)
		if req.ControllerLocal {
			managementRules = append(managementRules, [2]string{"9443", "tcp"})
		}
	} else {
		managementRules = append(managementRules, [2]string{"5900-32767", "tcp"})
	}
	for _, entry := range managementRules {
		if err := addRichRule(ctx, runner, "ls-management", richRule(req.ManagementCIDR, entry[0], entry[1])); err != nil {
			return err
		}
	}
	if req.Role == "compute" {
		if err := bindZone(ctx, runner, req.WorkloadInterface, "drop"); err != nil {
			return err
		}
		if err := bindZone(ctx, runner, req.MigrationInterface, "ls-migration"); err != nil {
			return err
		}
		if err := addRichRule(ctx, runner, "ls-migration", richRule(req.MigrationCIDR, "49152-49215", "tcp")); err != nil {
			return err
		}
	}
	storageZones := []string{"ls-storage-a", "ls-storage-b"}
	for i, iface := range req.StorageInterfaces {
		if err := bindZone(ctx, runner, iface, storageZones[i]); err != nil {
			return err
		}
	}
	if req.BackupInterface != "" {
		if err := bindZone(ctx, runner, req.BackupInterface, "ls-backup"); err != nil {
			return err
		}
	}
	if _, err := runner.Run(ctx, "firewall-cmd", "--check-config"); err != nil {
		return fmt.Errorf("firewalld permanent configuration invalid: %w", err)
	}
	if _, err := runner.Run(ctx, "firewall-cmd", "--reload"); err != nil {
		return err
	}
	defaultZone, err := runner.Run(ctx, "firewall-cmd", "--get-default-zone")
	if err != nil || strings.TrimSpace(defaultZone) != "drop" {
		return errors.New("firewalld default zone is not drop after reload")
	}
	managementZone, err := runner.Run(ctx, "firewall-cmd", "--get-zone-of-interface="+req.ManagementInterface)
	if err != nil || strings.TrimSpace(managementZone) != "ls-management" {
		return errors.New("management interface is not bound to ls-management")
	}
	managementTarget, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--zone=ls-management", "--get-target")
	if err != nil || strings.TrimSpace(managementTarget) != "DROP" {
		return errors.New("management firewall zone target is not DROP")
	}
	rules, err := runner.Run(ctx, "firewall-cmd", "--permanent", "--zone=ls-management", "--list-rich-rules")
	sshRule := richRule(req.ManagementCIDR, "22", "tcp")
	if err != nil || !strings.Contains(rules, sshRule) {
		return errors.New("management SSH firewall rule is not CIDR-scoped as required")
	}
	return nil
}

func configureSELinux(ctx context.Context, req Request, runner Runner) error {
	out, err := runner.Run(ctx, "getenforce")
	if err != nil || strings.TrimSpace(out) != "Enforcing" {
		return errors.New("SELinux must already be Enforcing before sealing")
	}
	if err := ensureSELinuxConfig(rooted("/etc/selinux/config")); err != nil {
		return err
	}
	if _, err := runner.Run(ctx, "setenforce", "1"); err != nil {
		return err
	}
	if err := setSELinuxContext(ctx, runner, `/opt/layersentry/agent(/.*)?`, "bin_t"); err != nil {
		return err
	}
	if err := setSELinuxContext(ctx, runner, `/etc/layersentry(/.*)?`, "etc_t"); err != nil {
		return err
	}
	if err := setSELinuxContext(ctx, runner, `/var/lib/layersentry(/.*)?`, "var_lib_t"); err != nil {
		return err
	}
	for _, path := range []string{"/opt/layersentry/agent", "/etc/layersentry", "/var/lib/layersentry"} {
		if _, err := runner.Run(ctx, "restorecon", "-RF", path); err != nil {
			return err
		}
	}
	if req.NFS {
		if _, err := runner.Run(ctx, "setsebool", "-P", "virt_use_nfs", "on"); err != nil {
			return err
		}
	}
	return nil
}

var uncontrolledUpdateUnits = []string{"dnf-makecache.timer", "dnf-automatic.timer", "packagekit.service", "packagekit-offline-update.service"}

var requiredBasePackages = []string{"qemu-kvm", "libvirt", "NetworkManager", "firewalld", "iscsi-initiator-utils", "device-mapper-multipath", "lvm2", "openssh-server", "sudo", "policycoreutils", "fapolicyd"}

func ensureBasePackages(ctx context.Context, runner Runner) error {
	for _, pkg := range requiredBasePackages {
		if _, err := runner.Run(ctx, "rpm", "-q", pkg); err != nil {
			return fmt.Errorf("required host package %s is missing: %w", pkg, err)
		}
	}
	return nil
}

func configurePackagePolicy(ctx context.Context, runner Runner) error {
	if err := os.MkdirAll(rooted("/etc/dnf/protected.d"), 0o755); err != nil {
		return err
	}
	protected := []string{"layersentry-host-agent", "opennebula-node-kvm", "qemu-kvm", "libvirt", "device-mapper-multipath", "lvm2", "NetworkManager", "firewalld", "policycoreutils"}
	if err := os.WriteFile(rooted("/etc/dnf/protected.d/layersentry.conf"), []byte(strings.Join(protected, "\n")+"\n"), 0o644); err != nil {
		return err
	}
	for _, unit := range uncontrolledUpdateUnits {
		ignoreRun(ctx, runner, "systemctl", "disable", "--now", unit)
		ignoreRun(ctx, runner, "systemctl", "mask", unit)
		state, stateErr := runner.Run(ctx, "systemctl", "is-enabled", unit)
		state = strings.TrimSpace(state)
		if state != "masked" && state != "disabled" && state != "not-found" {
			if stateErr != nil {
				return fmt.Errorf("cannot verify uncontrolled update unit %s: %w", unit, stateErr)
			}
			return fmt.Errorf("uncontrolled update unit %s remains %q", unit, state)
		}
	}
	return nil
}

var trustedCustomFiles = []string{
	"/opt/layersentry/agent/current/layersentry-host-agent",
	"/usr/local/libexec/layersentry-agent-wrapper.sh",
	"/usr/local/libexec/layersentry-agent-confirm.sh",
	"/usr/local/sbin/layersentry-repo-config.sh",
	"/usr/local/bin/layersentry-root",
}

func configureFapolicyd(ctx context.Context, runner Runner) error {
	if _, err := runner.Run(ctx, "rpm", "-q", "fapolicyd"); err != nil {
		return errors.New("fapolicyd is required; run tools.ensure before host sealing")
	}
	if err := ensureFapolicydSHA256(rooted("/etc/fapolicyd/fapolicyd.conf")); err != nil {
		return err
	}
	if _, err := runner.Run(ctx, "fapolicyd-cli", "--check-config"); err != nil {
		return fmt.Errorf("fapolicyd configuration invalid: %w", err)
	}
	for _, file := range trustedCustomFiles {
		ignoreRun(ctx, runner, "fapolicyd-cli", "--file", "delete", file, "--trust-file", "layersentry")
		if _, err := runner.Run(ctx, "fapolicyd-cli", "--file", "add", file, "--trust-file", "layersentry"); err != nil {
			return fmt.Errorf("trust LayerSentry file %s: %w", file, err)
		}
	}
	if _, err := runner.Run(ctx, "fapolicyd-cli", "--update"); err != nil {
		return err
	}
	if _, err := runner.Run(ctx, "systemctl", "enable", "--now", "fapolicyd"); err != nil {
		return err
	}
	out, err := runner.Run(ctx, "systemctl", "is-active", "fapolicyd")
	if err != nil || strings.TrimSpace(out) != "active" {
		return errors.New("fapolicyd is not active after sealing")
	}
	return nil
}

func accountStatus(ctx context.Context, runner Runner, user string) (string, error) {
	status, err := runner.Run(ctx, "passwd", "-S", user)
	if err != nil {
		return "", err
	}
	fields := strings.Fields(status)
	if len(fields) < 2 {
		return "", fmt.Errorf("cannot determine account status for %s", user)
	}
	return fields[1], nil
}

func ensureAccessPolicy(ctx context.Context, runner Runner) error {
	for _, user := range []string{"root", "layersentry"} {
		status, err := accountStatus(ctx, runner, user)
		if err != nil {
			return err
		}
		if status != "P" && status != "PS" {
			return fmt.Errorf("account %s must have a locally configured password", user)
		}
	}
	groups, err := runner.Run(ctx, "id", "-nG", "layersentry")
	if err != nil {
		return err
	}
	if containsWord(groups, "wheel") || containsWord(groups, "sudo") {
		return errors.New("layersentry support user must not have sudo/wheel membership")
	}
	if _, err := runner.Run(ctx, "sshd", "-t"); err != nil {
		return fmt.Errorf("sshd access policy invalid: %w", err)
	}
	helperPath := rooted("/usr/local/bin/layersentry-root")
	helperBody, err := os.ReadFile(helperPath)
	if err != nil || !strings.Contains(string(helperBody), "exec /usr/bin/su -") || strings.Contains(string(helperBody), "sudo") {
		return errors.New("layersentry-root helper is missing or violates the root-transition contract")
	}
	if rootPrefix == "" {
		info, err := os.Stat(helperPath)
		if err != nil || info.Mode().Perm()&0o111 == 0 {
			return errors.New("layersentry-root helper must be executable")
		}
	}
	effective, err := runner.Run(ctx, "sshd", "-T")
	if err != nil || !strings.Contains(strings.ToLower(effective), "permitrootlogin no") {
		return errors.New("effective sshd policy must disable root login")
	}
	sudoOut, sudoErr := runner.Run(ctx, "sudo", "-n", "-l", "-U", "layersentry")
	sudoEvidence := strings.ToLower(strings.TrimSpace(sudoOut + " " + fmt.Sprint(sudoErr)))
	if strings.Contains(sudoEvidence, "may run the following") || strings.Contains(sudoEvidence, "nopasswd:") {
		return errors.New("layersentry support user has sudo authorization")
	}
	if sudoErr != nil && !strings.Contains(sudoEvidence, "not allowed") && !strings.Contains(sudoEvidence, "not in the sudoers") {
		return fmt.Errorf("cannot verify layersentry sudo denial: %w", sudoErr)
	}
	return nil
}

func ensureEnrollmentComplete() error {
	cert := rooted("/var/lib/layersentry/agent/pki/client.crt")
	info, err := os.Stat(cert)
	if err != nil || info.Size() == 0 {
		return errors.New("host enrollment certificate is missing")
	}
	if _, err := os.Stat(rooted("/etc/layersentry/bootstrap-token")); err == nil {
		return errors.New("bootstrap token remains after enrollment")
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func ensureUpdateTimer(ctx context.Context, runner Runner) error {
	enabled, err := runner.Run(ctx, "systemctl", "is-enabled", "layersentry-host-agent-update.timer")
	if err != nil || strings.TrimSpace(enabled) != "enabled" {
		return errors.New("LayerSentry update timer is not enabled")
	}
	active, err := runner.Run(ctx, "systemctl", "is-active", "layersentry-host-agent-update.timer")
	if err != nil || strings.TrimSpace(active) != "active" {
		return errors.New("LayerSentry update timer is not active")
	}
	return nil
}

var criticalFiles = []string{
	"/etc/selinux/config",
	"/etc/selinux/targeted/contexts/files/file_contexts.local",
	"/etc/ssh/sshd_config.d/60-layersentry-hardening.conf",
	"/etc/sudoers.d/layersentry-host-agent",
	"/etc/layersentry/host-agent.json",
	"/etc/layersentry/controller-ca.pem",
	"/etc/layersentry/controller-signing-key.pem",
	"/etc/dnf/protected.d/layersentry.conf",
	"/etc/fapolicyd/fapolicyd.conf",
	"/etc/firewalld/firewalld.conf",
	"/etc/firewalld/zones/ls-management.xml",
	"/etc/firewalld/zones/ls-migration.xml",
	"/etc/firewalld/zones/ls-storage-a.xml",
	"/etc/firewalld/zones/ls-storage-b.xml",
	"/etc/firewalld/zones/ls-backup.xml",
	"/usr/local/bin/layersentry-root",
}

func canonicalIntegrity() (map[string]string, error) {
	result := map[string]string{}
	for _, canonical := range criticalFiles {
		path := rooted(canonical)
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("critical file %s: %w", canonical, err)
		}
		digest, err := sha256File(path)
		if err != nil {
			return nil, err
		}
		result[canonical] = digest
	}
	return result, nil
}

type sealedMarker struct {
	Schema     string            `json:"schema"`
	Role       string            `json:"role"`
	Mode       string            `json:"mode"`
	Management string            `json:"management_cidr"`
	Migration  string            `json:"migration_cidr,omitempty"`
	Integrity  map[string]string `json:"integrity_sha256"`
	Hardening  map[string]bool   `json:"hardening"`
	SealedAt   time.Time         `json:"sealed_at"`
}

func Seal(ctx context.Context, req Request, runner Runner) (Result, error) {
	if err := Validate(req); err != nil {
		return Result{}, err
	}
	if runner == nil {
		return Result{}, errors.New("runner is required")
	}
	if err := ensureEnrollmentComplete(); err != nil {
		return Result{}, err
	}
	if err := ensureBasePackages(ctx, runner); err != nil {
		return Result{}, err
	}
	if err := ensureAccessPolicy(ctx, runner); err != nil {
		return Result{}, err
	}
	if err := configureSELinux(ctx, req, runner); err != nil {
		return Result{}, err
	}
	if err := configurePackagePolicy(ctx, runner); err != nil {
		return Result{}, err
	}
	if err := configureFirewall(ctx, req, runner); err != nil {
		return Result{}, err
	}
	if err := configureFapolicyd(ctx, runner); err != nil {
		return Result{}, err
	}
	if err := ensureUpdateTimer(ctx, runner); err != nil {
		return Result{}, err
	}
	integrity, err := canonicalIntegrity()
	if err != nil {
		return Result{}, err
	}
	now := time.Now().UTC()
	hardening := map[string]bool{
		"enrollment_completed": true, "package_set_verified": true, "selinux_enforcing": true,
		"firewall_default_drop": true, "management_ssh_scope_verified": true,
		"fapolicyd_active_sha256": true, "root_ssh_disabled": true, "support_no_sudo": true,
		"root_helper_verified": true, "uncontrolled_updates_disabled": true, "update_timer_active": true,
	}
	marker := sealedMarker{Schema: "layersentry-sealed-appliance/v2", Role: req.Role, Mode: "operational-sealed", Management: req.ManagementCIDR, Migration: req.MigrationCIDR, Integrity: integrity, Hardening: hardening, SealedAt: now}
	body, err := json.MarshalIndent(marker, "", "  ")
	if err != nil {
		return Result{}, err
	}
	if err := os.MkdirAll(rooted("/etc/layersentry"), 0o750); err != nil {
		return Result{}, err
	}
	markerPath := rooted("/etc/layersentry/host-sealed.json")
	if err := os.WriteFile(markerPath, append(body, '\n'), 0o640); err != nil {
		return Result{}, err
	}
	if err := os.Chmod(markerPath, 0o640); err != nil {
		return Result{}, err
	}
	if rootPrefix == "" {
		if _, err := runner.Run(ctx, "chgrp", "layersentry-agent", markerPath); err != nil {
			return Result{}, fmt.Errorf("make sealed marker readable by host agent: %w", err)
		}
	}
	return Result{Schema: marker.Schema, Role: req.Role, SELinux: "Enforcing", Firewall: "permanent-role-scoped", Fapolicyd: "active-sha256", Integrity: integrity, SealedAt: now}, nil
}

type Verification struct {
	Schema string   `json:"schema"`
	Valid  bool     `json:"valid"`
	Drift  []string `json:"drift,omitempty"`
}

func ReadHardeningEvidence() map[string]bool {
	body, err := os.ReadFile(rooted("/etc/layersentry/host-sealed.json"))
	if err != nil {
		return nil
	}
	var marker sealedMarker
	if json.Unmarshal(body, &marker) != nil || marker.Schema != "layersentry-sealed-appliance/v2" {
		return nil
	}
	result := make(map[string]bool, len(marker.Hardening))
	for key, value := range marker.Hardening {
		result[key] = value
	}
	return result
}

func VerifyIntegrity() Verification {
	verification := Verification{Schema: "layersentry-sealed-appliance-verification/v1", Valid: false}
	body, err := os.ReadFile(rooted("/etc/layersentry/host-sealed.json"))
	if err != nil {
		verification.Drift = []string{"sealed marker missing"}
		return verification
	}
	var marker sealedMarker
	if err := json.Unmarshal(body, &marker); err != nil || marker.Schema != "layersentry-sealed-appliance/v2" {
		verification.Drift = []string{"sealed marker invalid"}
		return verification
	}
	for path, expected := range marker.Integrity {
		digest, err := sha256File(rooted(path))
		if err != nil {
			verification.Drift = append(verification.Drift, path+": missing or unreadable")
			continue
		}
		if !strings.EqualFold(digest, expected) {
			verification.Drift = append(verification.Drift, path+": SHA-256 drift")
		}
	}
	sort.Strings(verification.Drift)
	verification.Valid = len(verification.Drift) == 0
	return verification
}
