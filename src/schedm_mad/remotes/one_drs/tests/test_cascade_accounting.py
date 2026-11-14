"""Unknown native host commitments must not silently disappear from the proof."""
import pathlib
import sys
import unittest
from dataclasses import replace

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.mapper.model import Capacity, HostCapacity, VMRequirements, VMState
from lib.resilience import ResiliencePolicy, validate_resilience


def h(i, memory=10, cpu=100, committed_mem=0, committed_cpu=0):
    return HostCapacity(
        id=i, memory=Capacity(total=memory, usage=0),
        cpu=Capacity(total=cpu, usage=0),
        failure_domain=f"rack-{i}",
        committed_memory=committed_mem,
        committed_cpu=committed_cpu,
    )

def v(i, memory=6, cpu=1, pending=False):
    return VMRequirements(
        id=i, memory=memory, cpu_ratio=cpu,
        state=VMState.PENDING if pending else VMState.RUNNING,
    )


class UnmodeledNativeCommitments(unittest.TestCase):
    def test_unmodeled_committed_memory_cannot_be_spent_again(self):
        # Host usage 17 > selected VM requirements 12; no proof accounts for
        # the residual 5. Existing code wrongly says feasible after any loss.
        hosts = [h(0, committed_mem=9), h(1, committed_mem=8), h(2)]
        with self.assertRaisesRegex(ValueError, "unmodeled committed memory"):
            validate_resilience(hosts, [v(101), v(102)],
                                ResiliencePolicy(enabled=True, host_failure_tolerance=1))

    def test_unmodeled_committed_cpu_cannot_be_spent_again(self):
        hosts = [
            h(0, committed_cpu=9), h(1, committed_cpu=8), h(2),
        ]
        with self.assertRaisesRegex(ValueError, "unmodeled committed CPU"):
            validate_resilience(hosts, [v(103, cpu=2), v(104, cpu=2)],
                                ResiliencePolicy(enabled=True, host_failure_tolerance=1))

    def test_unknown_guest_when_no_requirements_still_rejects(self):
        with self.assertRaisesRegex(ValueError, "unmodeled committed memory"):
            validate_resilience([h(0, committed_mem=2), h(1)], [],
                                ResiliencePolicy(enabled=True, host_failure_tolerance=1))

    def test_nan_host_commitment_must_never_pass(self):
        with self.assertRaisesRegex(ValueError, "invalid host 0 committed memory"):
            validate_resilience([h(0, committed_mem=float("nan")), h(1)],
                                [v(105)],
                                ResiliencePolicy(enabled=True, host_failure_tolerance=1))

    def test_known_commitments_without_unknown_workload_still_pass(self):
        hosts = [h(0, committed_mem=6, committed_cpu=1),
                 h(1, committed_mem=6, committed_cpu=1), h(2)]
        report = validate_resilience(hosts, [v(106), v(107)],
                                     ResiliencePolicy(enabled=True, host_failure_tolerance=1))
        self.assertEqual(report.scenarios_checked, 3)

    def test_pending_vm_consumes_extra_capacity_without_false_unknown(self):
        hosts = [h(0, committed_mem=6, committed_cpu=1), h(1), h(2)]
        report = validate_resilience(hosts, [v(108), v(109, memory=2, pending=True)],
                                     ResiliencePolicy(enabled=True, host_failure_tolerance=1))
        self.assertEqual(report.scenarios_checked, 3)

    def test_disabled_resilience_does_not_change_existing_scheduling(self):
        hosts = [h(0, committed_mem=9), h(1)]
        report = validate_resilience(hosts, [v(110)],
                                     ResiliencePolicy(enabled=False))
        self.assertEqual(report.scenarios_checked, 0)


if __name__ == "__main__":
    unittest.main()
