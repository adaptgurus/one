"""Generate a source-only candidate from the immutable attempted coordinator.
No generated runner is executed by this script. Actual retry requires a fresh
root-private admitted staging directory, pinned artifacts and owner review.
"""
from pathlib import Path
import ast
R=Path(__file__).resolve().parents[2]
old=R/'evidence/onedrs-r10-live-reschedule-20261114/cohort-attempt3'
out=Path(__file__).resolve().parent
s=(old/'cohort_test.py').read_text()
s=s.replace("D=Path('/var/lib/layersentry/onedrs-r10-cohort-r3-20261114');", "D=Path(__file__).resolve().parent;\nassert D.parent==Path('/var/lib/layersentry') and D.name.startswith('onedrs-r10-cohort-'), 'Requires fresh admitted lab staging';\nassert not D.is_symlink() and D.stat().st_uid==0 and D.stat().st_mode & 0o077==0;" )
start=s.index('def quorum(wait=0):');end=s.index('\ndef inventory():',start)
s=s[:start]+'''def sync_audit(event):
    # Retain actionable per-host lag/identity diagnostics; no credential bytes.
    p=D/'strict-sync-observations.jsonl'
    fd=os.open(p, os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd,'a') as stream:
        stream.write(json.dumps(event)+'\\n');stream.flush();os.fsync(stream.fileno())

def status_reader(i, remaining):
    with xmlrpc.client.ServerProxy('http://'+HOSTS[i]+':2633/RPC2',
                                  transport=Transport(min(4.0, remaining))) as client:
        answer=client.one.zone.raftstatus(AUTH)
    if not isinstance(answer,(tuple,list)) or len(answer)<2 or answer[0] is not True:
        raise RuntimeError('native Raft status read refused')
    return answer[1]

def probe_sync(seconds, authority=None, floors=None):
    return wait_strict_sync(status_reader, expected_ids=tuple(HOSTS), timeout=seconds,
                            authority=authority, floors=floors, audit=sync_audit)

def quorum(wait=10):
    global leader
    receipt=probe_sync(wait)
    leader=receipt.leader_id
    return {i:{'SERVER_ID':str(v.server_id),'STATE':str(v.state),'TERM':str(v.term),
               'COMMIT':str(v.commit),'LOG_INDEX':str(v.log_index)}
            for i,v in receipt.statuses.items()}
''' + s[end:]
start=s.index('finally:\n    recovery_errors=[]')
s=s[:start]+'''finally:
    recovery_errors=[];restoration=None
    if prepared:
        try:
            current={i:actor(i,'readback') for i in HOSTS}
            if any(v['core'] not in [BASE,NEW] for v in current.values()):
                raise RuntimeError('Unknown installed binary; no automatic replacement')
            already_original=all(v['core']==BASE and v.get('running_core')==BASE
                                 and v['active'] for v in current.values())
            if not already_original:
                if not stopped:freeze()
                order=[i for i in HOSTS if i!=leader]+[leader]
                stopped=True
                for i in order:actor(i,'stop')
                for i in HOSTS:actor(i,'rollback')
                for i in [leader]+[j for j in HOSTS if j!=leader]:actor(i,'start-core')
            # Do not re-stop/reinstall healthy original cores after a late catch-up.
            def verify_original():
                rows={i:actor(i,'readback') for i in HOSTS}
                native_ok=all(v['core']==BASE and v.get('running_core')==BASE
                              and v['active'] and v.get('original_driver')
                              and v.get('guards_ok') and v.get('original_domains_equal')
                              for v in rows.values())
                after=inventory()
                return bool(native_ok and before is not None and
                            all(after.get(i)==v for i,v in before.items()))
            restoration=complete_restoration(verify_original,probe_sync,unfreeze,
                lambda i:actor(i,'restore-services'),lambda i:actor(i,'finish'),
                expected_ids=tuple(HOSTS),audit=sync_audit)
            result['restoration']=restoration
            if restoration['restoration_complete']:
                stopped=False
                after=inventory();(D/'cohort-vm-after.json').write_text(json.dumps(after,indent=2)+'\\n')
                result['original_VM_records_preserved']=all(after.get(i)==v for i,v in before.items())
                rows={i:actor(i,'readback') for i in HOSTS}
                result['final_all_cores_original_r8']=all(v['core']==BASE and v.get('running_core')==BASE for v in rows.values())
                result['temporary_lab_keys_removed']=all(not v['key_added'] for v in rows.values())
                result['original_services_restored']=all(v.get('services_restored') for v in rows.values())
            recovery_errors.extend(restoration['errors'])
        except BaseException as ex:
            recovery_errors.append({'step':'restore_original_cohort','error_type':type(ex).__name__,'error':str(ex)[:300]})
    result['recovery_errors']=recovery_errors
    complete=(restoration is not None and restoration['restoration_complete']
              and result.get('original_VM_records_preserved')
              and result.get('final_all_cores_original_r8')
              and result.get('temporary_lab_keys_removed')
              and result.get('original_services_restored'))
    accepted=bool(success and complete and restoration['qualification_passed'] and not recovery_errors)
    result['result']=('PASS_NATIVE_R10_COHORT_RESCHEDULE_AND_ROLLBACK' if accepted else
                      'FAIL_ACCEPTANCE_ORIGINAL_RESTORED' if complete else 'FAIL_REQUIRES_RECONCILIATION')
    result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    save();(D/'cohort-result.json').write_text(json.dumps(result,indent=2)+'\\n');print(json.dumps(result,indent=2),flush=True)
if not result['result'].startswith('PASS'):raise SystemExit(1)
'''
# Make imports side-effect-free. Mutation code is behind explicit script execution.
lines=s.splitlines();imports=[];body=[]
for line in lines:
    if line.startswith('from pathlib import ') or line.startswith('import concurrent.futures,'):imports.append(line)
    else:body.append(line)
bodytext='\n'.join(body)
# The existing function scopes now enclose the run-local variables.
bodytext=bodytext.replace('    global leader','    nonlocal leader').replace('    global disabled','    nonlocal disabled').replace('    global stopped','    nonlocal stopped')
code='"""SOURCE-ONLY candidate; no live test of this updated runner yet."""\n'+'\n'.join(imports)+'\nfrom rollback_guard import wait_strict_sync, complete_restoration\nfrom read_only_probe import Transport\n\ndef run():\n    if not __debug__: raise RuntimeError("Optimized Python is not admitted for the lab executor")\n'+'\n'.join('    '+line if line else '' for line in bodytext.splitlines())+'\n\nif __name__=="__main__":run()\n'
ast.parse(code);(out/'cohort_candidate.py').write_text(code)
# Exact original node actor gets stronger readback but no relaxed action guard.
a=(old/'node_actor.py').read_text().replace("D = Path('/var/lib/layersentry/onedrs-r10-cohort-r3-20261114')", "D = Path(__file__).resolve().parent\nassert D.parent == Path('/var/lib/layersentry') and D.name.startswith('onedrs-r10-cohort-')\nassert not D.is_symlink() and D.stat().st_uid == 0 and D.stat().st_mode & 0o077 == 0")
needle="    print(json.dumps({'host': pre['hostname']"
ix=a.index(needle)
a=a[:ix]+'''    pid=int(subprocess.check_output(['systemctl','show','opennebula','-p','MainPID','--value'],text=True))
    running_sha=sha('/proc/'+str(pid)+'/exe') if pid>0 else None
    domains=sorted(subprocess.check_output(['virsh','-c','qemu:///system','list','--uuid'],text=True).split())
    print(json.dumps({'host':pre['hostname'],'action':action,'core':sha('/usr/bin/oned'),
        'running_core':running_sha,'active':active('opennebula.service'),
        'prepared':s['prepared'],'key_added':s['key_added'],'result':'PASS',
        'original_driver':sha(DRIVER)==s.get('driver_sha'),'guards_ok':guards()==s.get('guards'),
        'original_domains_equal':domains==s.get('domain_uuids'),
        'services_restored':all(active(u) for u in s.get('active_units',[]))}))
''' + a[a.index('except BaseException as ex:',ix):]
a=a.replace('pre = json.loads(', 'if not __debug__: raise RuntimeError(\"Optimized Python is not admitted for the lab executor\")\npre = json.loads(', 1)
ast.parse(a);(out/'node_actor_candidate.py').write_text(a)
print('CANDIDATE_COORDINATOR_AND_READBACK_GENERATED_NO_NATIVE_EXECUTION')
