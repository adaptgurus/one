import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.mapper.model import Capacity, HostCapacity, VMRequirements, VMState
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
            ResiliencePolicy(host_failure_tolerance=2),
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
        with self.assertRaisesRegex(ValueError, r"N\+2"):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(host_failure_tolerance=2),
            )

    def test_blocks_correlated_failure_domain_loss(self):
        hosts = [
            host(1, 16, 64, "rack-a"),
            host(2, 16, 64, "rack-a"),
            host(3, 16, 64, "rack-b"),
            host(4, 16, 64, "rack-c"),
        ]
        vms = [vm(1, 20, 150)]
        with self.assertRaisesRegex(ValueError, "failure domain"):
            validate_resilience(
                hosts,
                vms,
                ResiliencePolicy(
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
                ResiliencePolicy(host_failure_tolerance=2),
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
                ResiliencePolicy(host_failure_tolerance=1),
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
                    host_failure_tolerance=1,
                    memory_reserve_percent=20,
                ),
            )


if __name__ == "__main__":
    unittest.main()
