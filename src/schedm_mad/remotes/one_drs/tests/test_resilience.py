import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.mapper.ilp_optimizer import ILPOptimizer
from lib.mapper.model import (
    Allocation,
    Capacity,
    HostCapacity,
    PCIDeviceRequirement,
    VMGroup,
    VMRequirements,
    VMState,
)
from lib.resilience import (
    ResilienceAdmissionError,
    ResilienceDegradedError,
    ResiliencePolicy,
    validate_resilience,
)


def host(host_id, cpu, memory, domain, healthy=True, explicit=True):
    return HostCapacity(
        id=host_id,
        cpu=Capacity(total=cpu, usage=0),
        memory=Capacity(total=memory, usage=0),
        failure_domain=domain,
        failure_domain_explicit=explicit,
        healthy=healthy,
    )


def vm(
    vm_id,
    cpu,
    memory,
    protected=True,
    state=VMState.RUNNING,
    device=False,
    device_qualified=False,
    storage_qualified=True,
):
    return VMRequirements(
        id=vm_id,
        state=state,
        cpu_ratio=cpu,
        memory=memory,
        pci_devices=(
            [PCIDeviceRequirement(vendor_id="10de")] if device else []
        ),
        resilience_protected=protected,
        resilience_device_qualified=device_qualified,
        resilience_storage_qualified=storage_qualified,
    )


def policy(**kwargs):
    # Most focused tests exercise one pre-admission layer at a time. Exact
    # scenario proof has dedicated tests below.
    kwargs.setdefault("exact_recovery_proof", False)
    return ResiliencePolicy(enabled=True, **kwargs)


def all_candidates(hosts, vms):
    ids = {h.id for h in hosts if h.healthy}
    return {item.id: set(ids) for item in vms}


class ResilienceAdmissionTests(unittest.TestCase):
    def test_default_policy_is_disabled_and_exact_proof_defaults_on(self):
        default = ResiliencePolicy()
        self.assertFalse(default.enabled)
        self.assertTrue(default.exact_recovery_proof)

    def test_disabled_policy_preserves_single_host_compatibility(self):
        report = validate_resilience(
            [host(1, 4, 16, "rack-a")],
            [vm(1, 2, 4)],
            ResiliencePolicy(),
        )
        self.assertFalse(report.enabled)

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
            policy(host_failure_tolerance=2),
        )
        self.assertEqual(report.healthy_hosts, 5)
        self.assertEqual(report.remaining_host_failure_tolerance, 2)

    def test_blocks_when_two_host_failures_exhaust_capacity(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
            host(4, 16, 64, "rack-d"),
        ]
        vms = [vm(1, 20, 80), vm(2, 20, 80)]
        with self.assertRaisesRegex(ResilienceAdmissionError, "memory demand"):
            validate_resilience(
                hosts,
                vms,
                policy(host_failure_tolerance=2),
            )

    def test_candidate_redundancy_blocks_pinned_vm(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "eligible healthy host"
        ):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                policy(host_failure_tolerance=1),
                candidate_hosts={1: {1}},
            )

    def test_device_failover_requires_explicit_qualification(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
        ]
        item = vm(1, 2, 4, device=True)
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "device failover is not qualified"
        ):
            validate_resilience(
                hosts,
                [item],
                policy(host_failure_tolerance=1),
                candidate_hosts={1: {1, 2}},
            )

    def test_local_storage_failover_requires_explicit_qualification(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
        ]
        item = vm(1, 2, 4, storage_qualified=False)
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "storage whose data failover is not"
        ):
            validate_resilience(
                hosts,
                [item],
                policy(host_failure_tolerance=1),
                candidate_hosts={1: {1, 2}},
            )

    def test_affined_group_requires_common_recovery_hosts(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        vms = [vm(1, 2, 4), vm(2, 2, 4)]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "common recovery host"
        ):
            validate_resilience(
                hosts,
                vms,
                policy(host_failure_tolerance=1),
                candidate_hosts={1: {1, 2}, 2: {2, 3}},
                vm_groups=[
                    VMGroup(id=7, affined=True, vm_ids={1, 2})
                ],
            )

    def test_affined_group_common_host_must_fit_whole_group(self):
        hosts = [
            host(1, 4, 8, "rack-a"),
            host(2, 4, 8, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        vms = [vm(1, 3, 6), vm(2, 3, 6)]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "fit the whole group"
        ):
            validate_resilience(
                hosts,
                vms,
                policy(host_failure_tolerance=1),
                candidate_hosts={1: {1, 2}, 2: {1, 2}},
                vm_groups=[
                    VMGroup(id=7, affined=True, vm_ids={1, 2})
                ],
            )

    def test_anti_affined_group_requires_spare_distinct_host(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        vms = [vm(1, 2, 4), vm(2, 2, 4), vm(3, 2, 4)]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "distinct recovery host"
        ):
            validate_resilience(
                hosts,
                vms,
                policy(host_failure_tolerance=1),
                candidate_hosts={
                    1: {1, 2, 3},
                    2: {1, 2, 3},
                    3: {1, 2, 3},
                },
                vm_groups=[
                    VMGroup(id=8, affined=False, vm_ids={1, 2, 3})
                ],
            )

    def test_hall_condition_catches_heterogeneous_candidate_trap(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
            host(4, 16, 64, "rack-d"),
        ]
        vms = [vm(1, 2, 4), vm(2, 2, 4), vm(3, 2, 4)]
        # Union has 4 hosts (= N+1), but VMs 1 and 2 share only two
        # candidates, so one Host loss can make distinct placement impossible.
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "failure-safe distinct placement"
        ):
            validate_resilience(
                hosts,
                vms,
                policy(host_failure_tolerance=1),
                candidate_hosts={
                    1: {1, 2},
                    2: {1, 2},
                    3: {3, 4},
                },
                vm_groups=[
                    VMGroup(id=9, affined=False, vm_ids={1, 2, 3})
                ],
            )

    def test_failure_domain_candidate_redundancy(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-a"),
            host(3, 16, 64, "rack-b"),
        ]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "eligible failure domain"
        ):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                policy(
                    host_failure_tolerance=1,
                    failure_domain_tolerance=1,
                ),
                candidate_hosts={1: {1, 2}},
            )

    def test_domain_policy_fails_closed_on_unlabeled_host(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "host:2", explicit=False),
            host(3, 16, 64, "rack-b"),
        ]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "missing on Hosts"
        ):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                policy(failure_domain_tolerance=1),
                candidate_hosts={1: {1, 2, 3}},
            )

    def test_degraded_cluster_pauses_ordinary_optimization(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        with self.assertRaisesRegex(
            ResilienceDegradedError, "ordinary OneDRS optimization is paused"
        ):
            validate_resilience(
                hosts,
                [vm(1, 2, 4)],
                policy(host_failure_tolerance=2),
                cluster_host_count=4,
            )

    def test_consumed_failure_budget_can_be_explicitly_acknowledged(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-b"),
            host(3, 16, 64, "rack-c"),
        ]
        report = validate_resilience(
            hosts,
            [vm(1, 2, 4)],
            policy(
                host_failure_tolerance=2,
                pause_on_degraded=False,
            ),
            cluster_host_count=4,
        )
        self.assertEqual(report.active_unavailable_hosts, 1)
        self.assertEqual(report.remaining_host_failure_tolerance, 1)

    def test_excluded_workload_does_not_consume_failover_reserve(self):
        hosts = [
            host(1, 4, 16, "rack-a"),
            host(2, 4, 16, "rack-b"),
        ]
        report = validate_resilience(
            hosts,
            [vm(1, 100, 1000, protected=False)],
            policy(host_failure_tolerance=1),
        )
        self.assertEqual(report.protected_vms, 0)

    def test_pending_workload_counts_toward_failover_demand(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
            host(3, 10, 100, "rack-c"),
        ]
        with self.assertRaisesRegex(ResilienceAdmissionError, "memory demand"):
            validate_resilience(
                hosts,
                [vm(9, 12, 210, state=VMState.PENDING)],
                policy(host_failure_tolerance=1),
            )

    def test_reserve_headroom_is_enforced(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
            host(3, 10, 100, "rack-c"),
        ]
        with self.assertRaisesRegex(ResilienceAdmissionError, "memory demand"):
            validate_resilience(
                hosts,
                [vm(1, 5, 170)],
                policy(
                    host_failure_tolerance=1,
                    memory_reserve_percent=20,
                ),
            )

    def test_exact_proof_catches_capacity_fragmentation(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
        ]
        vms = [vm(1, 6, 10), vm(2, 6, 10), vm(3, 6, 10)]
        # Aggregate CPU is 20 >= 18 and every VM has two candidates, but
        # three 6-CPU VMs cannot fit on two 10-CPU Hosts.
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "exact recovery placement proof"
        ):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=0,
                    exact_recovery_proof=True,
                ),
                candidate_hosts=all_candidates(hosts, vms),
            )

    def test_exact_proof_covers_dual_host_loss(self):
        hosts = [
            host(1, 10, 100, "rack-a"),
            host(2, 10, 100, "rack-b"),
            host(3, 10, 100, "rack-c"),
            host(4, 10, 100, "rack-d"),
        ]
        vms = [vm(1, 5, 20), vm(2, 5, 20)]
        report = validate_resilience(
            hosts,
            vms,
            ResiliencePolicy(
                enabled=True,
                host_failure_tolerance=2,
                exact_recovery_proof=True,
            ),
            candidate_hosts=all_candidates(hosts, vms),
        )
        self.assertEqual(report.remaining_host_failure_tolerance, 2)

    def test_exact_proof_scenario_budget_fails_closed(self):
        hosts = [
            host(i, 10, 100, f"rack-{i}")
            for i in range(1, 13)
        ]
        vms = [vm(1, 1, 1)]
        with self.assertRaisesRegex(
            ResilienceAdmissionError, "scenarios exceed the bounded limit"
        ):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=2,
                    exact_recovery_proof=True,
                    max_exact_failure_scenarios=64,
                ),
                candidate_hosts=all_candidates(hosts, vms),
            )

    def test_topology_spread_balances_instead_of_one_per_domain(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-a"),
            host(3, 16, 64, "rack-b"),
            host(4, 16, 64, "rack-b"),
            host(5, 16, 64, "rack-c"),
            host(6, 16, 64, "rack-c"),
        ]
        vms = [vm(i, 1, 1) for i in range(1, 7)]
        optimizer = ILPOptimizer(
            current_placement=[
                Allocation(i, i) for i in range(1, 7)
            ],
            vm_requirements=vms,
            vm_groups=[
                VMGroup(id=9, affined=False, vm_ids=set(range(1, 7)))
            ],
            host_capacities=hosts,
            dstore_capacities=[],
            image_dstore_capacities=[],
            vnet_capacities=[],
            criteria="pack",
            allowed_migrations=6,
            allowed_host_migrations=6,
            allowed_storage_migrations=0,
            failure_domain_spread=True,
            max_group_migrations=1,
        )
        optimizer._add_variables()
        optimizer._create_expressions()
        optimizer._add_constraints()

        spread = [
            constraint
            for name, constraint in optimizer._model.constraints.items()
            if "failure_domain_rack_a_spread" in name
        ]
        self.assertEqual(len(spread), 1)
        # PuLP stores <= 2 as a constraint with constant -2.
        self.assertEqual(spread[0].constant, -2)
        self.assertTrue(
            any(
                "migration_disruption_budget" in name
                for name in optimizer._model.constraints
            )
        )


if __name__ == "__main__":
    unittest.main()
