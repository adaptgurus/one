from types import SimpleNamespace
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.optimizer_parser import OptimizerParser


def child(name, value):
    return SimpleNamespace(qname=name, text=value)


def vm(vm_id, gid, role):
    return SimpleNamespace(
        id=vm_id,
        template=SimpleNamespace(
            vmgroup=SimpleNamespace(
                children=[
                    child("VMGROUP_ID", str(gid)),
                    child("ROLE", role),
                ]
            )
        ),
    )


def raw_vm(vm_id, state=3, markers=None):
    return SimpleNamespace(
        id=vm_id,
        state=state,
        lcm_state=3,
        user_template=SimpleNamespace(
            any_element=[
                child(name, value)
                for name, value in (markers or [])
            ]
        ),
    )


def role(name, policy=None, host_affined=None, host_anti_affined=None):
    return SimpleNamespace(
        name=name,
        policy=policy,
        host_affined=host_affined,
        host_anti_affined=host_anti_affined,
    )


def group(gid, roles, template_children=None):
    return SimpleNamespace(
        id=gid,
        roles=SimpleNamespace(role=roles),
        template=(
            SimpleNamespace(children=template_children or [])
            if template_children is not None
            else None
        ),
    )


def parser(mode, vms, groups, allowed_ids, current=None):
    value = OptimizerParser.__new__(OptimizerParser)
    value.mode = mode
    value._curr_alloc = current or {}
    value.scheduler_driver_action = SimpleNamespace(
        vm_pool=SimpleNamespace(vm=vms),
        vm_group_pool=SimpleNamespace(vm_group=groups),
        requirements=SimpleNamespace(
            vm=[SimpleNamespace(id=vm_id) for vm_id in allowed_ids]
        ),
    )
    return value


class ResilienceInventoryTests(unittest.TestCase):
    def test_active_unmatched_vm_blocks_partial_ha_proof(self):
        p = OptimizerParser.__new__(OptimizerParser)
        p.scheduler_driver_action = SimpleNamespace(
            vm_pool=SimpleNamespace(vm=[raw_vm(41)])
        )
        with self.assertRaisesRegex(ValueError, "inventory incomplete"):
            p._validate_resilience_inventory({})

    def test_explicitly_excluded_unmatched_vm_is_allowed(self):
        p = OptimizerParser.__new__(OptimizerParser)
        p.scheduler_driver_action = SimpleNamespace(
            vm_pool=SimpleNamespace(
                vm=[
                    raw_vm(
                        41,
                        markers=[("LAYERSENTRY_RESILIENCE", "EXCLUDED")],
                    )
                ]
            )
        )
        p._validate_resilience_inventory({})

    def test_powered_off_unmatched_vm_does_not_consume_ha_reserve(self):
        p = OptimizerParser.__new__(OptimizerParser)
        p.scheduler_driver_action = SimpleNamespace(
            vm_pool=SimpleNamespace(vm=[raw_vm(41, state=8)])
        )
        p._validate_resilience_inventory({})

    def test_resilience_markers_are_independent(self):
        item = raw_vm(
            41,
            markers=[
                ("LAYERSENTRY_HA_PROTECTED", "NO"),
                ("LAYERSENTRY_DEVICE_HA_QUALIFIED", "YES"),
                ("LAYERSENTRY_STORAGE_HA_QUALIFIED", "YES"),
            ],
        )
        self.assertEqual(
            OptimizerParser._resilience_vm_markers(item),
            (True, True, True),
        )


class VMGroupTranslationTests(unittest.TestCase):
    def test_role_without_policy_does_not_become_anti_affinity(self):
        p = parser(
            "OPTIMIZE",
            [vm(1, 10, "web"), vm(2, 10, "web")],
            [group(10, [role("web")])],
            [1, 2],
            {1: 101, 2: 102},
        )
        relations, affined_hosts, anti_hosts = p._parse_vm_groups()
        self.assertEqual(relations, [])
        self.assertEqual(affined_hosts, {})
        self.assertEqual(anti_hosts, {})

    def test_optimize_preserves_native_anti_affinity_as_joint_relation(self):
        p = parser(
            "OPTIMIZE",
            [vm(1, 10, "web"), vm(2, 10, "web")],
            [group(10, [role("web", policy="ANTI_AFFINED")])],
            [1, 2],
            {1: 101, 2: 102},
        )
        relations, _, anti_hosts = p._parse_vm_groups()
        self.assertEqual(len(relations), 1)
        self.assertFalse(relations[0].affined)
        self.assertEqual(relations[0].vm_ids, {1, 2})
        # Old behavior incorrectly anchored both movable VMs to their previous
        # group hosts and could force needless movement.
        self.assertEqual(anti_hosts, {})

    def test_fixed_anti_affined_member_remains_external_anchor(self):
        p = parser(
            "OPTIMIZE",
            [vm(1, 10, "web"), vm(2, 10, "web")],
            [group(10, [role("web", policy="ANTI_AFFINED")])],
            [1],
            {1: 101, 2: 102},
        )
        relations, _, anti_hosts = p._parse_vm_groups()
        self.assertEqual(relations, [])
        self.assertEqual(anti_hosts[1], {102})

    def test_fixed_affined_members_on_different_hosts_fail_closed(self):
        p = parser(
            "OPTIMIZE",
            [vm(1, 10, "db"), vm(2, 10, "db"), vm(3, 10, "db")],
            [group(10, [role("db", policy="AFFINED")])],
            [1],
            {1: 101, 2: 102, 3: 103},
        )
        with self.assertRaisesRegex(ValueError, "affinity drift"):
            p._parse_vm_groups()

    def test_cross_role_anti_affinity_does_not_break_affined_role(self):
        p = parser(
            "OPTIMIZE",
            [
                vm(1, 10, "db"),
                vm(2, 10, "db"),
                vm(3, 10, "app"),
            ],
            [
                group(
                    10,
                    [
                        role("db", policy="AFFINED"),
                        role("app"),
                    ],
                    [child("ANTI_AFFINED", "db,app")],
                )
            ],
            [1, 2, 3],
            {1: 101, 2: 101, 3: 102},
        )
        relations, _, _ = p._parse_vm_groups()
        affined = [r.vm_ids for r in relations if r.affined]
        anti = [r.vm_ids for r in relations if not r.affined]
        self.assertIn({1, 2}, affined)
        self.assertIn({1, 3}, anti)
        self.assertIn({2, 3}, anti)
        self.assertNotIn({1, 2}, anti)

    def test_place_anchors_pending_anti_affined_member_to_running_hosts(self):
        p = parser(
            "PLACE",
            [vm(1, 10, "web"), vm(2, 10, "web")],
            [group(10, [role("web", policy="ANTI_AFFINED")])],
            [2],
            {1: 101},
        )
        relations, _, anti_hosts = p._parse_vm_groups()
        self.assertEqual(relations, [])
        self.assertEqual(anti_hosts[2], {101})

    def test_overlapping_affinity_relations_merge_transitively(self):
        p = parser(
            "OPTIMIZE",
            [
                vm(1, 10, "a"),
                vm(2, 10, "b"),
                vm(3, 10, "c"),
            ],
            [
                group(
                    10,
                    [role("a"), role("b"), role("c")],
                    [
                        child("AFFINED", "a,b"),
                        child("AFFINED", "b,c"),
                    ],
                )
            ],
            [1, 2, 3],
            {1: 101, 2: 101, 3: 101},
        )
        relations, _, _ = p._parse_vm_groups()
        affined = [r for r in relations if r.affined]
        self.assertEqual(len(affined), 1)
        self.assertEqual(affined[0].vm_ids, {1, 2, 3})


if __name__ == "__main__":
    unittest.main()
