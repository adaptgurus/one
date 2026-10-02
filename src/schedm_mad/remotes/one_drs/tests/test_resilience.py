import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.mapper.ilp_optimizer import ILPOptimizer
from lib.mapper.model import (
    Allocation,
    Capacity,
    DStoreRequirement,
    HostCapacity,
    VMGroup,
    VMRequirements,
    VMState,
)
from lib.resilience import ResiliencePolicy, validate_resilience


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
                committed_memory=0,
                committed_cpu=0,
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


if __name__ == "__main__":
    unittest.main()
