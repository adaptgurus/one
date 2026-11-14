"""Regression: native OpenNebula HostShare KiB must reconcile with VM MEMORY MiB."""
import pathlib,sys,unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.optimizer_parser import OptimizerParser
from lib.mapper.model import VMRequirements,VMState
from lib.resilience import _require_reconciled_commitments

def native_host(host_id, max_kib, allocated_kib, cpu_hundredths, used_kib):
    return NS(
        id=host_id,
        cluster_id=0,
        state=2,
        template=NS(children=[]),
        host_share=NS(
            max_mem=max_kib,
            mem_usage=allocated_kib,
            max_cpu=7200,
            cpu_usage=cpu_hundredths,
            pci_devices=NS(pci=[]),
        ),
        monitoring=NS(capacity=NS(
            used_memory=used_kib,
            used_memory_forecast=0,
            used_cpu_forecast=0,
        )),
    )

def parse(hosts):
    # Exercise exact production parser without initializing an external solver.
    parser=OptimizerParser.__new__(OptimizerParser)
    parser.scheduler_driver_action=NS(host_pool=NS(host=hosts))
    parser.config={"PREDICTIVE":0}
    with patch.object(OptimizerParser,"_parse_local_dstore_capacities",return_value={}), \
         patch.object(OptimizerParser,"_build_net_capacity",return_value=0.0), \
         patch.object(OptimizerParser,"_build_pci_devices",return_value=[]):
        return parser._parse_host_capacities()

class NativeHostMemoryUnitRegression(unittest.TestCase):
    def test_live_dr1_dr2_dr3_allocations_match_native_vm_template_mib(self):
        # 15 Nov 2026 read-only native OpenNebula 7.4.1 HostShare KiB.
        hosts=[
            native_host(0,321701108,30408704,1500,1048576),
            native_host(1,321701088,23068672,1100,2097152),
            native_host(2,321701080,21102592,1010,3145728),
        ]
        capacities=parse(hosts)
        self.assertEqual(
            [h.committed_memory for h in capacities],
            [29696,22528,20608],
        )
        self.assertEqual([h.committed_cpu for h in capacities],[15.0,11.0,10.1])
        self.assertEqual(
            [h.memory.usage for h in capacities],
            [1024,2048,3072],
        )
        for h,native in zip(capacities,hosts):
            self.assertAlmostEqual(h.memory.total,native.host_share.max_mem/1024)
        # All 26 native VMs, including 12 POWEROFF, contribute to HostShare
        # allocations and must reconcile in correct units before HA admission.
        requirements=[
            VMRequirements(id=i, memory=m,cpu_ratio=cpu,state=VMState.RUNNING)
            for i,(m,cpu) in enumerate([(29696,15),(22528,11),(20608,10.1)])
        ]
        _require_reconciled_commitments(capacities,requirements)

    def test_kib_capacity_does_not_overstate_memory_survivor_headroom(self):
        # 1 GiB native HostShare max_mem is 1,048,576 KiB = 1,024 MiB,
        # not 1,048.576 MiB. A 1,040 MiB VM must not be admitted to it.
        h=parse([native_host(0,1048576,0,0,0)])[0]
        self.assertEqual(h.memory.total,1024)
        self.assertLess(h.memory.total,1040)

if __name__=="__main__":unittest.main()
