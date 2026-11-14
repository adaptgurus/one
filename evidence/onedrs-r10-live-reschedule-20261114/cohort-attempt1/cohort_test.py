"""Authorized lab-only coordinated R10 qualification, with mandatory original-version rollback.
Management services pause; guests and hypervisor networking are not stopped.
No schema migration, native DB restore, host power action or DR4 registration.
"""
from pathlib import Path
import concurrent.futures, datetime, fcntl, hashlib, json, os, shlex, socket, subprocess, time, xml.etree.ElementTree as E, xmlrpc.client
D=Path('/var/lib/layersentry/onedrs-r10-cohort-20261114'); os.umask(0o077); socket.setdefaulttimeout(5)
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
def quorum(wait=0):
    global leader
    start=time.monotonic(); last=''
    while True:
        try:
            states={i:{k:r.findtext(k) for k in ['STATE','TERM','COMMIT','LOG_INDEX']} for i in HOSTS for r in [E.fromstring(rpc(i,'one.zone.raftstatus'))]}
            leaders=[i for i,r in states.items() if r['STATE']=='3']; assert len(leaders)==1
            leader=leaders[0]
            assert all(r['STATE'] in ['2','3'] for r in states.values()) and len({r['TERM'] for r in states.values()})==1
            assert all(int(r['COMMIT'])>=int(states[leader]['COMMIT']) for r in states.values())
            return states
        except Exception as ex:
            last=str(ex)
            if time.monotonic()-start>=wait: raise RuntimeError('quorum verification failed: '+last)
            time.sleep(1)

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
    global disabled
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
    global stopped
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
    recovery_errors=[]
    if prepared:
        try:
            # Reestablish all cores if an interruption happened during the stopped maintenance phase.
            if stopped:
                for i in HOSTS:
                    try: actor(i,'stop');actor(i,'rollback')
                    except Exception as ex: recovery_errors.append('partial phase host '+str(i)+': '+str(ex))
                for i in HOSTS: actor(i,'start-core')
                quorum(90)
                if result.get('zone_disabled') or disabled: unfreeze()
                stopped=False
            # A completed candidate cohort is returned to the original package regardless of test outcome.
            current={i:actor(i,'readback')['core'] for i in HOSTS}
            if any(x==NEW for x in current.values()):
                result['rollback_raft']=transition('rollback')
            elif result.get('zone_disabled') or disabled:
                quorum(60);unfreeze()
            for i in prepared: actor(i,'restore-services')
            for i in prepared: actor(i,'finish')
            result['after_raft']=quorum(30)
            after=inventory();(D/'cohort-vm-after.json').write_text(json.dumps(after,indent=2)+'\n')
            result['original_VM_records_preserved']=before is not None and all(after.get(i)==v for i,v in before.items())
            result['final_all_cores_original_r8']=all(actor(i,'readback')['core']==BASE for i in HOSTS)
            result['temporary_lab_keys_removed']=all(not actor(i,'readback')['key_added'] for i in prepared)
            result['original_services_restored']=True
        except BaseException as ex: recovery_errors.append(str(ex))
    result['recovery_errors']=recovery_errors
    result['result']='PASS_NATIVE_R10_COHORT_RESCHEDULE_AND_ROLLBACK' if success and not recovery_errors and result.get('original_VM_records_preserved') and result.get('final_all_cores_original_r8') else 'FAIL_REQUIRES_RECONCILIATION'
    result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();(D/'cohort-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if not result['result'].startswith('PASS'): raise SystemExit(1)
