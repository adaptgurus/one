"""SOURCE-ONLY candidate; no live test of this updated runner yet."""
from pathlib import Path
import concurrent.futures, datetime, fcntl, hashlib, json, os, shlex, socket, subprocess, time, xml.etree.ElementTree as E, xmlrpc.client
from rollback_guard import wait_strict_sync, complete_restoration
from read_only_probe import Transport

def run():
    if not __debug__: raise RuntimeError("Optimized Python is not admitted for the lab executor")
    """Authorized lab-only coordinated R10 qualification, with mandatory original-version rollback.
    Management services pause; guests and hypervisor networking are not stopped.
    No schema migration, native DB restore, host power action or DR4 registration.
    """
    D=Path(__file__).resolve().parent;
    assert D.parent==Path('/var/lib/layersentry') and D.name.startswith('onedrs-r10-cohort-'), 'Requires fresh admitted lab staging';
    assert not D.is_symlink() and D.stat().st_uid==0 and D.stat().st_mode & 0o077==0; os.umask(0o077); socket.setdefaulttimeout(5)
    assert subprocess.check_output(['hostname'],text=True).strip()=='dr1'
    assert not (D/'cohort-result.json').exists(), 'Already attempted; inspect result, never replay blindly'
    lock=open('/run/lock/layersentry-onedrs-r10-cohort.lock','w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    HOSTS={0:'172.17.60.80',1:'172.17.60.81',2:'172.17.60.82'}
    AUTH=Path('/var/lib/one/.one/one_auth').read_text().strip()
    APIS={i:xmlrpc.client.ServerProxy('http://'+ip+':2633/RPC2') for i,ip in HOSTS.items()}
    BASE='d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1'
    NEW='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
    result={'scope':'COORDINATED_SAME_VERSION_R10_NATIVE_RESCHEDULE_AND_R8_ROLLBACK_LAB','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'events':[],'no_schema_migration':True,'DR4_touched':False,'no_physical_host_failure_injected':True};prepared=[];disabled=[];stopped=False;leader=0

    def save():
        p=D/'cohort-progress.next'; p.write_text(json.dumps(result,indent=2)+'\n'); p.replace(D/'cohort-progress.json')
    def actor(i,action):
        args=['python3',str(D/'node_actor.py'),action]
        if i: args=['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=4','root@'+HOSTS[i],shlex.join(args)]
        p=subprocess.run(args,capture_output=True,text=True,timeout=240)
        (D/(str(i)+'-'+action+'-output.log')).write_text(p.stdout+p.stderr)
        result['events'].append({'host':i,'action':action,'exit':p.returncode,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()});save()
        if p.returncode: raise RuntimeError('node '+str(i)+' '+action+' failed; inspect private output')
        return json.loads(p.stdout.splitlines()[-1])

    def rpc(i,name,*args):
        r=getattr(APIS[i],name)(AUTH,*args)
        if not r[0]: raise RuntimeError(name+': '+str(r[1])[:400])
        return r[1]
    def sync_audit(event):
        # Retain actionable per-host lag/identity diagnostics; no credential bytes.
        p=D/'strict-sync-observations.jsonl'
        fd=os.open(p, os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd,'a') as stream:
            stream.write(json.dumps(event)+'\n');stream.flush();os.fsync(stream.fileno())

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
        nonlocal leader
        receipt=probe_sync(wait)
        leader=receipt.leader_id
        return {i:{'SERVER_ID':str(v.server_id),'STATE':str(v.state),'TERM':str(v.term),
                   'COMMIT':str(v.commit),'LOG_INDEX':str(v.log_index)}
                for i,v in receipt.statuses.items()}

    def inventory():
        rows={}
        for v in E.fromstring(rpc(leader,'one.vmpool.info',-2,-1,-1,-1)).findall('VM'):
            if v.findtext('STATE')=='6': continue
            hs=v.findall('HISTORY_RECORDS/HISTORY'); h=hs[-1] if hs else E.Element('HISTORY')
            rows[v.findtext('ID')]={k:v.findtext(k) for k in ['ID','NAME','UID','STATE','LCM_STATE']}|{'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ')}
        return rows

    def stable(seconds=45):
        start=time.monotonic()
        while True:
            rows=inventory()
            if all((v['STATE'],v['LCM_STATE']) in [('3','3'),('8','0')] for v in rows.values()): return rows
            if time.monotonic()-start>=seconds: raise RuntimeError('foreign or test VM transition remains; refusing scheduled maintenance')
            time.sleep(1)

    def freeze():
        nonlocal disabled
        stable();quorum(10)
        for i in HOSTS:
            rpc(leader,'one.host.status',i,1)
            if i not in disabled: disabled.append(i)
        rpc(leader,'one.zone.enable',0,False);result['zone_disabled']=True;save()

    def unfreeze():
        rpc(leader,'one.zone.enable',0,True);result['zone_disabled']=False;save()
        for i in list(disabled): rpc(leader,'one.host.status',i,0); disabled.remove(i)
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            hosts=E.fromstring(rpc(leader,'one.hostpool.info')).findall('HOST')
            if len(hosts)==3 and all(h.findtext('STATE') in ['1','2'] for h in hosts): return
            time.sleep(1)
        raise RuntimeError('native hosts did not return to monitored state')

    def transition(action):
        nonlocal stopped
        # Exact same-version patch: configuration/DB formats are unchanged; no schema or DB replacement.
        freeze();order=[i for i in HOSTS if i!=leader]+[leader];stopped=True
        for i in order: actor(i,'stop')
        for i in HOSTS: actor(i,action)
        for i in [leader]+[j for j in HOSTS if j!=leader]: actor(i,'start-core')
        q=quorum(90);unfreeze();stopped=False
        target=NEW if action=='install' else BASE
        for i in HOSTS:
            r=actor(i,'readback');assert r['core']==target and r['active']
        return q

    before=None;success=False
    try:
        result['before_raft']=quorum(10);assert leader==0,'Fresh expected initial leader changed'
        z=E.fromstring(rpc(leader,'one.zone.info',0));assert z.findtext('STATE')=='0'
        hosts=E.fromstring(rpc(leader,'one.hostpool.info')).findall('HOST');assert {int(h.findtext('ID')) for h in hosts}==set(HOSTS)
        assert all(h.findtext('STATE') in ['1','2'] for h in hosts)
        cluster=E.fromstring(rpc(leader,'one.cluster.info',0,False));assert cluster.findtext('TEMPLATE/ONE_DRS/AUTOMATION')=='manual'
        before=stable();result['original_VM_count']=len(before);(D/'cohort-vm-before.json').write_text(json.dumps(before,indent=2)+'\n')
        for i in HOSTS:
            # Preparation may add only a temporary verification key and private backups.
            prepared.append(i);actor(i,'prepare')
        result['candidate_raft']=transition('install');print('R10_COHORT_READY',json.dumps(result['candidate_raft']),flush=True)
        after=inventory();assert all(after.get(i)==v for i,v in before.items()),'Original workload drift before test'
        import guest_test
        result['guest_test']=guest_test.execute();success=True
    except BaseException as ex:
        result['error']=str(ex);result['result']='FAIL';print('QUALIFICATION_ERROR',str(ex),flush=True)
    finally:
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
                    after=inventory();(D/'cohort-vm-after.json').write_text(json.dumps(after,indent=2)+'\n')
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
        save();(D/'cohort-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
    if not result['result'].startswith('PASS'):raise SystemExit(1)

if __name__=="__main__":run()
