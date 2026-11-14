"""Native state rejection; never execute or alter a real VM in these tests."""
import pathlib
import sys
import unittest
from types import SimpleNamespace as N
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.optimizer_parser import OptimizerParser
from lib.mapper.model import VMState


class NativeStateAdmissionTests(unittest.TestCase):
    def test_exact_stable_states_preserved(self):
        for pair, expected in [((1, 0), VMState.PENDING), ((3, 3), VMState.RUNNING), ((8, 0), VMState.POWEROFF)]:
            with self.subTest(pair=pair):
                self.assertIs(OptimizerParser._map_vm_state(*pair), expected)

    def test_nonrunning_states_never_become_running(self):
        for state in [0, 2, 4, 5, 6, 7, 9, 10, 11, 12, -1, 999]:
            with self.subTest(state=state):
                with self.assertRaisesRegex(ValueError, 'unsupported or unstable native VM state'):
                    OptimizerParser._map_vm_state(state, 0)

    def test_lifecycle_transitions_rejected(self):
        for pair in [(3, 0), (3, 1), (3, 2), (3, 4), (3, 8), (3, 36), (3, 70), (1, 3), (1, -1), (8, 3), (8, 18)]:
            with self.subTest(pair=pair):
                with self.assertRaisesRegex(ValueError, 'unsupported or unstable native VM state'):
                    OptimizerParser._map_vm_state(*pair)

    def test_missing_and_noninteger_state_is_not_coerced(self):
        for pair in [(None, None), ('3', 3), (3, '3'), (3.0, 3), (3, 3.0), (True, 0), (1, False), (8, False)]:
            with self.subTest(pair=pair):
                with self.assertRaisesRegex(ValueError, 'unsupported or unstable native VM state'):
                    OptimizerParser._map_vm_state(*pair)

    @staticmethod
    def parser(vms, requirements):
        p = object.__new__(OptimizerParser)
        p.mode = 'OPTIMIZE'
        p._curr_alloc = {}
        p.config = {'DIFFERENT_VNETS': True, 'PREDICTIVE': 0}
        p.scheduler_driver_action = N(vm_pool=N(vm=vms), requirements=N(vm=requirements))
        return p

    def test_state_refusal_precedes_storage_interpretation(self):
        for pair in [(2, 0), (3, 36), (8, 18)]:
            with self.subTest(pair=pair):
                p = self.parser([N(id=11, state=pair[0], lcm_state=pair[1])], [N(id=11)])
                with patch.object(OptimizerParser, '_build_vm_storage', side_effect=AssertionError('storage touched')) as storage:
                    with self.assertRaisesRegex(ValueError, 'VM 11.*unsupported or unstable native VM state'):
                        p._parse_vm_requirements()
                    storage.assert_not_called()

    def test_missing_required_VM_refused(self):
        p = self.parser([], [N(id=11)])
        with self.assertRaisesRegex(ValueError, 'required VM 11 is absent'):
            p._parse_vm_requirements()

    def test_duplicate_native_identity_refused(self):
        running = self.native_vm(11, (3, 3))
        stopped = self.native_vm(11, (8, 0))
        p = self.parser([running, stopped], [N(id=11, hosts=N(id=[0, 1, 2]), nic=[])])
        with patch.object(OptimizerParser, '_build_vm_storage', return_value=({}, {})) as storage:
            with self.assertRaisesRegex(ValueError, 'duplicate native VM identity'):
                p._parse_vm_requirements()
            storage.assert_not_called()

    def test_duplicate_requirement_refused(self):
        p = self.parser([], [N(id=11), N(id=11)])
        with self.assertRaisesRegex(ValueError, 'duplicate native VM requirement'):
            p._parse_vm_requirements()

    def test_invalid_identifiers_refused(self):
        for invalid in [None, -1, True, 11.0, '11']:
            for pool in [True, False]:
                with self.subTest(invalid=invalid, pool=pool):
                    p = self.parser([N(id=invalid)] if pool else [], [] if pool else [N(id=invalid)])
                    with self.assertRaisesRegex(ValueError, 'invalid native VM (identity|requirement)'):
                        p._parse_vm_requirements()

    @staticmethod
    def native_vm(vmid, pair):
        return N(id=vmid, state=pair[0], lcm_state=pair[1], monitoring=N(cpu=0, cpu_forecast=0, nettx_bw=0, netrx_bw=0, nettx_bw_forecast=0, netrx_bw_forecast=0, diskrdbytes_bw=0, diskwrbytes_bw=0, diskrdbytes_bw_forecast=0, diskwrbytes_bw_forecast=0), template=N(memory=256, cpu=1, pci=[]), user_template=N(any_element=[]))

    def test_valid_selected_VM_keeps_original_power_state(self):
        for pair, mapped in [((1, 0), VMState.PENDING), ((3, 3), VMState.RUNNING), ((8, 0), VMState.POWEROFF)]:
            with self.subTest(pair=pair):
                vm = self.native_vm(0, pair)
                p = self.parser([vm, N(id=99, state=2, lcm_state=0)], [N(id=0, hosts=N(id=[0, 1, 2]), nic=[])])
                with patch.object(OptimizerParser, '_build_vm_storage', return_value=({}, {})):
                    parsed = p._parse_vm_requirements()
                self.assertEqual(set(parsed), {0})
                self.assertIs(parsed[0].state, mapped)
                self.assertEqual(parsed[0].host_ids, {0, 1, 2})
                self.assertEqual(parsed[0].memory, 256)
                self.assertEqual(parsed[0].cpu_ratio, 1)

    def test_exhaustive_state_pairs_only_exact_supported_tuples(self):
        allowed = {(1, 0): VMState.PENDING, (3, 3): VMState.RUNNING, (8, 0): VMState.POWEROFF}
        checked = 0
        for state in range(-2, 21):
            for lcm in range(-2, 121):
                pair = (state, lcm)
                if pair in allowed:
                    self.assertIs(OptimizerParser._map_vm_state(*pair), allowed[pair])
                else:
                    with self.assertRaises(ValueError):
                        OptimizerParser._map_vm_state(*pair)
                checked += 1
        self.assertEqual(checked, 2829)

    def test_actual_XML_decoder_missing_and_transient_fields_rejected(self):
        from xsdata.formats.dataclass.parsers import XmlParser
        from lib.models.vm import Vm
        for body in ['<ID>11</ID>', '<ID>11</ID><STATE>3</STATE>', '<ID>11</ID><LCM_STATE>3</LCM_STATE>', '<ID>11</ID><STATE>3</STATE><LCM_STATE>36</LCM_STATE>']:
            with self.subTest(body=body):
                vm = XmlParser().from_string('<VM>' + body + '</VM>', Vm)
                with self.assertRaises(ValueError):
                    OptimizerParser._map_vm_state(vm.state, vm.lcm_state)

    def test_actual_XML_decoder_valid_states_retain_native_semantics(self):
        from xsdata.formats.dataclass.parsers import XmlParser
        from lib.models.vm import Vm
        for pair, expected in [((1, 0), VMState.PENDING), ((3, 3), VMState.RUNNING), ((8, 0), VMState.POWEROFF)]:
            vm = XmlParser().from_string(f'<VM><ID>11</ID><STATE>{pair[0]}</STATE><LCM_STATE>{pair[1]}</LCM_STATE></VM>', Vm)
            self.assertIs(OptimizerParser._map_vm_state(vm.state, vm.lcm_state), expected)


if __name__ == '__main__':
    unittest.main()
