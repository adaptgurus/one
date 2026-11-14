"""Execute the generated runner's ACTUAL finally block with effect spies only."""
import ast, contextlib, datetime, io, json, tempfile, unittest
from pathlib import Path
from rollback_guard import complete_restoration, SyncTimeout, UnsafeSnapshot
from test_rollback_guard import receipt

FILE=Path(__file__).with_name('cohort_candidate.py')

class CoordinatorIntegrationTests(unittest.TestCase):
    def simulate(self,mode='normal',current='base',stopped=False,drift=False):
        calls=[];count=[0];hosts={i:{'core':current,'running_core':current,'active':True,
            'original_driver':True,'guards_ok':True,'original_domains_equal':True,
            'key_added':True,'services_restored':False} for i in range(3)}
        def actor(i,action):
            calls.append((i,action));r=hosts[i]
            if action=='stop':r.update(active=False,running_core=None)
            if action=='rollback':r['core']='base'
            if action=='start-core':r.update(active=True,running_core=r['core'])
            if action=='restore-services':
                if mode=='service-failure' and i==1:raise RuntimeError('unit failure')
                r['services_restored']=True
            if action=='finish':
                if not r['services_restored']:raise RuntimeError('services missing')
                r['key_added']=False
            return dict(r)
        def probe(*args):
            count[0]+=1
            if mode=='unsafe':raise UnsafeSnapshot('term changed')
            if mode=='late' and count[0]==1 or mode=='never':raise SyncTimeout({'lag':1},(0,5),{})
            return receipt()
        tree=ast.parse(FILE.read_text());run=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='run')
        main=next(x for x in run.body if isinstance(x,ast.Try) and x.finalbody)
        with tempfile.TemporaryDirectory(prefix='onedrs-coordinator-fixture-') as td:
            env={'prepared':[0,1,2],'HOSTS':{0:None,1:None,2:None},'stopped':stopped,'disabled':[0,1,2],
                 'BASE':'base','NEW':'new','result':{'zone_disabled':True},'success':True,'leader':0,
                 'actor':actor,'complete_restoration':complete_restoration,'probe_sync':probe,
                 'freeze':lambda:calls.append('freeze'),'unfreeze':lambda:calls.append('enable'),
                 'sync_audit':lambda e:None,'before':{'1':{'state':3}},
                 'inventory':lambda:({'1':{'state':8}} if drift else {'1':{'state':3}}),
                 'save':lambda:None,'D':Path(td),'json':json,'datetime':datetime}
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(ast.Module(body=main.finalbody,type_ignores=[]),str(FILE),'exec'),env)
            result=json.loads((Path(td)/'cohort-result.json').read_text())
        return result,calls,count[0]
    def test_original_running_late_catchup_does_not_reinstall_or_restart(self):
        r,c,n=self.simulate(mode='late',stopped=True)
        self.assertEqual(r['result'],'FAIL_ACCEPTANCE_ORIGINAL_RESTORED');self.assertTrue(r['restoration']['restoration_complete'])
        self.assertFalse(any(isinstance(x,tuple) and x[1] in ['stop','rollback','start-core'] for x in c))
        self.assertIn('enable',c);self.assertTrue(r['temporary_lab_keys_removed']);self.assertEqual(n,2)
    def test_candidate_is_rolled_back_before_enable(self):
        r,c,n=self.simulate(current='new')
        self.assertEqual(r['result'],'PASS_NATIVE_R10_COHORT_RESCHEDULE_AND_ROLLBACK')
        self.assertLess(c.index((2,'start-core')),c.index('enable'));self.assertIn('freeze',c)
    def test_original_normal_path(self):
        r,c,n=self.simulate();self.assertEqual(r['result'],'PASS_NATIVE_R10_COHORT_RESCHEDULE_AND_ROLLBACK');self.assertEqual(n,1)
    def test_never_catches_up_stays_frozen(self):
        r,c,n=self.simulate(mode='never');self.assertEqual(r['result'],'FAIL_REQUIRES_RECONCILIATION');self.assertNotIn('enable',c)
        self.assertFalse(any(isinstance(x,tuple) and x[1]=='finish' for x in c))
    def test_identity_or_term_error_stays_frozen(self):
        r,c,n=self.simulate(mode='unsafe');self.assertNotIn('enable',c);self.assertEqual(n,1);self.assertFalse(r['restoration']['restoration_complete'])
    def test_VM_drift_prevents_enable(self):
        r,c,n=self.simulate(drift=True);self.assertNotIn('enable',c);self.assertEqual(n,0)
    def test_service_failure_preserves_failure_and_keys(self):
        r,c,n=self.simulate(mode='service-failure');self.assertEqual(r['result'],'FAIL_REQUIRES_RECONCILIATION');self.assertIn((2,'restore-services'),c)
        self.assertFalse(any(isinstance(x,tuple) and x[1]=='finish' for x in c))
    def test_unknown_core_never_replaced(self):
        r,c,n=self.simulate(current='foreign');self.assertNotIn('enable',c);self.assertEqual(n,0)
        self.assertFalse(any(isinstance(x,tuple) and x[1] in ['stop','rollback'] for x in c))
    def test_import_has_no_native_operations(self):
        tree=ast.parse(FILE.read_text())
        self.assertTrue(all(isinstance(x,(ast.Expr,ast.Import,ast.ImportFrom,ast.FunctionDef,ast.If)) for x in tree.body))
        import cohort_candidate
        self.assertTrue(callable(cohort_candidate.run))

if __name__=='__main__':unittest.main(verbosity=2)
