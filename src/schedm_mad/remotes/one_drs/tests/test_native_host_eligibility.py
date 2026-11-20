"""VMGroup constraints must never expand native authorization/requirements."""
import pathlib
import sys
import unittest
from contextlib import ExitStack
from types import SimpleNamespace as N
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.optimizer_parser import OptimizerParser
from lib.mapper.model import VMRequirements, VMState


class NativeHostEligibilityTests(unittest.TestCase):
    def parse_host_constraints(self, allowed, affinity=None, anti_affinity=None):
        parser = object.__new__(OptimizerParser)
        parser.mode = "PLACE"
        parser.config = {
            "MODE": {"POLICY": "PACK"},
            "RESILIENCE": OptimizerParser.DEFAULT_CONFIG["RESILIENCE"].copy(),
            "SOLVER": None,
        }
        parser._curr_alloc = {}
        parser._used_local_dstores = {}
        parser._used_shared_dstores = {}
        parser.scheduler_driver_action = N(requirements=N(vm=[N(id=7)]), vm_pool=N(vm=[]))
        native = VMRequirements(id=7, state=VMState.RUNNING, cpu_ratio=1,
                                memory=256, host_ids=set(allowed))
        affined = {} if affinity is None else {7: set(affinity)}
        anti = {} if anti_affinity is None else {7: set(anti_affinity)}
        groups = ([], affined, anti, affined, anti)
        with ExitStack() as stack:
            for name, result in {
                "_parse_vm_groups": groups,
                "_parse_vm_requirements": {7: native},
                "_parse_cluster": {},
                "_build_current_placement": [],
                "_parse_host_capacities": [],
                "_parse_shared_dstore_capacities": [],
                "_parse_image_dstore_capacities": [],
                "_parse_vnet_capacities": [],
            }.items():
                stack.enter_context(patch.object(OptimizerParser, name, return_value=result))
            stack.enter_context(patch.object(OptimizerParser, "log_general"))
            admission = stack.enter_context(patch("lib.optimizer_parser.validate_resilience",
                return_value=N(healthy_hosts=0, host_failure_tolerance=0, failure_domain_tolerance=0)))
            optimizer = stack.enter_context(patch("lib.optimizer_parser.ILPOptimizer"))
            parser.build_optimizer()
        optimize_hosts = optimizer.call_args.kwargs["vm_requirements"][0].host_ids
        recovery_hosts = admission.call_args.args[1][0].host_ids
        self.assertEqual(native.host_ids, set(allowed), "native eligibility was mutated")
        return optimize_hosts, recovery_hosts

    def test_host_affinity_cannot_restore_native_denied_target(self):
        for allowed, affined, expected in [({2}, {3}, set()),
                                            ({1, 2}, {2, 3}, {2}),
                                            (set(), {3}, set())]:
            with self.subTest(allowed=allowed, affined=affined):
                self.assertEqual(self.parse_host_constraints(allowed, affinity=affined),
                                 (expected, expected))

    def test_host_anti_affinity_only_removes_native_candidates(self):
        self.assertEqual(self.parse_host_constraints({1, 2}, anti_affinity={2, 3}),
                         ({1}, {1}))

    def test_no_group_constraint_preserves_native_candidates(self):
        self.assertEqual(self.parse_host_constraints({1, 2}), ({1, 2}, {1, 2}))


if __name__ == "__main__":
    unittest.main()
