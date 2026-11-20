"""Native VMGroup rules must survive parser normalization and projection."""
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


def role(name, members, policy=None, allow=None, deny=None):
    return N(name=name, members=set(members), policy=policy,
             host_affined=allow, host_anti_affined=deny)


def fixture(roles, rules=(), required=None, placements=None):
    parser = object.__new__(OptimizerParser)
    parser._curr_alloc = dict(placements or {})
    all_ids = set().union(*(item.members for item in roles))
    required = all_ids if required is None else set(required)
    vms = [N(id=vid, user_template=None, template=N(vmgroup=N(children=[
        N(qname="VMGROUP_ID", text="7"), N(qname="ROLE", text=item.name),
    ]))) for item in roles for vid in sorted(item.members)]
    parser.scheduler_driver_action = N(
        requirements=N(vm=[N(id=vid) for vid in sorted(required)]),
        vm_pool=N(vm=vms),
        vm_group_pool=N(vm_group=[N(id=7, roles=N(role=roles),
            template=N(children=[N(qname=key, text=value) for key, value in rules]))]),
    )
    return parser


def relations(groups):
    return {(group.affined, frozenset(group.vm_ids)) for group in groups}


def accepts(groups, placement):
    for group in groups:
        hosts = [placement[vid] for vid in group.vm_ids]
        if group.affined and len(set(hosts)) != 1:
            return False
        if not group.affined and len(set(hosts)) != len(hosts):
            return False
    return True


class NativeVMGroupConstraintTests(unittest.TestCase):
    def project(self, parser, allowed):
        parser.mode = "PLACE"
        parser.config = {
            "MODE": {"POLICY": "PACK"},
            "RESILIENCE": OptimizerParser.DEFAULT_CONFIG["RESILIENCE"].copy(),
            "SOLVER": None,
        }
        parser._used_local_dstores = {}
        parser._used_shared_dstores = {}
        original = {
            vid: VMRequirements(id=vid, state=VMState.RUNNING, cpu_ratio=1,
                memory=256, host_ids=set(hosts)) for vid, hosts in allowed.items()
        }
        native_objects = dict(original)
        with ExitStack() as stack:
            for method, result in {
                "_parse_vm_requirements": original,
                "_parse_cluster": {},
                "_build_current_placement": [],
                "_parse_host_capacities": [],
                "_parse_shared_dstore_capacities": [],
                "_parse_image_dstore_capacities": [],
                "_parse_vnet_capacities": [],
            }.items():
                stack.enter_context(patch.object(OptimizerParser, method, return_value=result))
            stack.enter_context(patch.object(OptimizerParser, "log_general"))
            admission = stack.enter_context(patch("lib.optimizer_parser.validate_resilience",
                return_value=N(healthy_hosts=0, host_failure_tolerance=0, failure_domain_tolerance=0)))
            optimizer = stack.enter_context(patch("lib.optimizer_parser.ILPOptimizer"))
            parser.build_optimizer()
        self.assertEqual({vid: req.host_ids for vid, req in native_objects.items()}, allowed,
                         "native eligibility was mutated")
        return (
            {req.id: req.host_ids for req in optimizer.call_args.kwargs["vm_requirements"]},
            {req.id: req.host_ids for req in admission.call_args.args[1]},
        )

    def test_allow_and_deny_both_narrow_native_eligibility(self):
        parser = fixture([role("db", {1}, allow="2,3,4", deny="3,4")])
        self.assertEqual(self.project(parser, {1: {1, 2, 3}}), ({1: {2}}, {1: {2}}))

    def test_allow_never_restores_native_denied_host(self):
        parser = fixture([role("db", {1}, allow="2,3", deny="3")])
        self.assertEqual(self.project(parser, {1: {1}}), ({1: set()}, {1: set()}))

    def test_fixed_peer_exclusion_is_not_a_static_recovery_policy(self):
        parser = fixture([role("replica", {1, 2}, "ANTI_AFFINED", "1,2,3", "3")],
                         required={1}, placements={1: 1, 2: 2})
        self.assertEqual(self.project(parser, {1: {1, 2, 3, 4}}),
                         ({1: {1}}, {1: {1, 2}}))

    def test_comma_and_whitespace_match_native_role_names(self):
        for value in ("front,db", "front, db", " front ,\tdb "):
            with self.subTest(value=value):
                parser = fixture([role("front", {1}), role("db", {2})], [("AFFINED", value)])
                self.assertEqual(relations(parser._parse_vm_groups()[0]),
                                 {(True, frozenset({1, 2}))})

    def test_transitive_affinity_merges_without_list_index_failures(self):
        parser = fixture([role(name, {i}) for i, name in enumerate("abcd", 1)],
                         [("AFFINED", "a,b"), ("AFFINED", "c,d"), ("AFFINED", "b,c")])
        self.assertEqual(relations(parser._parse_vm_groups()[0]),
                         {(True, frozenset({1, 2, 3, 4}))})

    def test_inter_role_anti_affinity_does_not_invent_intra_role_policy(self):
        parser = fixture([role("web", {1, 2}), role("db", {3, 4})],
                         [("ANTI_AFFINED", "web,db")])
        groups = parser._parse_vm_groups()[0]
        self.assertEqual(relations(groups),
            {(False, frozenset({a, b})) for a in (1, 2) for b in (3, 4)})
        self.assertTrue(accepts(groups, {1: 10, 2: 10, 3: 11, 4: 11}))
        self.assertFalse(accepts(groups, {1: 10, 2: 12, 3: 10, 4: 11}))

    def test_affined_role_and_anti_affined_role_keep_both_rules(self):
        parser = fixture([role("db", {1, 2}, "AFFINED"),
                          role("backup", {3, 4}, "ANTI_AFFINED")],
                         [("ANTI_AFFINED", "db,backup")])
        groups = parser._parse_vm_groups()[0]
        self.assertTrue(accepts(groups, {1: 10, 2: 10, 3: 11, 4: 12}))
        self.assertFalse(accepts(groups, {1: 10, 2: 11, 3: 12, 4: 13}))
        self.assertFalse(accepts(groups, {1: 10, 2: 10, 3: 11, 4: 11}))
        self.assertFalse(accepts(groups, {1: 10, 2: 10, 3: 10, 4: 12}))

    def test_empty_declared_role_is_not_an_unknown_role(self):
        parser = fixture([role("db", {1, 2}, "AFFINED"), role("spare", set())],
                         [("ANTI_AFFINED", "db,spare")])
        self.assertEqual(relations(parser._parse_vm_groups()[0]),
                         {(True, frozenset({1, 2}))})

    def test_missing_policy_and_native_none_do_not_become_anti_affinity(self):
        for policy in (None, "", "NONE"):
            with self.subTest(policy=policy):
                self.assertEqual(fixture([role("plain", {1, 2}, policy)])._parse_vm_groups()[0], [])

    def test_fixed_affined_peer_intersects_static_allowed_hosts(self):
        parser = fixture([role("db", {1, 2}, "AFFINED", "1,2")],
                         required={1}, placements={1: 1, 2: 3})
        self.assertEqual(self.project(parser, {1: {1, 2, 3}}),
                         ({1: set()}, {1: {1, 2}}))

    def test_incompatible_fixed_affined_peers_fail_closed(self):
        parser = fixture([role("db", {1, 2, 3}, "AFFINED")],
                         required={1}, placements={1: 1, 2: 2, 3: 3})
        self.assertEqual(parser._parse_vm_groups()[1][1], set())

    def test_requested_running_anti_affined_members_remain_dynamic(self):
        parser = fixture([role("replica", {1, 2, 3}, "ANTI_AFFINED")],
                         placements={1: 1, 2: 1, 3: 1})
        groups, allow, deny, _, _ = parser._parse_vm_groups()
        self.assertEqual(relations(groups), {(False, frozenset({1, 2, 3}))})
        self.assertEqual((allow, deny), ({}, {}))

    def test_unknown_rule_role_is_rejected(self):
        parser = fixture([role("db", {1})], [("ANTI_AFFINED", "db,missing")])
        with self.assertRaisesRegex(ValueError, "unknown role"):
            parser._parse_vm_groups()

    def test_missing_group_definition_is_rejected(self):
        parser = fixture([role("db", {1})])
        parser.scheduler_driver_action.vm_group_pool.vm_group = []
        with self.assertRaisesRegex(ValueError, "definition is missing"):
            parser._parse_vm_groups()

    def test_duplicate_rules_do_not_duplicate_constraints(self):
        parser = fixture([role("a", {1}), role("b", {2})],
                         [("ANTI_AFFINED", "a,b"), ("ANTI_AFFINED", "b,a")])
        groups = parser._parse_vm_groups()[0]
        self.assertEqual(len(groups), 1)
        self.assertEqual(relations(groups), {(False, frozenset({1, 2}))})

    def test_empty_host_attributes_keep_native_candidates(self):
        parser = fixture([role("plain", {1}, allow="", deny="")])
        self.assertEqual(self.project(parser, {1: {1, 2}}), ({1: {1, 2}}, {1: {1, 2}}))


if __name__ == "__main__":
    unittest.main()
