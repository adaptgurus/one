import pathlib,sys,unittest
from dataclasses import replace
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from lib.resilience import ResiliencePolicy,validate_resilience
from lib.mapper.model import HostCapacity,Capacity,VMRequirements,VMState,DStoreRequirement
from lib.mapper.ilp_optimizer import ILPOptimizer
from pulp import COIN_CMD

def host(i,healthy=True):
    return HostCapacity(id=i,cluster_id=0,cpu=Capacity(total=16,usage=0),memory=Capacity(total=64000,usage=0),failure_domain=f'rack-{i}',failure_domain_labeled=True,healthy=healthy)
def workload(ids):
    return VMRequirements(id=40,state=VMState.RUNNING,cpu_ratio=1,memory=256,host_ids=set(ids))
def policy():
    return ResiliencePolicy(enabled=True,min_healthy_hosts=3,host_failure_tolerance=1,failure_domain_tolerance=1,require_failure_domain_labels=True,cpu_reserve_percent=10,memory_reserve_percent=10)
class HostContextTests(unittest.TestCase):
    def test_original_filtered_pool_reproduces_live_error(self):
        with self.assertRaisesRegex(ValueError,'only 2 healthy hosts, minimum is 3'):
            validate_resilience([host(0),host(2)],[workload({0,2})],policy())
    def test_full_context_preserves_three_host_policy_and_two_candidates(self):
        w=workload({0,2});r=validate_resilience([host(i) for i in range(3)],[w],policy())
        self.assertEqual(r.healthy_hosts,3);self.assertEqual(w.host_ids,{0,2})
    def test_actual_unhealthy_source_still_fails_minimum(self):
        with self.assertRaisesRegex(ValueError,'only 2 healthy hosts'):
            validate_resilience([host(0),host(1,False),host(2)],[workload({0,2})],policy())
    def test_hard_pin_still_fails_survivor_eligibility(self):
        with self.assertRaisesRegex(ValueError,'no eligible surviving host'):
            validate_resilience([host(i) for i in range(3)],[workload({0})],policy())
    def test_local_storage_remains_unrecoverable(self):
        w=replace(workload({0,2}),storage={0:DStoreRequirement(id=0,vm_id=40,size=64,local_dstore_ids={0:[100]},shared_dstore_ids=[])})
        with self.assertRaisesRegex(ValueError,'no eligible surviving host'):
            validate_resilience([host(i) for i in range(3)],[w],policy())
    def test_solver_never_uses_context_only_source(self):
        hosts=[host(i) for i in range(3)]
        opt=ILPOptimizer(current_placement=[],vm_requirements=[workload({0,2})],vm_groups=[],host_capacities=hosts,dstore_capacities=[],image_dstore_capacities=[],vnet_capacities=[],criteria='pack',solver=COIN_CMD(path='/usr/lib/one/python/pulp/solverdir/cbc/linux/i64/cbc',msg=False))
        opt.map();alloc=opt._opt_placement[40]
        self.assertIsNotNone(alloc);self.assertIn(alloc.host_id,{0,2})
    def test_native_serializer_keeps_match_requirements(self):
        repo=ROOT.parents[3]
        text=(repo/'src/schedm/SchedulerManagerDriver.cc').read_text()
        self.assertIn('sr.hpool.to_xml(oss, context_host_ids)',text)
        self.assertIn('scheduler_host_context(sr.hpool.ids, sr.match.match_host',text)
        self.assertIn('sr.match.to_xml(oss)',text)
        self.assertNotIn('sr.match.match_host.insert',text)
if __name__=='__main__':unittest.main()
