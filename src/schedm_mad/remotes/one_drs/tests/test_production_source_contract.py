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

    def test_place_keeps_cluster_host_inventory_separate_from_vm_candidates(self):
        scheduler = (REPO_ROOT / "src/schedm/SchedulerManagerDriver.cc").read_text()
        self.assertIn("std::set<int> host_inventory_ids = sr.match.match_host;", scheduler)
        self.assertIn("for (int host_id : sr.hpool.ids)", scheduler)
        self.assertIn("matched_cluster_ids.count(host->get_cluster_id()) != 0", scheduler)
        self.assertIn("sr.hpool.to_xml(oss, host_inventory_ids);", scheduler)
        self.assertIn("sr.match.to_xml(oss);", scheduler)

    def test_cluster_rejects_duplicate_onedrs_vectors(self):
        cluster = (REPO_ROOT / "src/cluster/Cluster.cc").read_text()
        self.assertIn("one_drs_num != 1", cluster)
        self.assertIn("exactly one ONE_DRS vector", cluster)


if __name__ == "__main__":
    unittest.main()
