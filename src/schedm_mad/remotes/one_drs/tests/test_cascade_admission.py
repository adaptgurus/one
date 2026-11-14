"""Cascading-fault cases: distinguish summed headroom from simultaneous placement.

All tests use local Python host/VM models and never contact the DR cluster.
"""
import pathlib
import sys
import unittest
from dataclasses import replace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.mapper.model import Capacity, HostCapacity, VMGroup, VMRequirements, VMState
from lib.resilience import ResiliencePolicy, validate_resilience


def host(host_id, memory, domain, cpu=100):
    return HostCapacity(
        id=host_id,
        memory=Capacity(total=memory, usage=0),
        cpu=Capacity(total=cpu, usage=0),
        failure_domain=domain,
        failure_domain_labeled=True,
    )


def vm(vm_id, memory, cpu=1):
    return VMRequirements(
        id=vm_id, state=VMState.RUNNING,
        memory=memory, cpu_ratio=cpu,
    )


class CascadingPlacementAdmissionTests(unittest.TestCase):
    def test_aggregate_survival_must_not_double_allocate_only_large_host(self):
        # A lost 10-GiB host leaves [10,3,3] = 16 GiB >= 12 GiB
        # demand, but the only eligible host has 10 GiB, not 12.
        hosts = [
            host(1, 10, "rack-a"),
            host(2, 10, "rack-b"),
            host(3, 3, "rack-c"),
            host(4, 3, "rack-d"),
        ]
        with self.assertRaisesRegex(ValueError, "resilience admission failed"):
            validate_resilience(
                hosts, [vm(101, 6), vm(102, 6)],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_three_large_vms_do_not_fit_two_large_survivors(self):
        # After losing host1: 10+10+1=21 >= 18 aggregate,
        # but three separate 6-GiB VMs cannot fit on two 10-GiB hosts.
        hosts = [
            host(1, 10, "rack-a"),
            host(2, 10, "rack-b"),
            host(3, 10, "rack-c"),
            host(4, 1, "rack-d"),
        ]
        with self.assertRaisesRegex(ValueError, "resilience admission failed"):
            validate_resilience(
                hosts, [vm(201, 6), vm(202, 6), vm(203, 6)],
                ResiliencePolicy(enabled=True, host_failure_tolerance=1),
            )

    def test_rack_then_host_cascade_requires_simultaneous_recovery_fit(self):
        # Rack A loss, followed by one host in rack B, leaves 10+3
        # aggregate (>= 2x6), but only one host can run a 6-GiB guest.
        hosts = [
            host(1, 10, "rack-a"),
            host(2, 10, "rack-a"),
            host(3, 10, "rack-b"),
            host(4, 10, "rack-b"),
            host(5, 3, "rack-c"),
        ]
        with self.assertRaisesRegex(ValueError, "resilience admission failed"):
            validate_resilience(
                hosts, [vm(301, 6), vm(302, 6)],
                ResiliencePolicy(
                    enabled=True,
                    host_failure_tolerance=1,
                    failure_domain_tolerance=1,
                    combined_failure_modes=True,
                ),
            )

    def test_valid_one_host_recovery_remains_admitted(self):
        hosts = [
            host(1, 10, "rack-a"),
            host(2, 10, "rack-b"),
            host(3, 10, "rack-c"),
            host(4, 3, "rack-d"),
        ]
        report = validate_resilience(
            hosts, [vm(401, 6), vm(402, 6)],
            ResiliencePolicy(enabled=True, host_failure_tolerance=1),
        )
        self.assertEqual(report.scenarios_checked, 4)

    def test_non_enforced_policy_remains_backward_compatible(self):
        report = validate_resilience(
            [host(1, 10, "rack-a")],
            [vm(501, 6), vm(502, 6)],
            ResiliencePolicy(enabled=False),
        )
        self.assertEqual(report.scenarios_checked, 0)


    def test_affinity_must_share_one_host_with_sufficient_joint_capacity(self):
        hosts = [
            host(1, 10, "rack-a"), host(2, 10, "rack-b"),
            host(3, 10, "rack-c"), host(4, 10, "rack-d"),
        ]
        workloads = [
            replace(vm(601, 6), host_ids={1, 2}),
            replace(vm(602, 6), host_ids={2, 3}),
        ]
        with self.assertRaisesRegex(ValueError, "resilience admission failed"):
            validate_resilience(
                hosts, workloads,
                ResiliencePolicy(enabled=True),
                vm_groups=[VMGroup(id=1, affined=True, vm_ids={601, 602})],
            )

    def test_cross_group_anti_affinity_must_have_one_consistent_assignment(self):
        hosts = [host(1, 20, "rack-a"), host(2, 20, "rack-b")]
        workloads = [vm(611, 1), vm(612, 1), vm(613, 1)]
        groups = [
            VMGroup(id=10, affined=False, vm_ids={611, 612}),
            VMGroup(id=11, affined=False, vm_ids={612, 613}),
            VMGroup(id=12, affined=False, vm_ids={611, 613}),
        ]
        with self.assertRaisesRegex(ValueError, "resilience admission failed"):
            validate_resilience(
                hosts, workloads,
                ResiliencePolicy(enabled=True),
                vm_groups=groups,
            )

    def test_per_host_reserve_is_not_replaceable_by_aggregate_reserve(self):
        # One VM needs 9 but each host protected 20-percent reserve
        # makes the individually usable capacity only 8.
        with self.assertRaisesRegex(ValueError, "reserve-compliant"):
            validate_resilience(
                [host(1, 10, "rack-a"), host(2, 10, "rack-b")],
                [vm(701, 9)],
                ResiliencePolicy(enabled=True, memory_reserve_percent=20),
            )

    def test_bad_cpu_measurement_rejects_protection_policy(self):
        with self.assertRaisesRegex(ValueError, "invalid VM 711 CPU"):
            validate_resilience(
                [host(1, 10, "rack-a"), host(2, 10, "rack-b")],
                [vm(711, 2, float("nan"))],
                ResiliencePolicy(enabled=True),
            )

    def test_solver_unavailable_refuses_without_a_false_ha_pass(self):
        class NoSolver:
            def available(self):
                return None
        hosts = [
            host(1, 10, "rack-a"), host(2, 10, "rack-b"),
            host(3, 3, "rack-c"), host(4, 3, "rack-d"),
        ]
        with patch("lib.recovery_fit.PULP_CBC_CMD", return_value=NoSolver()):
            with self.assertRaisesRegex(ValueError, "solver unavailable"):
                validate_resilience(
                    hosts, [vm(721, 6), vm(722, 6)],
                    ResiliencePolicy(enabled=True, host_failure_tolerance=1),
                )

    def test_solver_indeterminate_refuses_without_a_false_ha_pass(self):
        hosts = [
            host(1, 10, "rack-a"), host(2, 10, "rack-b"),
            host(3, 3, "rack-c"), host(4, 3, "rack-d"),
        ]
        with patch("lib.recovery_fit.LpProblem.solve", return_value=0):
            with self.assertRaisesRegex(ValueError, "no verified simultaneous"):
                validate_resilience(
                    hosts, [vm(731, 6), vm(732, 6)],
                    ResiliencePolicy(enabled=True, host_failure_tolerance=1),
                )

    def test_duplicate_host_id_does_not_double_count_survivor_capacity(self):
        hosts = [host(1, 10, "rack-a"), host(1, 10, "rack-a")]
        with self.assertRaisesRegex(ValueError, "duplicate host or VM"):
            validate_resilience(hosts, [vm(741, 5)], ResiliencePolicy(enabled=True))


if __name__ == "__main__":
    unittest.main()
