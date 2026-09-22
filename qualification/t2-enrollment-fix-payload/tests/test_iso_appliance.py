from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ISOApplianceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ks = (ROOT / "deploy" / "iso" / "ks.cfg").read_text(encoding="utf-8")
        cls.wrapper = (ROOT / "deploy" / "host-agent" / "packaging" / "layersentry-agent-wrapper.sh").read_text(encoding="utf-8")
        cls.sudoers = (ROOT / "deploy" / "host-agent" / "packaging" / "layersentry-host-agent.sudoers").read_text(encoding="utf-8")
        cls.retire = (ROOT / "deploy" / "iso" / "payload" / "retire-bootstrap.sh").read_text(encoding="utf-8")
        cls.agent_service = (ROOT / "deploy" / "host-agent" / "packaging" / "layersentry-host-agent.service").read_text(encoding="utf-8")

    def test_root_locked_and_human_layersentry_user_has_no_wheel(self):
        self.assertIn("rootpw --lock", self.ks)
        self.assertIn("useradd -m -s /bin/bash layersentry", self.ks)
        self.assertIn("passwd -l layersentry", self.ks)
        self.assertIn("gpasswd -d layersentry wheel", self.ks)
        self.assertNotIn("layersentry ALL=(ALL)", self.sudoers)

    def test_root_ssh_disabled_and_layersentry_password_scoped(self):
        self.assertIn("PermitRootLogin no", self.ks)
        self.assertIn("PasswordAuthentication no", self.ks)
        self.assertIn("KbdInteractiveAuthentication no", self.ks)
        self.assertIn("PubkeyAuthentication yes", self.ks)
        self.assertIn("AllowUsers layersentry layersentry-bootstrap", self.ks)
        self.assertIn("Match User layersentry", self.ks)
        self.assertIn("    PasswordAuthentication yes", self.ks)
        self.assertIn("Match all", self.ks)

    def test_diagnostic_toolset_is_baked_into_iso(self):
        required = {
            "ethtool", "mtr", "smartmontools",
            "pciutils", "dmidecode", "lsscsi", "sg3_utils", "nvme-cli",
            "nfs-utils", "rdma-core", "libibverbs-utils",
            "strace", "lsof", "sos", "dnf-plugins-core",
        }
        package_block = self.ks.split("%packages", 1)[1].split("%end", 1)[0]
        for package in required:
            self.assertIn(package, package_block)
        self.assertNotIn("dnf-utils", package_block)

    def test_agent_drops_to_unprivileged_identity_and_bootstrap_is_retired(self):
        self.assertIn('runuser -u layersentry-agent -- "$CURRENT" run', self.wrapper)
        self.assertIn("layersentry-agent ALL=(root) NOPASSWD:", self.sudoers)
        self.assertNotIn("/bin/sh", self.sudoers)
        self.assertNotIn("/bin/bash", self.sudoers)
        self.assertNotIn("seal-host --config", self.sudoers)
        self.assertIn("layersentry-agent ALL=(root) NOPASSWD: /opt/layersentry/agent/current/layersentry-host-agent integrity-status", self.sudoers)
        self.assertNotIn("integrity-status *", self.sudoers)
        self.assertIn("systemctl disable dnf-makecache.timer", self.ks)
        self.assertIn("systemctl mask dnf-makecache.timer", self.ks)
        self.assertIn("rm -f /etc/sudoers.d/layersentry-bootstrap", self.retire)
        self.assertIn("passwd -l layersentry-bootstrap", self.retire)

    def test_agent_sandbox_allows_netlink_inventory(self):
        self.assertIn(
            "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK",
            self.agent_service,
        )
        self.assertIn("TimeoutStartSec=5min", self.agent_service)


if __name__ == "__main__":
    unittest.main()

class GenericISOTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = (ROOT / "deploy" / "iso" / "build-host-iso.sh").read_text(encoding="utf-8")
        cls.ks = (ROOT / "deploy" / "iso" / "ks.cfg").read_text(encoding="utf-8")
        cls.setup = (ROOT / "deploy" / "iso" / "payload" / "layersentry-console-setup.py").read_text(encoding="utf-8")
        cls.service = (ROOT / "deploy" / "iso" / "payload" / "layersentry-console-setup.service").read_text(encoding="utf-8")
        cls.root_helper = (ROOT / "deploy" / "iso" / "payload" / "layersentry-root").read_text(encoding="utf-8")
        cls.firstboot = (ROOT / "deploy" / "iso" / "payload" / "layersentry-firstboot.py").read_text(encoding="utf-8")
        cls.appliance = (ROOT / "deploy" / "host-agent" / "internal" / "appliance" / "appliance.go").read_text(encoding="utf-8")
        cls.render = (ROOT / "deploy" / "layersentry_deployer" / "render.py").read_text(encoding="utf-8")

    def test_disk_placeholder_is_single_and_renderer_is_standalone_only(self):
        self.assertEqual(self.ks.count("__LAYERSENTRY_DISK_CONFIG__"), 1)
        self.assertEqual(
            [line.strip() for line in self.ks.splitlines()].count("__LAYERSENTRY_DISK_CONFIG__"),
            1,
        )
        self.assertIn("if line.strip() == placeholder", self.builder)
        self.assertIn("if len(matches) != 1", self.builder)
        self.assertNotIn("text.replace('__LAYERSENTRY_DISK_CONFIG__'", self.builder)
        self.assertNotIn("Path(dst).write_text(''.join(lines),encoding='utf-8',newline=", self.builder)
        self.assertEqual(self.builder.count("Path(dst).write_text(''.join(lines),encoding='utf-8')"), 2)

    def test_generic_iso_embeds_no_host_token_seed_or_array_policy(self):
        self.assertIn("--generic", self.builder)
        self.assertIn("generic ISO must not embed install-disk, seed, SSH bootstrap key or enrollment token", self.builder)
        self.assertIn("generic ISO must not embed array-specific multipath policy", self.builder)
        self.assertIn("No enrollment token is embedded", self.builder)
        self.assertIn("Rocky full DVD media", self.builder)
        self.assertIn("/BaseOS/Packages", self.builder)
        self.assertIn("/AppStream/Packages", self.builder)
        self.assertIn("--source-commit", self.builder)
        self.assertIn("layersentry-host-iso-provenance/v1", self.builder)
        self.assertIn(".provenance.json", self.builder)
        self.assertIn("controller_ca_sha256", self.builder)
        self.assertIn("controller_signing_public_key_sha256", self.builder)
        self.assertIn("controller.invalid", self.builder)
        self.assertIn("host-agent.template.json", self.ks)
        self.assertIn('chown 0:"$agent_gid" /mnt/sysroot/etc/layersentry', self.ks)
        self.assertIn('chmod 0750 /mnt/sysroot/etc/layersentry', self.ks)
        self.assertIn("layersentry-console-setup.service", self.ks)
        self.assertIn("layersentry-root", self.ks)
        self.assertIn("exec /usr/bin/su -", self.root_helper)
        self.assertNotIn("sudo", self.root_helper)

    def test_console_setup_configures_support_and_recovery_credentials(self):
        self.assertIn('getpass.getpass("One-time enrollment code:', self.setup)
        self.assertIn("physical_interfaces()", self.setup)
        self.assertIn("prompt_controller_url()", self.setup)
        self.assertIn("urlparse", self.setup)
        self.assertIn("controller_url", self.setup)
        self.assertIn("layersentry-firstboot.py", self.setup)
        self.assertIn("layersentry-host-agent.service", self.setup)
        self.assertIn("client.crt", self.setup)
        self.assertIn('prompt_password("LayerSentry support password")', self.setup)
        self.assertIn('prompt_password("Root recovery password")', self.setup)
        self.assertIn('set_password("layersentry"', self.setup)
        self.assertIn('set_password("root"', self.setup)
        self.assertIn("install_support_key", self.setup)
        self.assertIn("no-agent-forwarding,no-port-forwarding,no-X11-forwarding", self.setup)
        self.assertIn('pwd.getpwnam("layersentry")', self.setup)
        self.assertNotIn("sudo ", self.setup)

    def test_firewalld_zone_names_fit_rocky_limit(self):
        sources = self.firstboot + self.appliance + self.render
        zones = {"ls-management", "ls-migration", "ls-storage", "ls-storage-a", "ls-storage-b", "ls-backup"}
        for zone in zones:
            self.assertLessEqual(len(zone), 17, zone)
            self.assertIn(zone, sources)
        for old in ("layersentry-management", "layersentry-migration", "layersentry-storage-a", "layersentry-storage-b", "layersentry-backup"):
            self.assertNotIn(old, sources)
        self.assertNotIn("--new-zone=layersentry-storage", sources)
        self.assertNotIn("connection.zone layersentry-storage", sources)

    def test_console_setup_owns_tty_only_until_enrollment_completes(self):
        self.assertIn("StandardInput=tty-force", self.service)
        self.assertIn("TTYPath=/dev/tty1", self.service)
        self.assertIn("ConditionPathExists=/etc/layersentry/generic-mode", self.service)
        self.assertIn("ConditionPathExists=!/var/lib/layersentry/console-setup.done", self.service)
        self.assertIn("Conflicts=getty@tty1.service", self.service)
