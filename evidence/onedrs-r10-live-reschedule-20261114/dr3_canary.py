"""Authorized lab-only same-version follower canary and rollback.
No guest lifecycle call, schema migration, host disable or leadership change.
"""
from pathlib import Path
import os,subprocess,xmlrpc.client,xml.etree.ElementTree as E,socket,time,json,hashlib,shutil,datetime
D=Path('/var/lib/layersentry/onedrs-pr54-r10-canary-20261113');socket.setdefaulttimeout(4)
assert not (D/'canary-result.json').exists(),'already executed; inspect recorded outcome'
assert Path('/sys/class/dmi/id/product_uuid').read_text().strip()=='3a521acf-c116-4c5e-a6ce-920527f45d45'
assert subprocess.check_output(['hostname'],text=True).strip()=='dr3'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
basecore='d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1';newcore='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
newdriver='3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b'
assert sha(D/'candidate.rpm')=='30d4cd97930281d699ad3aa45e434f1b87d43ddd23cb249a6c656b7b4088f7ed'
assert sha(D/'rollback.rpm')=='f84b8c8936343cb37d8ea39728113182645a8fdb92a73fb7d275d47d3ea51b18'
assert sha('/usr/bin/oned')==basecore
assert (D/'native-db-before.sql').stat().st_size>1000
secret=Path('/var/lib/one/.one/one_auth').read_text().strip()
apis={i:xmlrpc.client.ServerProxy('http://'+ip+':2633/RPC2') for i,ip in {0:'172.17.60.80',1:'172.17.60.81',2:'172.17.60.82'}.items()}
result={'scope':'LAB_DR3_NATIVE_FOLLOWER_R10_UPGRADE_R8_ROLLBACK','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actions':[],'no_guest_mutation_requests':True,'no_database_schema_migration':True};mutation=False;key_added=False

def rpc(i,name,*args):
 r=getattr(apis[i],name)(secret,*args)
 if not r[0]:raise RuntimeError(name+': '+str(r[1])[:180])
 return r[1]
def raft(i):
 r=E.fromstring(rpc(i,'one.zone.raftstatus'));return {k:r.findtext(k) for k in ['STATE','TERM','COMMIT','LOG_INDEX']}
def quorum(require_all=True):
 r={i:raft(i) for i in [0,1,2] if require_all or i!=2}
 assert r[0]['STATE']=='3' and r[1]['STATE']=='2','original leader/follower identity changed'
 if require_all:assert r[2]['STATE']=='2','canary must be a follower'
 assert len(set(x['TERM'] for x in r.values()))==1,'term disagreement'
 return r

def inventory():
 rows=[]
 for v in E.fromstring(rpc(0,'one.vmpool.info',-2,-1,-1,-1)).findall('VM'):
  if v.findtext('STATE')=='6':continue
  hs=v.findall('HISTORY_RECORDS/HISTORY');h=hs[-1] if hs else E.Element('HISTORY')
  rows.append({k:v.findtext(k) for k in ['ID','NAME','UID','STATE','LCM_STATE']}|{'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ')})
 return sorted(rows,key=lambda x:int(x['ID']))
def run(label,args,timeout=90):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,stdin=subprocess.DEVNULL)
 (D/(label+'.log')).write_text(p.stdout+p.stderr)
 result['actions'].append({'name':label,'exit':p.returncode})
 if p.returncode:raise RuntimeError(label+' failed; inspect root-private log')
 return p.stdout

def wait_ready(core,seconds=55):
 start=time.monotonic();last=None
 while time.monotonic()-start<seconds:
  try:
   r=quorum();leader_commit=int(r[0]['COMMIT']);follower_commit=int(r[2]['COMMIT'])
   pid=subprocess.check_output(['systemctl','show','opennebula','-p','MainPID','--value'],text=True).strip()
   if int(pid)>0 and sha('/proc/'+pid+'/exe')==core and follower_commit>=leader_commit:
    # A second read proves the source remains the same leader at this boundary.
    assert raft(0)['STATE']=='3'
    return {'seconds_to_raft_synced':round(time.monotonic()-start,3),'pid':int(pid),'running_sha256':core,'raft':r,'native_version':rpc(2,'one.system.version')}
  except Exception as ex:last=str(ex)
  time.sleep(.5)
 raise RuntimeError('follower readiness timeout: '+str(last))

def restore_original_driver():
 target=Path('/var/lib/one/remotes/vmm/kvm/deploy');tmp=target.with_name('deploy.onedrs-rollback-owned')
 assert not tmp.exists();shutil.copy2(D/'deploy.before',tmp);os.chown(tmp,9869,9869);os.chmod(tmp,0o750);os.replace(tmp,target)
 subprocess.run(['restorecon','-F',str(target)],check=True)

def activate_previous_services(label):
 for unit in active_units:run(label+'-'+unit,['systemctl','start',unit],timeout=45)

try:
 result['before_raft']=quorum();before=inventory();result['before_VM_count']=len(before)
 assert all(v['STATE']=='8' or v['STATE']=='3' and v['LCM_STATE']=='3' for v in before),'VM transition currently active'
 (D/'vm-before.json').write_text(json.dumps(before,indent=2)+'\n')
 # Preserve native configuration/credential files privately; never print/archive their bytes in evidence.
 run('private-config-backup',['tar','--acls','--xattrs','-cpf',str(D/'native-config-before.tar'),'/etc/one','/var/lib/one/.one','/var/lib/one/.ssh'])
 os.chmod(D/'native-config-before.tar',0o600)
 files=['/etc/one/oned.conf','/etc/one/monitord.conf','/var/lib/one/.one/one_auth','/usr/libexec/layersentry-host-network-role']
 guards={p:sha(p) for p in files};shutil.copy2('/var/lib/one/remotes/vmm/kvm/deploy',D/'deploy.before')
 active_units=[u for u in ['opennebula-ssh-agent','opennebula','opennebula-hem'] if subprocess.run(['systemctl','is-active','--quiet',u]).returncode==0]
 assert 'opennebula' in active_units
 result['original_active_units']=active_units
 pub=run('lab-key-fingerprint',['gpg','--show-keys','--with-colons',str(D/'LAB-ONLY-public.asc')])
 assert 'fpr:::::::::1CBC92283A98C598788048398BF04EAFAA428403:' in pub
 existing=subprocess.run(['rpm','-q','gpg-pubkey-aa428403'],capture_output=True,text=True)
 assert existing.returncode!=0,'lab key unexpectedly pre-enrolled'
 run('import-specific-lab-signature-key',['rpm','--import',str(D/'LAB-ONLY-public.asc')]);key_added=True
 for label,file in [('candidate','candidate.rpm'),('rollback','rollback.rpm')]:
  text=run(label+'-signature-check',['rpm','--checksig','--verbose',str(D/file)])
  assert 'NOKEY' not in text and 'Signature' in text and 'OK' in text
 run('final-candidate-transaction-dry-run',['rpm','-Uvh','--test',str(D/'candidate.rpm')])
 quorum();mutation=True
 run('dnf-signed-candidate-install',['dnf','-y','--disablerepo=*','--setopt=localpkg_gpgcheck=1','--setopt=gpgcheck=1','--setopt=install_weak_deps=False','install',str(D/'candidate.rpm')],timeout=90)
 assert sha('/usr/bin/oned')==newcore and sha('/var/lib/one/remotes/vmm/kvm/deploy')==newdriver
 assert all(sha(p)==digest for p,digest in guards.items()),'original config or migration helper drift'
 quorum(require_all=False);activate_previous_services('candidate-start')
 result['candidate_runtime']=wait_ready(newcore)
 assert inventory()==before,'original inventory changed during follower canary'
 # Prove that candidate handles native authenticated reads while remaining a synced follower.
 result['candidate_host_count']=len(E.fromstring(rpc(2,'one.hostpool.info')).findall('HOST'))
 print('R10_NATIVE_FOLLOWER_CANARY_PASS',json.dumps(result['candidate_runtime']),flush=True)
 quorum()
 run('dnf-signed-original-rollback',['dnf','-y','--disablerepo=*','--setopt=localpkg_gpgcheck=1','--setopt=gpgcheck=1','--setopt=install_weak_deps=False','downgrade',str(D/'rollback.rpm')],timeout=90)
 restore_original_driver();assert sha('/usr/bin/oned')==basecore
 activate_previous_services('rollback-start');result['rollback_runtime']=wait_ready(basecore)
 assert all(sha(p)==digest for p,digest in guards.items())
 after=inventory();(D/'vm-after.json').write_text(json.dumps(after,indent=2)+'\n');assert after==before
 result['VM_records_identical_after_upgrade_and_rollback']=True
 result['after_raft']=quorum();result['result']='PASS_NATIVE_FOLLOWER_UPGRADE_AND_ROLLBACK'
 result['final_release']='original r8 restored deliberately after canary'
except BaseException as ex:
 result['result']='FAIL';result['error']=str(ex)
 # Any partial update is returned to the custodied original binary and driver.
 if mutation:
  try:
   run('failure-recovery-r8',['dnf','-y','--disablerepo=*','--setopt=localpkg_gpgcheck=1','--setopt=gpgcheck=1','downgrade',str(D/'rollback.rpm')],timeout=90)
   restore_original_driver();activate_previous_services('failure-recovery-start');result['failure_recovery']=wait_ready(basecore)
  except BaseException as recovery:result['failure_recovery_error']=str(recovery)
finally:
 if key_added:
  p=subprocess.run(['rpm','-e','gpg-pubkey-aa428403'],capture_output=True,text=True,timeout=15)
  result['temporary_lab_trust_removed']=p.returncode==0
 result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (D/'canary-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if not result['result'].startswith('PASS'):raise SystemExit(1)
