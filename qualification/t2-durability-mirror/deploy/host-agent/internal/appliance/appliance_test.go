package appliance

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type fakeRunner struct {
	calls []string
	conns map[string]string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (string, error) {
	call := name + " " + strings.Join(args, " ")
	f.calls = append(f.calls, call)
	if name == "getenforce" {
		return "Enforcing", nil
	}
	if name == "passwd" && len(args) == 2 && args[0] == "-S" {
		return args[1] + " P 2026-09-15 0 99999 7 -1", nil
	}
	if name == "id" && len(args) == 2 && args[0] == "-nG" && args[1] == "layersentry" {
		return "layersentry", nil
	}
	if name == "nmcli" && len(args) >= 5 && args[0] == "-g" {
		conn := f.conns[args[len(args)-1]]
		if conn == "" {
			return "", errors.New("missing connection")
		}
		return conn, nil
	}
	if name == "systemctl" && len(args) == 2 && args[0] == "is-active" && (args[1] == "fapolicyd" || args[1] == "layersentry-host-agent-update.timer") {
		return "active", nil
	}
	if name == "systemctl" && len(args) == 2 && args[0] == "is-enabled" {
		if args[1] == "layersentry-host-agent-update.timer" {
			return "enabled", nil
		}
		return "masked", nil
	}
	if name == "sshd" && len(args) == 1 && args[0] == "-T" {
		return "permitrootlogin no\npasswordauthentication no", nil
	}
	if name == "sudo" && len(args) >= 4 && args[0] == "-n" && args[1] == "-l" {
		return "User layersentry is not allowed to run sudo", nil
	}
	if name == "firewall-cmd" && len(args) == 2 && args[0] == "--permanent" && args[1] == "--get-zones" {
		return "drop ls-management ls-migration ls-storage-a ls-storage-b ls-backup", nil
	}
	if name == "firewall-cmd" && len(args) == 1 && args[0] == "--get-default-zone" {
		return "drop", nil
	}
	if name == "firewall-cmd" && len(args) == 1 && strings.HasPrefix(args[0], "--get-zone-of-interface=") {
		return "ls-management", nil
	}
	if name == "firewall-cmd" && len(args) == 3 && args[0] == "--permanent" && args[1] == "--zone=ls-management" && args[2] == "--get-target" {
		return "DROP", nil
	}
	if name == "firewall-cmd" && len(args) == 3 && args[0] == "--permanent" && args[1] == "--zone=ls-management" && args[2] == "--list-rich-rules" {
		return richRule("10.10.10.0/24", "22", "tcp"), nil
	}
	return "ok", nil
}

func prepareRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	old := rootPrefix
	rootPrefix = root
	t.Cleanup(func() { rootPrefix = old })
	files := map[string]string{
		"/etc/selinux/config": "SELINUX=permissive\nSELINUXTYPE=targeted\n",
		"/etc/selinux/targeted/contexts/files/file_contexts.local": "# local contexts\n",
		"/etc/ssh/sshd_config.d/60-layersentry-hardening.conf":     "PermitRootLogin no\n",
		"/etc/sudoers.d/layersentry-host-agent":                    "layersentry-agent ALL=(root) NOPASSWD: /agent\n",
		"/etc/layersentry/host-agent.json":                         "{}\n",
		"/etc/layersentry/controller-ca.pem":                       "PUBLIC CA\n",
		"/etc/layersentry/controller-signing-key.pem":              "PUBLIC KEY\n",
		"/var/lib/layersentry/agent/pki/client.crt":                "CLIENT CERT\n",
		"/etc/fapolicyd/fapolicyd.conf":                            "integrity = none\n",
		"/etc/firewalld/firewalld.conf":                            "DefaultZone=drop\n",
		"/etc/fapolicyd/trust.d/layersentry":                       "trusted\n",
		"/etc/firewalld/zones/ls-management.xml":                   "<zone/>\n",
		"/etc/firewalld/zones/ls-migration.xml":                    "<zone/>\n",
		"/etc/firewalld/zones/ls-storage-a.xml":                    "<zone/>\n",
		"/etc/firewalld/zones/ls-storage-b.xml":                    "<zone/>\n",
		"/etc/firewalld/zones/ls-backup.xml":                       "<zone/>\n",
		"/usr/local/bin/layersentry-root":                          "#!/bin/sh\nexec /usr/bin/su -\n",
	}
	for name, body := range files {
		path := rooted(name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestSealComputeAppliesPersistentSecurityProfile(t *testing.T) {
	prepareRoot(t)
	runner := &fakeRunner{conns: map[string]string{"ls-mgmt.10": "mgmt", "br-vm": "workload", "ls-mig.20": "migration", "eno5": "storage-a", "eno6": "storage-b"}}
	req := Request{Role: "compute", ManagementCIDR: "10.10.10.0/24", ManagementInterface: "ls-mgmt.10", WorkloadInterface: "br-vm", MigrationCIDR: "10.10.20.0/24", MigrationInterface: "ls-mig.20", StorageInterfaces: []string{"eno5", "eno6"}, NFS: true}
	result, err := Seal(context.Background(), req, runner)
	if err != nil {
		t.Fatal(err)
	}
	if result.Schema != "layersentry-sealed-appliance/v2" || result.SELinux != "Enforcing" || result.Fapolicyd != "active-sha256" {
		t.Fatalf("bad result: %#v", result)
	}
	joined := strings.Join(runner.calls, "\n")
	for _, want := range []string{
		`--add-rich-rule=rule family="ipv4" source address="10.10.10.0/24" port port="22" protocol="tcp" accept`,
		`port port="4124" protocol="tcp"`, `port port="4124" protocol="udp"`,
		`port port="5900-32767" protocol="tcp"`, `port port="49152-49215" protocol="tcp"`,
		"connection modify workload connection.zone drop",
		"connection modify storage-a connection.zone ls-storage-a",
		"connection modify storage-b connection.zone ls-storage-b",
		"setsebool -P virt_use_nfs on", "fapolicyd-cli --update", "systemctl enable --now fapolicyd",
		"systemctl disable --now dnf-makecache.timer", "systemctl mask dnf-makecache.timer",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in calls:\n%s", want, joined)
		}
	}
	if strings.Contains(joined, `port port="2634"`) {
		t.Fatalf("undocumented OpenNebula port 2634 must not be opened:\n%s", joined)
	}
	body, err := os.ReadFile(rooted("/etc/selinux/config"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "SELINUX=enforcing") {
		t.Fatalf("SELinux config not persistent: %s", body)
	}
	if verification := VerifyIntegrity(); !verification.Valid {
		t.Fatalf("seal verification failed: %#v", verification)
	}
	hardening := ReadHardeningEvidence()
	for _, key := range []string{"enrollment_completed", "package_set_verified", "selinux_enforcing", "firewall_default_drop", "management_ssh_scope_verified", "fapolicyd_active_sha256", "root_ssh_disabled", "support_no_sudo", "root_helper_verified", "uncontrolled_updates_disabled", "update_timer_active"} {
		if !hardening[key] {
			t.Fatalf("hardening evidence %s missing: %#v", key, hardening)
		}
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(rooted("/etc/layersentry/host-sealed.json"))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o640 {
			t.Fatalf("sealed marker mode=%o want 640", info.Mode().Perm())
		}
	}
}

func TestIntegrityDriftIsDetected(t *testing.T) {
	prepareRoot(t)
	runner := &fakeRunner{conns: map[string]string{"ls-mgmt": "mgmt"}}
	_, err := Seal(context.Background(), Request{Role: "platform", ManagementCIDR: "10.10.10.0/24", ManagementInterface: "ls-mgmt"}, runner)
	if err != nil {
		t.Fatal(err)
	}
	path := rooted("/etc/ssh/sshd_config.d/60-layersentry-hardening.conf")
	if err := os.WriteFile(path, []byte("PermitRootLogin yes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	verification := VerifyIntegrity()
	if verification.Valid || len(verification.Drift) == 0 || !strings.Contains(verification.Drift[0], "SHA-256 drift") {
		t.Fatalf("drift not detected: %#v", verification)
	}
}
