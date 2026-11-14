"""Native failed-host PLACE compatibility without reclassifying UNKNOWN as RUNNING.
Fencing remains the separately authorized native recovery owner's prerequisite.
"""
import pathlib
import sys
import unittest
from types import SimpleNamespace as N
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.optimizer_parser import OptimizerParser
from lib.mapper.model import VMState

class NativeUnknownReschedule(unittest.TestCase):
    def fixture(self):
        p=OptimizerParser.__new__(OptimizerParser)
        p.mode='PLACE';p.config={'DIFFERENT_VNETS':True,'PREDICTIVE':0}
        p._curr_alloc={4:2};p._used_shared_dstores={4:102};p._used_local_dstores={}
        p._system_shared_dstore_attrs={102:{'TYPE':'SYSTEM_DS','SHARED':'YES','TM_MAD':'SHARED'}}
        h=N(oid=4,seq=5,hid=2,ds_id=102,etime=0,tm_mad='shared')
        v=N(id=4,state=3,lcm_state=16,resched=1,history_records=N(history=[h]),
            monitoring=N(cpu=0,cpu_forecast=0,nettx_bw=0,netrx_bw=0,nettx_bw_forecast=0,netrx_bw_forecast=0,diskrdbytes_bw=0,diskwrbytes_bw=0,diskrdbytes_bw_forecast=0,diskwrbytes_bw_forecast=0),
            template=N(memory=1024,cpu=0.5,pci=[]),user_template=N(any_element=[]))
        r=N(id=4,hosts=N(id=[0,1,3]),datastores=N(id=[102]),nic=[])
        p.scheduler_driver_action=N(vm_pool=N(vm=[v]),requirements=N(vm=[r]))
        return p,v,r,h

    def parse(self,p):
        with patch.object(OptimizerParser,'_build_vm_storage',return_value=({},{})):
            return p._parse_vm_requirements()[4]

    def rejects(self,p):
        with self.assertRaises(ValueError):self.parse(p)

    def test_native_shared_unknown_resched_is_recovery_not_running(self):
        p,v,r,h=self.fixture();result=self.parse(p)
        self.assertIs(result.state,VMState.RESCHED)
        self.assertEqual(result.host_ids,{0,1,3})
        self.assertEqual(result.memory,1024)
        self.assertEqual((v.state,v.lcm_state,v.resched),(3,16,1))

    def test_direct_unknown_mapping_still_rejected(self):
        with self.assertRaises(ValueError):OptimizerParser._map_vm_state(3,16)

    def test_unknown_needs_explicit_native_resched_and_place(self):
        for resched in [None,0,2,True,'1',1.0]:
            with self.subTest(resched=resched):
                p,v,r,h=self.fixture();v.resched=resched;self.rejects(p)
        for mode in ['OPTIMIZE','',None]:
            with self.subTest(mode=mode):
                p,v,r,h=self.fixture();p.mode=mode;self.rejects(p)

    def test_unknown_requires_unique_current_history_and_identity(self):
        for field,value in [('oid',99),('seq',None),('seq',True),('hid',None),('ds_id',True),('etime',1),('tm_mad','ssh')]:
            with self.subTest(field=field,value=value):
                p,v,r,h=self.fixture();setattr(h,field,value);self.rejects(p)
        p,v,r,h=self.fixture();v.history_records.history=[];self.rejects(p)
        p,v,r,h=self.fixture();v.history_records.history=[h,h];self.rejects(p)
        p,v,r,h=self.fixture();p._curr_alloc[4]=1;self.rejects(p)
        p,v,r,h=self.fixture();p._used_shared_dstores[4]=103;self.rejects(p)

    def test_unknown_local_or_missing_shared_storage_is_refused(self):
        p,v,r,h=self.fixture();p._used_shared_dstores={};p._used_local_dstores={4:102};self.rejects(p)
        p,v,r,h=self.fixture();p._system_shared_dstore_attrs={};self.rejects(p)
        p,v,r,h=self.fixture();p._system_shared_dstore_attrs[102]['SHARED']='NO';self.rejects(p)
        p,v,r,h=self.fixture();p._system_shared_dstore_attrs[102]['TYPE']='IMAGE_DS';self.rejects(p)

    def test_unknown_cannot_switch_or_omit_original_system_datastore(self):
        for values in [[],[103],[102,103],[102,102],['102'],[True]]:
            with self.subTest(values=values):
                p,v,r,h=self.fixture();r.datastores.id=values;self.rejects(p)

    def test_unknown_cannot_return_to_source_or_unknown_destination(self):
        for values in [[],[2],[0,2],[0,0],[True],['0'],[-1]]:
            with self.subTest(values=values):
                p,v,r,h=self.fixture();r.hosts.id=values;self.rejects(p)

    def test_no_other_state_or_transient_is_admitted_by_resched(self):
        for pair in [(3,4),(3,36),(3,70),(8,16),(2,0),(3,'16'),('3',16),(True,16)]:
            with self.subTest(pair=pair):
                p,v,r,h=self.fixture();v.state,v.lcm_state=pair;self.rejects(p)

    def test_normal_native_states_keep_existing_semantics(self):
        for pair,expected in [((1,0),VMState.PENDING),((3,3),VMState.RUNNING),((8,0),VMState.POWEROFF)]:
            with self.subTest(pair=pair):
                p,v,r,h=self.fixture();v.state,v.lcm_state=pair
                self.assertIs(self.parse(p).state,expected)

if __name__=='__main__':unittest.main()
