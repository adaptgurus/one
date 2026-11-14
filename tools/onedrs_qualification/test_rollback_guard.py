import ast
from dataclasses import replace
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET
from rollback_guard import (EvidenceError, Status, SyncReceipt, SyncTimeout,
                            UnsafeSnapshot, complete_restoration, parse_status,
                            wait_strict_sync)

ROOT = Path(__file__).resolve().parents[2]
OLD = ROOT / 'evidence/onedrs-r10-live-reschedule-20261114/cohort-attempt3/cohort_test.py'


class Clock:
    def __init__(self): self.t = 0.0
    def now(self): return self.t
    def sleep(self, value): self.t += value


def xml(i, commit=10, log_index=None, term=5, state=None, server_id=None):
    fields = {'SERVER_ID': i if server_id is None else server_id,
              'STATE': (3 if i == 0 else 2) if state is None else state,
              'TERM': term, 'COMMIT': commit,
              'LOG_INDEX': commit if log_index is None else log_index}
    return '<RAFT>' + ''.join('<%s>%s</%s>' % (k, v, k) for k, v in fields.items()) + '</RAFT>'


def receipt():
    return SyncReceipt(0, 5, 10, 2, 1.0, {i: parse_status(xml(i), i) for i in range(3)})


class ParserTests(unittest.TestCase):
    def test_valid(self): self.assertEqual(parse_status(xml(0), 0), Status(0, 3, 5, 10, 10))
    def test_missing_or_duplicate(self):
        for key in ['SERVER_ID', 'STATE', 'TERM', 'COMMIT', 'LOG_INDEX']:
            r = ET.fromstring(xml(0)); node = r.find(key)
            for payload in (xml(0).replace(ET.tostring(node, encoding='unicode'), ''),
                            xml(0).replace('</RAFT>', ET.tostring(node, encoding='unicode') + '</RAFT>')):
                with self.subTest(key=key, payload=payload), self.assertRaises(UnsafeSnapshot): parse_status(payload, 0)
    def test_noncanonical_numbers(self):
        for value in ['-1', '+1', '1.0', 'True', '', '1e2', '0x10', 'NaN', str(2**64), '1'*21]:
            with self.subTest(value=value), self.assertRaises(UnsafeSnapshot): parse_status(xml(0, commit=value), 0)
    def test_nested_or_namespaced(self):
        for payload in [xml(0).replace('<COMMIT>10</COMMIT>', '<COMMIT><v>10</v></COMMIT>'),
                        xml(0).replace('<RAFT>', '<RAFT xmlns="foreign">'),
                        xml(0).replace('<COMMIT>', '<COMMIT bad="1">')]:
            with self.subTest(payload=payload), self.assertRaises(UnsafeSnapshot): parse_status(payload, 0)
    def test_input_bound_and_xml_declarations(self):
        for payload in [None, b'<RAFT/>', '<RAFT>', 'x'*65537,
                        '<!DOCTYPE RAFT [<!ENTITY x "10">]>' + xml(0)]:
            with self.subTest(payload=str(payload)[:50]), self.assertRaises(UnsafeSnapshot): parse_status(payload, 0)
    def test_wrong_identity_and_geometry(self):
        for payload in [xml(0, server_id=1), xml(0, commit=11, log_index=10)]:
            with self.assertRaises(UnsafeSnapshot): parse_status(payload, 0)


class BarrierTests(unittest.TestCase):
    def setUp(self): self.clock = Clock(); self.audit = []
    def run_gate(self, reader=None, timeout=10, **kw):
        return wait_strict_sync(reader or (lambda i, budget: xml(i)), timeout=timeout,
                                clock=self.clock.now, sleep=self.clock.sleep, audit=self.audit.append, **kw)
    def test_two_complete_samples(self):
        r = self.run_gate(); self.assertEqual(r.samples, 2); self.assertEqual(r.elapsed_seconds, 1)
    def test_single_sample_never_passes(self):
        with self.assertRaises(SyncTimeout): self.run_gate(timeout=0.5)
    def test_actual_lag_waits(self):
        r = self.run_gate(lambda i,b: xml(i, commit=9 if i==1 and self.clock.t<2 else 10))
        self.assertEqual(r.elapsed_seconds, 3); self.assertEqual(len(self.audit), 4)
    def test_permanent_lag_reports_member(self):
        with self.assertRaises(SyncTimeout) as c: self.run_gate(lambda i,b: xml(i, commit=9 if i==1 else 10), timeout=3)
        self.assertEqual(c.exception.diagnostic['per_host_commit_delta'][1], 1)
        self.assertEqual(c.exception.authority, (0,5))
    def test_uncommitted_tail_not_accepted(self):
        with self.assertRaises(SyncTimeout): self.run_gate(lambda i,b: xml(i, log_index=11), timeout=3)
    def test_closing_leader_advances(self):
        calls = [0]
        def read(i,b):
            calls[0] += 1
            n = int(self.clock.t)
            return xml(i, commit=10+n+(1 if calls[0]%4==0 else 0))
        with self.assertRaises(SyncTimeout): self.run_gate(read, timeout=3)
    def test_identity_mismatch_refused(self):
        with self.assertRaises(UnsafeSnapshot): self.run_gate(lambda i,b: xml(i, server_id=9 if i==1 else i))
    def test_multiple_leaders_refused(self):
        with self.assertRaises(UnsafeSnapshot): self.run_gate(lambda i,b: xml(i, state=3 if i in [0,1] else 2))
    def test_initial_election_bounded(self):
        with self.assertRaises(SyncTimeout): self.run_gate(lambda i,b: xml(i, state=1), timeout=2)
    def test_authority_change_refused(self):
        with self.assertRaises(UnsafeSnapshot): self.run_gate(lambda i,b: xml(i,term=5+int(self.clock.t)))
    def test_pinned_election_instability_refused(self):
        with self.assertRaises(UnsafeSnapshot): self.run_gate(lambda i,b: xml(i, state=1 if self.clock.t else None))
    def test_closing_leader_demotion(self):
        calls=[0]
        def read(i,b):
            calls[0]+=1;return xml(i,state=2 if calls[0]==4 else None)
        with self.assertRaises(UnsafeSnapshot): self.run_gate(read)
    def test_commit_regression(self):
        with self.assertRaises(UnsafeSnapshot): self.run_gate(lambda i,b: xml(i, commit=10-int(self.clock.t)))
    def test_transient_transport_then_recovery(self):
        def read(i,b):
            if self.clock.t<1: raise ConnectionRefusedError('not included in evidence')
            return xml(i)
        r=self.run_gate(read);self.assertEqual(r.samples,3);self.assertEqual(self.audit[0]['error_type'],'ConnectionRefusedError')
    def test_programming_error_not_retried(self):
        def read(i,b): raise ValueError('bad config')
        with self.assertRaises(ValueError): self.run_gate(read)
        self.assertEqual(self.clock.t,0)
    def test_read_budget_and_overrun(self):
        budgets=[]
        def read(i,b): budgets.append(b);self.clock.t+=4;return xml(i)
        with self.assertRaises(SyncTimeout) as c: self.run_gate(read,timeout=3)
        self.assertEqual(len(budgets),1);self.assertIn('exceeded',str(c.exception))
    def test_audit_failure_is_not_transport_retry(self):
        def fail(e): raise OSError('disk full')
        with self.assertRaises(EvidenceError):
            wait_strict_sync(lambda i,b:xml(i),clock=self.clock.now,sleep=self.clock.sleep,audit=fail)
        self.assertEqual(self.clock.t,0)
    def test_bad_ids_and_budgets(self):
        for ids in [(0,0,1),(0,1),(0,1,-1),(0,1,True)]:
            with self.subTest(ids=ids),self.assertRaises(ValueError):self.run_gate(expected_ids=ids)
        for value in [-1,0,float('nan'),float('inf'),True]:
            with self.subTest(timeout=value),self.assertRaises(ValueError):self.run_gate(timeout=value)
    def test_continuation_floors_preserved(self):
        floors={i:parse_status(xml(i,commit=20),i) for i in range(3)}
        with self.assertRaises(UnsafeSnapshot):self.run_gate(authority=(0,5),floors=floors)


class RestorationTests(unittest.TestCase):
    def setUp(self): self.calls=[];self.audits=[]
    def execute(self,probe=None,guard=None,unfreeze=None,restore=None,finish=None,audit=None):
        return complete_restoration(guard or (lambda:True),probe or (lambda *args:receipt()),
            unfreeze or (lambda:self.calls.append('enable')),
            restore or (lambda i:self.calls.append(('services',i))),
            finish or (lambda i:self.calls.append(('finish',i))),audit=audit or self.audits.append)
    def test_normal_completion(self):
        r=self.execute();self.assertTrue(r['qualification_passed']);self.assertTrue(r['restoration_complete']);self.assertEqual(len(self.calls),7)
    def test_late_catchup_restores_but_deadline_stays_failed(self):
        seen=[]
        def probe(seconds,authority,floors):
            seen.append((seconds,authority))
            if len(seen)==1:raise SyncTimeout({'lagging_host':1},(0,5),{})
            return receipt()
        r=self.execute(probe=probe);self.assertTrue(r['restoration_complete']);self.assertFalse(r['qualification_passed']);self.assertTrue(r['acceptance_deadline_missed']);self.assertEqual(seen,[(90,None),(150,(0,5))])
    def test_both_deadlines_fail_no_effects(self):
        def probe(*args):raise SyncTimeout({'lagging_host':1},(0,5),{})
        r=self.execute(probe=probe);self.assertFalse(r['restoration_complete']);self.assertEqual(self.calls,[]);self.assertTrue(r['acceptance_deadline_missed'])
    def test_unsafe_topology_has_no_grace(self):
        seen=[]
        def probe(*args):seen.append(1);raise UnsafeSnapshot('multiple leaders')
        r=self.execute(probe=probe);self.assertEqual(len(seen),1);self.assertEqual(self.calls,[]);self.assertFalse(r['acceptance_deadline_missed'])
    def test_original_binary_guard_failure(self):
        r=self.execute(guard=lambda:False);self.assertEqual(self.calls,[]);self.assertTrue(r['errors'])
    def test_original_guard_drift_before_effects(self):
        checks=[True,False]
        r=self.execute(guard=lambda:checks.pop(0));self.assertEqual(self.calls,[]);self.assertFalse(r['restoration_complete'])
    def test_unfreeze_error_stops_services(self):
        def unfreeze():raise RuntimeError('not enabled')
        r=self.execute(unfreeze=unfreeze);self.assertEqual(self.calls,[]);self.assertTrue(r['errors'])
    def test_service_failure_does_not_skip_other_hosts_or_remove_keys(self):
        def restore(i):
            self.calls.append(('services',i))
            if i==1:raise RuntimeError('service blocked')
        r=self.execute(restore=restore);self.assertIn(('services',2),self.calls);self.assertFalse(any(isinstance(x,tuple) and x[0]=='finish' for x in self.calls));self.assertFalse(r['restoration_complete'])
    def test_finish_failure_keeps_gate_failed(self):
        def finish(i):
            self.calls.append(('finish',i))
            if i==1:raise RuntimeError('domain inventory changed')
        r=self.execute(finish=finish);self.assertIn(('finish',2),self.calls);self.assertFalse(r['qualification_passed'])
    def test_audit_failure_before_unfreeze(self):
        def audit(e):raise OSError('disk full')
        r=self.execute(audit=audit);self.assertEqual(self.calls,[]);self.assertFalse(r['qualification_passed'])
    def test_forged_receipt_not_accepted(self):
        for r in [None,{},replace(receipt(),common_index=999),replace(receipt(),samples=1),replace(receipt(),elapsed_seconds=float("nan")),replace(receipt(),statuses={0:parse_status(xml(0),0)})]:
            with self.subTest(receipt=r):
                self.calls=[];result=self.execute(probe=lambda *a:r);self.assertEqual(self.calls,[]);self.assertFalse(result['qualification_passed'])
    def test_duplicate_restore_host_refused_before_effect(self):
        with self.assertRaises(ValueError):
            complete_restoration(lambda:True,lambda *a:receipt(),lambda:self.calls.append('enable'),lambda i:None,lambda i:None,expected_ids=(0,1,1,2))
        self.assertEqual(self.calls,[])
    def test_invalid_recovery_budget_refused(self):
        with self.assertRaises(ValueError):
            complete_restoration(lambda:True,lambda *a:receipt(),lambda:self.calls.append('enable'),lambda i:None,lambda i:None,recovery_timeout=float('inf'))
        self.assertEqual(self.calls,[])

    def test_actual_late_timeline_has_two_fresh_samples(self):
        c=Clock()
        def read(i,b):return xml(i,commit=9 if i==1 and c.t<91 else 10)
        def probe(seconds,authority,floors):
            return wait_strict_sync(read,timeout=seconds,authority=authority,floors=floors,clock=c.now,sleep=c.sleep)
        r=self.execute(probe=probe);self.assertEqual(c.t,92);self.assertTrue(r['restoration_complete']);self.assertFalse(r['qualification_passed'])


class LegacyReproductionTests(unittest.TestCase):
    def legacy_quorum(self,reader):
        tree=ast.parse(OLD.read_text());f=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='quorum')
        c=Clock();env={'E':ET,'HOSTS':{0:None,1:None,2:None},'time':type('Time',(),{'monotonic':c.now,'sleep':c.sleep})(),'rpc':lambda i,*args:reader(i),'leader':0}
        exec(compile(ast.Module(body=[f],type_ignores=[]),str(OLD),'exec'),env)
        return env['quorum']
    def test_old_quorum_accepts_wrong_endpoint_identity(self):
        q=self.legacy_quorum(lambda i:xml(i,server_id=9 if i==1 else i));self.assertEqual(len(q()),3)
        with self.assertRaises(UnsafeSnapshot):parse_status(xml(1,server_id=9),1)
    def test_old_quorum_accepts_impossible_log_geometry(self):
        q=self.legacy_quorum(lambda i:xml(i,log_index=9));self.assertEqual(len(q()),3)
        with self.assertRaises(UnsafeSnapshot):parse_status(xml(1,log_index=9),1)
    def test_old_timeout_loses_member_diagnostic(self):
        q=self.legacy_quorum(lambda i:xml(i,commit=9 if i==1 else 10))
        if not __debug__:
            # Reproduced additional legacy hazard: -O removes its assert-based gate.
            self.assertEqual(len(q(2)),3)
            return
        with self.assertRaises(RuntimeError) as c:q(2)
        self.assertEqual(str(c.exception),'quorum verification failed: ')
    def test_actual_old_finally_skips_remaining_restoration(self):
        tree=ast.parse(OLD.read_text());main=next(x for x in tree.body if isinstance(x,ast.Try) and x.finalbody)
        branch=next(x for x in main.finalbody if isinstance(x,ast.If));block=branch.body[0]
        self.assertIsInstance(block,ast.Try)
        calls=[]
        def fail(*a):raise RuntimeError('quorum verification failed: ')
        env={'prepared':[0,1,2],'HOSTS':{0:None,1:None,2:None},'stopped':False,'disabled':[0,1,2],'BASE':'base','NEW':'new','result':{'zone_disabled':True},'recovery_errors':[],
             'actor':lambda i,action:({'core':'base'} if action=='readback' else calls.append((i,action))),
             'quorum':fail,'unfreeze':lambda:calls.append('enable')}
        exec(compile(ast.Module(body=[block],type_ignores=[]),str(OLD),'exec'),env)
        self.assertEqual(calls,[]);self.assertEqual(env['recovery_errors'],['quorum verification failed: '])


if __name__=='__main__':unittest.main(verbosity=2)
