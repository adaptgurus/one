"""Actual ILP checks: recovery retains shared disks, never donates space to new VMs."""
import pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.mapper.model import Allocation,Capacity,DStoreCapacity,DStoreRequirement,HostCapacity,VMRequirements,VMState
from lib.mapper.ilp_optimizer import ILPOptimizer
from pulp import PULP_CBC_CMD

class RetainedRecoveryStorage(unittest.TestCase):
    @staticmethod
    def vm(i,size=20000,state=VMState.RESCHED,ds=42):
        return VMRequirements(id=i,state=state,memory=1024,cpu_ratio=0.5,host_ids={1,2},storage={0:DStoreRequirement(id=0,vm_id=i,size=size,local_dstore_ids={},shared_dstore_ids=[ds])})

    def optimizer(self,workloads,current,total=50000,used=40000,host_used=1024,criteria="pack",balance_constraints=None):
        hosts=[HostCapacity(id=i,cluster_id=0,cpu=Capacity(total=4,usage=1),memory=Capacity(total=8192,usage=host_used)) for i in (1,2)]
        opt=ILPOptimizer(current_placement=current,vm_requirements=workloads,vm_groups=[],host_capacities=hosts,dstore_capacities=[DStoreCapacity(id=42,size=Capacity(total=total,usage=used),cluster_ids=[0])],image_dstore_capacities=[],vnet_capacities=[],criteria=criteria,balance_constraints=balance_constraints,allowed_storage_migrations=0,solver=PULP_CBC_CMD(msg=False))
        self.assertTrue(opt._narrow)
        opt.map()
        return opt

    def test_large_existing_shared_disk_recovers_without_second_copy(self):
        opt=self.optimizer([self.vm(10)],[Allocation(10,0,42,'shared')])
        self.assertIsNotNone(opt._opt_placement[10])
        self.assertEqual(opt._opt_placement[10].dstore_id,42)
        self.assertIn(opt._opt_placement[10].host_id,{1,2})

    def test_two_recoveries_share_existing_allocation_without_new_demand(self):
        opt=self.optimizer([self.vm(10),self.vm(11)],[Allocation(10,0,42,'shared'),Allocation(11,0,42,'shared')])
        self.assertIsNotNone(opt._opt_placement[10]);self.assertIsNotNone(opt._opt_placement[11])

    def test_recovery_credit_cannot_fund_oversized_pending_guest(self):
        opt=self.optimizer([self.vm(10),self.vm(20,size=15000,state=VMState.PENDING)],[Allocation(10,0,42,'shared')])
        self.assertIsNotNone(opt._opt_placement[10])
        self.assertIsNone(opt._opt_placement[20])

    def test_small_pending_guest_still_consumes_actual_free_space(self):
        opt=self.optimizer([self.vm(10),self.vm(20,size=6000,state=VMState.PENDING)],[Allocation(10,0,42,'shared')])
        self.assertIsNotNone(opt._opt_placement[10]);self.assertIsNotNone(opt._opt_placement[20])

    def test_retention_does_not_bypass_destination_compute_capacity(self):
        opt=self.optimizer([self.vm(10)],[Allocation(10,0,42,'shared')],host_used=8000)
        self.assertIsNone(opt._opt_placement[10])

    def test_missing_existing_allocation_does_not_receive_storage_credit(self):
        opt=self.optimizer([self.vm(10)],[])
        self.assertIsNone(opt._opt_placement[10])

    def test_space_balance_bound_uses_existing_load_only_once(self):
        opt=self.optimizer([self.vm(10)],[Allocation(10,0,42,'shared')],criteria='space_balance',balance_constraints={'space':1.0})
        self.assertIsNotNone(opt._opt_placement.get(10))
        self.assertAlmostEqual(opt._balance['space'].value(),0.8,places=6)

    def test_space_balance_charges_pending_guest_above_existing_usage(self):
        opt=self.optimizer([self.vm(10),self.vm(20,size=6000,state=VMState.PENDING)],[Allocation(10,0,42,'shared')],criteria='space_balance',balance_constraints={'space':1.0})
        self.assertIsNotNone(opt._opt_placement.get(10));self.assertIsNotNone(opt._opt_placement.get(20))
        self.assertAlmostEqual(opt._balance['space'].value(),0.92,places=6)

    def test_space_balance_cannot_hide_real_capacity_violation(self):
        opt=self.optimizer([self.vm(10),self.vm(20,size=15000,state=VMState.PENDING)],[Allocation(10,0,42,'shared')],criteria='space_balance',balance_constraints={'space':1.0})
        self.assertIsNotNone(opt._opt_placement.get(10));self.assertIsNone(opt._opt_placement.get(20))
        self.assertAlmostEqual(opt._balance['space'].value(),0.8,places=6)

if __name__=='__main__':unittest.main()
