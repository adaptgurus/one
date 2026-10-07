import pathlib
import sys
import unittest
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.mapper.ilp_optimizer import ILPOptimizer
from lib.optimizer_parser import OptimizerParser
from lib.mapper.model import (
    Allocation,
    Capacity,
    DStoreRequirement,
    HostCapacity,
    VMGroup,
    VMRequirements,
    VMState,
)
from lib.resilience import (
    ResiliencePolicy,
    migration_cooldown_holds,
    validate_resilience,
)


def host(host_id, cpu, memory, domain, healthy=True):
    return HostCapacity(
        id=host_id,
        cpu=Capacity(total=cpu, usage=0),
        memory=Capacity(total=memory, usage=0),
        failure_domain=domain,
        healthy=healthy,
    )


def vm(vm_id, cpu, memory):
    return VMRequirements(
        id=vm_id,
        state=VMState.RUNNING,
        cpu_ratio=cpu,
        memory=memory,
    )


class ResilienceAdmissionTests(unittest.TestCase):
    @staticmethod
    def _cluster(policy):
        children = []
        if policy is not None:
            fields = [
                SimpleNamespace(qname=name, text=value)
                for name, value in policy.items()
            ]
            children.append(SimpleNamespace(qname="ONE_DRS", children=fields))
        return SimpleNamespace(template=SimpleNamespace(children=children))

    def test_resilience_exemption_is_explicit_opt_in(self):
        plain = SimpleNamespace(user_template=None)
        blocked_only = SimpleNamespace(
            user_template=SimpleNamespace(
                any_element=[
                    SimpleNamespace(qname="ONEDRS_BLOCKED", text="YES")
                ]
            )
        )
        opted_out = SimpleNamespace(
            user_template=SimpleNamespace(
                any_element=[
                    SimpleNamespace(
                        qname="LAYERSENTRY_DRS_RESILIENCE_EXEMPT",
                        text=" yes ",
                    )
                ]
            )
        )
        explicit_no = SimpleNamespace(
            user_template=SimpleNamespace(
                any_element=[
                    SimpleNamespace(
                        qname="LAYERSENTRY_DRS_RESILIENCE_EXEMPT",
                        text="NO",
                    )
                ]
            )
        )

        self.assertFalse(OptimizerParser._vm_resilience_exempt(plain))
        self.assertFalse(OptimizerParser._vm_resilience_exempt(blocked_only))
        self.assertTrue(OptimizerParser._vm_resilience_exempt(opted_out))
        self.assertFalse(OptimizerParser._vm_resilience_exempt(explicit_no))

    def test_place_requires_cluster_policy_context(self):
        with self.assertRaisesRegex(ValueError, "missing CLUSTER_POOL"):
            OptimizerParser._select_common_cluster_onedrs([])

    def test_place_accepts_identical_cluster_policies(self):
        policy = {"ENABLED": "YES", "HOST_FAILURE_TOLERANCE": "1"}
        selected = OptimizerParser._select_common_cluster_onedrs(
            [self._cluster(policy), self._cluster(policy)]
        )
        self.assertIsNotNone(selected)

    def test_place_rejects_mixed_cluster_policies(self):
        with self.assertRaisesRegex(ValueError, "different ONE_DRS policies"):
            OptimizerParser._select_common_cluster_onedrs(
                [
                    self._cluster({"ENABLED": "YES"}),
                    self._cluster({"ENABLED": "NO"}),
                ]
            )

    def test_pending_vm_history_is_not_current_placement(self):
        pending = VMRequirements(
            id=19,
            state=VMState.PENDING,
            cpu_ratio=0.2,
            memory=256,
        )
        running = VMRequirements(
            id=20,
            state=VMState.RUNNING,
            cpu_ratio=0.2,
            memory=256,
        )
        placements = OptimizerParser._build_current_placement(
            {19: 3, 20: 1},
            {19: 100, 20: 101},
            {},
            {19: pending, 20: running},
        )
        self.assertEqual(placements, [Allocation(20, 1, 101, "local")])

    def test_transient_monitoring_host_remains_drs_healthy(self):
        self.assertTrue(OptimizerParser._host_drs_healthy(1, True))
        self.assertTrue(OptimizerParser._host_drs_healthy(2, True))
        self.assertFalse(OptimizerParser._host_drs_healthy(1, False))
        self.assertFalse(OptimizerParser._host_drs_healthy(3, True))

    def test_missing_cluster_predictive_preserves_global_default(self):
        self.assertEqual(
            OptimizerParser._effective_predictive(
                {"PREDICTIVE": None},
                0,
            ),
            0,
        )
        self.assertEqual(
            OptimizerParser._effective_predictive(
                {"PREDICTIVE": 0.4},
                0,
            ),
            0.4,
        )

    def test_migration_cooldown_only_holds_for_healthy_eligible_host(self):
        self.assertTrue(
            migration_cooldown_holds(
                current_host=1,
                eligible_host_ids={1, 2},
                healthy_host_ids={1, 2},
                last_placement_time=950,
                cooldown_seconds=100,
                now=1000,
            )
        )
        self.assertFalse(
            migration_cooldown_holds(
                current_host=1,
                eligible_host_ids={1, 2},
                healthy_host_ids={2},
                last_placement_time=950,
                cooldown_seconds=100,
                now=1000,
            )
        )
        self.assertFalse(
            migration_cooldown_holds(
                current_host=1,
                eligible_host_ids={2},
                healthy_host_ids={1, 2},
                last_placement_time=950,
                cooldown_seconds=100,
                now=1000,
            )
        )
        self.assertFalse(
            migration_cooldown_holds(
                current_host=1,
                eligible_host_ids={1, 2},
                healthy_host_ids={1, 2},
                last_placement_time=800,
                cooldown_seconds=100,
                now=1000,
            )
        )

    def test_committed_capacity_not_real_usage_drives_ha_admission(self):
        hosts = [
            HostCapacity(
                id=1,
                cpu=Capacity(total=10, usage=1),
                memory=Capacity(total=100, usage=10),
                failure_domain="rack-a",
                healthy=True,
                committed_memory=90,
                committed_cpu=8,
            ),
            HostCapacity(
                id=2,
                cpu=Capacity(total=10, usage=1),
                memory=Capacity(total=100, usage=10),
                failure_domain="rack-b",
                healthy=True,
                committed_memory=90,
                committed_cpu=8,
            ),
            HostCapacity(
                id=3,
                cpu=Capacity(total=10, usage=1),
                memory=Capacity(total=100, usage=10),
                failure_domain="rack-c",
                healthy=True,
                committed_memory=30,
                committed_cpu=2,
            ),
        ]
        with self.assertRaisesRegex(ValueError, "memory demand"):
            validate_resilience(
                hosts,
                [],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_local_storage_recovery_reachability_is_enforced(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        local_only = VMRequirements(
            id=41,
            state=VMState.RUNNING,
            cpu_ratio=2,
            memory=8,
            storage={
                0: DStoreRequirement(
                    id=0,
                    vm_id=41,
                    size=10,
                    local_dstore_ids={1: [100]},
                    shared_dstore_ids=[],
                )
            },
        )
        with self.assertRaisesRegex(ValueError, "no eligible surviving host"):
            validate_resilience(
                hosts,
                [local_only],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_impossible_compound_failure_policy_fails_closed(self):
        hosts = [
            host(1, 10, 50, "rack-a"),
            host(2, 10, 50, "rack-a"),
            host(3, 10, 50, "rack-b"),
        ]
        with self.assertRaisesRegex(ValueError, "combined failure policy"):
            validate_resilience(
                hosts,
                [vm(1, 2, 10)],
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    failure_domain_tolerance=1,
                    combined_failure_modes=True,
                ),
            )

    def test_combined_rack_plus_host_failure_is_checked(self):
        hosts = [
            host(1, 10, 50, "rack-a"),
            host(2, 10, 50, "rack-a"),
            host(3, 10, 50, "rack-b"),
            host(4, 10, 50, "rack-c"),
            host(5, 10, 50, "rack-d"),
        ]
        # 120 GiB survives either one host loss (200 GiB) or one rack loss
        # (150 GiB), but not rack-a plus one more host (100 GiB).
        workloads = [vm(1, 4, 40), vm(2, 4, 40), vm(3, 4, 40)]
        with self.assertRaisesRegex(ValueError, "combined loss"):
            validate_resilience(
                hosts,
                workloads,
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    failure_domain_tolerance=1,
                    combined_failure_modes=True,
                ),
            )

    def test_zero_group_migration_budget_is_valid_freeze(self):
        policy = ResiliencePolicy(
            enabled=True,
            host_failure_tolerance=0,
            max_group_migrations=0,
        )
        self.assertEqual(policy.max_group_migrations, 0)

    def test_resilience_disabled_preserves_single_host_lab(self):
        report = validate_resilience(
            [host(1, 4, 16, "")],
            [vm(1, 2, 8)],
            ResiliencePolicy(enabled=False),
        )
        self.assertEqual(report.scenarios_checked, 0)

    def test_vm_recovery_reachability_blocks_pinned_single_target(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        pinned = VMRequirements(
            id=21,
            state=VMState.RUNNING,
            cpu_ratio=2,
            memory=8,
            host_ids={1},
        )
        with self.assertRaisesRegex(ValueError, "no eligible surviving host"):
            validate_resilience(
                hosts,
                [pinned],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_failure_domain_labels_can_be_required(self):
        hosts = [
            host(1, 16, 64, ""),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        hosts[0] = HostCapacity(
            id=hosts[0].id,
            cpu=hosts[0].cpu,
            memory=hosts[0].memory,
            failure_domain="host:1",
            failure_domain_labeled=False,
            healthy=True,
        )
        hosts[1] = HostCapacity(
            id=hosts[1].id,
            cpu=hosts[1].cpu,
            memory=hosts[1].memory,
            failure_domain="rack-b",
            failure_domain_labeled=True,
            healthy=True,
        )
        hosts[2] = HostCapacity(
            id=hosts[2].id,
            cpu=hosts[2].cpu,
            memory=hosts[2].memory,
            failure_domain="rack-c",
            failure_domain_labeled=True,
            healthy=True,
        )
        with self.assertRaisesRegex(ValueError, "explicit failure-domain labels"):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    failure_domain_spread=True,
                    require_failure_domain_labels=True,
                ),
            )

    def test_anti_affinity_recovery_requires_distinct_survivors(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        a = VMRequirements(
            id=31,
            state=VMState.RUNNING,
            cpu_ratio=2,
            memory=4,
            host_ids={1, 2},
        )
        b = VMRequirements(
            id=32,
            state=VMState.RUNNING,
            cpu_ratio=2,
            memory=4,
            host_ids={1, 2},
        )
        group = VMGroup(id=9, affined=False, vm_ids={31, 32})
        with self.assertRaisesRegex(ValueError, "distinct surviving hosts"):
            validate_resilience(
                hosts,
                [a, b],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
                vm_groups=[group],
            )

    def test_affined_group_is_not_subject_to_replica_disruption_budget(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
        ]
        optimizer = ILPOptimizer(
            current_placement=[Allocation(1, 1), Allocation(2, 1)],
            vm_requirements=[vm(1, 2, 4), vm(2, 2, 4)],
            vm_groups=[VMGroup(id=8, affined=True, vm_ids={1, 2})],
            host_capacities=hosts,
            dstore_capacities=[],
            image_dstore_capacities=[],
            vnet_capacities=[],
            criteria="pack",
            allowed_migrations=2,
            allowed_host_migrations=2,
            allowed_storage_migrations=0,
            max_group_migrations=1,
        )
        optimizer._add_variables()
        optimizer._create_expressions()
        optimizer._add_constraints()
        names = set(optimizer._model.constraints)
        self.assertFalse(
            any("migration_disruption_budget" in name for name in names),
            names,
        )

    def test_ilp_contains_failure_domain_and_group_disruption_constraints(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-a"),
            host(3, 16, 64, "rack-b"),
        ]
        vms = [vm(1, 2, 4), vm(2, 2, 4)]
        optimizer = ILPOptimizer(
            current_placement=[Allocation(1, 1), Allocation(2, 2)],
            vm_requirements=vms,
            vm_groups=[VMGroup(id=7, affined=False, vm_ids={1, 2})],
            host_capacities=hosts,
            dstore_capacities=[],
            image_dstore_capacities=[],
            vnet_capacities=[],
            criteria="pack",
            allowed_migrations=2,
            allowed_host_migrations=2,
            allowed_storage_migrations=0,
            failure_domain_spread=True,
            max_group_migrations=1,
        )
        optimizer._add_variables()
        optimizer._create_expressions()
        optimizer._add_constraints()
        names = set(optimizer._model.constraints)
        self.assertTrue(
            any("failure_domain_rack_a_spread" in name for name in names),
            names,
        )
        self.assertTrue(
            any("migration_disruption_budget" in name for name in names),
            names,
        )

    def test_survives_two_host_failures(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
            host(4, 16, 64, "rack-d"),
            host(5, 16, 64, "rack-e"),
        ]
        vms = [vm(1, 10, 32), vm(2, 10, 32), vm(3, 8, 32)]
        report = validate_resilience(
            hosts,
            vms,
            ResiliencePolicy(enabled=True, host_failure_tolerance=2),
        )
        self.assertEqual(report.healthy_hosts, 5)
        self.assertEqual(report.host_failure_tolerance, 2)

    def test_blocks_when_two_host_failures_exhaust_capacity(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
            host(4, 16, 64, "rack-d"),
        ]
        vms = [vm(1, 20, 80), vm(2, 20, 80)]
        with self.assertRaisesRegex(ValueError, "host loss"):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(enabled=True, host_failure_tolerance=2),
            )

    def test_blocks_correlated_failure_domain_loss(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-a"),
            host(3, 16, 64, "rack-b"),
            host(4, 16, 64, "rack-c"),
        ]
        # Every VM fits individually and N+1 host loss has enough capacity,
        # but losing rack-a removes two hosts and leaves only 128 GiB.
        vms = [vm(1, 5, 45), vm(2, 5, 45), vm(3, 5, 45)]
        with self.assertRaisesRegex(ValueError, "failure-domain loss"):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    failure_domain_tolerance=1,
                ),
            )

    def test_ignores_unhealthy_host_as_survivor_capacity(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b", healthy=False),
            host(3, 16, 64, "rack-c"),
        ]
        with self.assertRaisesRegex(ValueError, "leaves no surviving host"):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                ResiliencePolicy(enabled=True, host_failure_tolerance=2),
            )

    def test_pending_workload_counts_toward_failover_demand(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
            host(3, 10, 100, "rack-c"),
        ]
        pending = VMRequirements(
            id=9,
            state=VMState.PENDING,
            cpu_ratio=12,
            memory=210,
        )
        with self.assertRaisesRegex(ValueError, "memory demand"):
            validate_resilience(
                hosts,
                [pending],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_reserve_headroom_is_enforced(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
            host(3, 10, 100, "rack-c"),
        ]
        with self.assertRaisesRegex(ValueError, "memory demand"):
            validate_resilience(
                hosts,
                [vm(1, 5, 170)],
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    memory_reserve_percent=20,
                ),
            )


    @staticmethod
    def _vmgroup_parser_fixture(required_ids, placements):
        parser = object.__new__(OptimizerParser)
        parser._curr_alloc = dict(placements)

        def vm_member(vm_id):
            return SimpleNamespace(
                id=vm_id,
                template=SimpleNamespace(
                    vmgroup=SimpleNamespace(
                        children=[
                            SimpleNamespace(qname="VMGROUP_ID", text="0"),
                            SimpleNamespace(qname="ROLE", text="replica"),
                        ]
                    )
                ),
            )

        parser.scheduler_driver_action = SimpleNamespace(
            requirements=SimpleNamespace(
                vm=[SimpleNamespace(id=vm_id) for vm_id in required_ids]
            ),
            vm_pool=SimpleNamespace(
                vm=[vm_member(vm_id) for vm_id in (27, 28, 36)]
            ),
            vm_group_pool=SimpleNamespace(
                vm_group=[
                    SimpleNamespace(
                        id=0,
                        roles=SimpleNamespace(
                            role=[
                                SimpleNamespace(
                                    name="replica",
                                    policy="ANTI_AFFINED",
                                    host_affined=None,
                                    host_anti_affined=None,
                                )
                            ]
                        ),
                        template=None,
                    )
                ]
            ),
        )
        return parser

    def test_active_anti_affined_members_stay_in_optimizer_group(self):
        parser = self._vmgroup_parser_fixture(
            {27, 28, 36},
            {27: 1, 28: 1, 36: 1},
        )
        (
            groups,
            affined_hosts,
            anti_affined_hosts,
            static_affined_hosts,
            static_anti_affined_hosts,
        ) = parser._parse_vm_groups()

        self.assertEqual(len(groups), 1)
        self.assertFalse(groups[0].affined)
        self.assertEqual(groups[0].vm_ids, {27, 28, 36})
        self.assertEqual(affined_hosts, {})
        self.assertEqual(anti_affined_hosts, {})
        self.assertEqual(static_affined_hosts, {})
        self.assertEqual(static_anti_affined_hosts, {})

    def test_only_non_requested_peer_becomes_fixed_anti_affinity_host(self):
        parser = self._vmgroup_parser_fixture(
            {27, 28},
            {27: 2, 28: 3, 36: 1},
        )
        groups, _, anti_affined_hosts, _, _ = parser._parse_vm_groups()

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0].vm_ids, {27, 28})
        self.assertEqual(anti_affined_hosts[27], {1})
        self.assertEqual(anti_affined_hosts[28], {1})

    def test_cluster_assignment_expands_idle_local_datastore_hosts(self):
        expanded = OptimizerParser._expand_local_dstore_hosts(
            {100: {1, 2}},
            {
                100: {"CLUSTERS": [0]},
                200: {"CLUSTERS": [1]},
            },
            {0: 0, 1: 0, 2: 0, 3: 0, 4: 1},
        )
        self.assertEqual(expanded[100], {0, 1, 2, 3})
        self.assertEqual(expanded[200], {4})

    def test_migratable_local_datastore_falls_back_to_current_id(self):
        parser = object.__new__(OptimizerParser)
        parser._system_local_dstore_hosts = {100: {1, 2, 3}}
        parser._system_local_dstore_attrs = {
            100: {"DS_MIGRATE": True, "TM_MAD": "SSH", "CLUSTERS": [0]}
        }
        parser._system_shared_dstore_attrs = {}
        parser._used_local_dstores = {19: 100}
        parser._used_shared_dstores = {}
        vm_req = SimpleNamespace(
            id=19,
            hosts=SimpleNamespace(id=[1, 2, 3]),
            datastores=SimpleNamespace(id=[]),
        )
        got = parser._find_datastores(vm_req)
        self.assertEqual(
            got["local_dstore_ids"],
            {1: [100], 2: [100], 3: [100]},
        )
        self.assertEqual(got["shared_dstore_ids"], [])

    def test_migratable_shared_datastore_falls_back_to_current_id(self):
        parser = object.__new__(OptimizerParser)
        parser._system_local_dstore_hosts = {}
        parser._system_local_dstore_attrs = {}
        parser._system_shared_dstore_attrs = {
            200: {"DS_MIGRATE": True, "TM_MAD": "CEPH", "CLUSTERS": [0]}
        }
        parser._used_local_dstores = {}
        parser._used_shared_dstores = {19: 200}
        vm_req = SimpleNamespace(
            id=19,
            hosts=SimpleNamespace(id=[1, 2, 3]),
            datastores=SimpleNamespace(id=[]),
        )
        got = parser._find_datastores(vm_req)
        self.assertEqual(got["local_dstore_ids"], {})
        self.assertEqual(got["shared_dstore_ids"], [200])

    def test_idle_local_datastore_capacity_uses_generic_host_disk(self):
        parser = object.__new__(OptimizerParser)
        parser._system_local_dstore_attrs = {
            100: {"CLUSTERS": [0], "TM_MAD": "SSH"}
        }
        host = SimpleNamespace(
            cluster_id=0,
            host_share=SimpleNamespace(
                datastores=SimpleNamespace(
                    ds=[],
                    used_disk=100,
                    free_disk=900,
                )
            ),
        )
        got = parser._parse_local_dstore_capacities(host)
        self.assertEqual(set(got), {100})
        self.assertEqual(got[100].total, 1000)
        self.assertEqual(got[100].usage, 100)


if __name__ == "__main__":
    unittest.main()
