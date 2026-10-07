import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]


class OneDRSProductionSourceContractTests(unittest.TestCase):
    def test_onedrs_owns_initial_placement_and_optimization(self):
        oned = (REPO_ROOT / "share/etc/oned.conf").read_text()
        self.assertIn('-p one_drs -o one_drs', oned)
        self.assertNotIn('-p rank -o one_drs', oned)

    def test_cluster_api_validates_resilience_policy_fields(self):
        cluster = (REPO_ROOT / "src/cluster/Cluster.cc").read_text()
        required_fields = {
            "ENABLED",
            "HOST_FAILURE_TOLERANCE",
            "FAILURE_DOMAIN_TOLERANCE",
            "CPU_RESERVE_PERCENT",
            "MEMORY_RESERVE_PERCENT",
            "MIN_HEALTHY_HOSTS",
            "FAILURE_DOMAIN_SPREAD",
            "REQUIRE_FAILURE_DOMAIN_LABELS",
            "COMBINED_FAILURE_MODES",
            "MAX_GROUP_MIGRATIONS",
            "MAX_FAILURE_SCENARIOS",
            "MIGRATION_COOLDOWN_SECONDS",
        }
        for field in required_fields:
            with self.subTest(field=field):
                self.assertIn(f'"{field}"', cluster)

    def test_cluster_rejects_duplicate_onedrs_vectors(self):
        cluster = (REPO_ROOT / "src/cluster/Cluster.cc").read_text()
        self.assertIn("one_drs_num != 1", cluster)
        self.assertIn("exactly one ONE_DRS vector", cluster)

    def test_cooldown_does_not_remove_resilience_recovery_candidates(self):
        parser = (
            REPO_ROOT
            / "src/schedm_mad/remotes/one_drs/lib/optimizer_parser.py"
        ).read_text()
        snapshot = "resilience_vm_reqs_dict = vm_reqs_dict.copy()"
        cooldown = 'if self.mode.upper() == "OPTIMIZE" and migration_cooldown_seconds > 0:'
        admission = "for vm_req in resilience_vm_reqs_dict.values():"
        self.assertIn(snapshot, parser)
        self.assertIn(admission, parser)
        self.assertLess(parser.index(snapshot), parser.index(cooldown))
        self.assertGreater(parser.index(admission), parser.index(cooldown))

    def test_migration_plane_sets_bind_and_advertised_addresses(self):
        workflow = (
            REPO_ROOT / ".github/workflows/onedrs-migration-plane-fix.yml"
        ).read_text()
        self.assertIn('"migration_address": f', workflow)
        self.assertIn('"migration_host": f', workflow)
        self.assertIn(
            "migration_address|migration_host|migration_port_min|migration_port_max",
            workflow,
        )


if __name__ == "__main__":
    unittest.main()
