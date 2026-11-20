#!/usr/bin/env python3
"""Add exactly the reviewed DR4 peer without changing base/OVN role files."""
from pathlib import Path
import subprocess,json,hashlib,os,sys,shutil,fcntl,datetime
P=Path('/root/ls-onedrs-migration-endpoint-20261120')
H=Path('/usr/libexec/layersentry-host-network-role')
EXPECTED='e2006979aef27d1d32db5c856b2840398ae23b1b06ada272009b838a37b6768f'
SOURCES={'96ffe8b4-4125-4626-8677-6c4fa6cff44e':'10.201.20.2','7a8de079-0a04-4bc6-8c53-e3439d7ce94d':'10.201.20.3','3a521acf-c116-4c5e-a6ce-920527f45d45':'10.201.20.4'}
R={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'PRECHECK','actions':[]}
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save():
 q=P/'peer-admission-result.json.tmp';q.write_text(json.dumps(R,indent=2)+'\n');q.chmod(0o600)
 with q.open('rb') as f:os.fsync(f.fileno())
 os.replace(q,P/'peer-admission-result.json');fd=os.open(P,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
def run(a,timeout=20):
 r=subprocess.run(a,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout);R['actions'].append({'argv':a,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});save()
 if r.returncode:raise RuntimeError(a[0]+' failed: '+r.stderr[:800])
 return r.stdout
def domains():
 out={}
 for name in subprocess.check_output(['virsh','list','--name'],text=True).splitlines():
  if not name.strip():continue
  xml=subprocess.check_output(['virsh','dumpxml','--inactive',name],text=True);pid=Path('/run/libvirt/qemu/'+name+'.pid')
  out[name]={'uuid':subprocess.check_output(['virsh','domuuid',name],text=True).strip(),'inactive_xml_sha256':hashlib.sha256(xml.encode()).hexdigest(),'pid':pid.read_text().strip() if pid.exists() else None}
 return out
if sys.argv[1:]!=['--execute']:raise SystemExit('explicit --execute required')
uid=Path('/sys/class/dmi/id/product_uuid').read_text().strip();assert os.geteuid()==0 and uid in SOURCES
assert not (P/'peer-admission-result.json').exists(),'existing execution receipt; inspect instead of replay'
lock=(P/'peer-admission.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);os.umask(0o077)
try:
 before=json.loads((P/'baseline.json').read_text());assert before['dmi']==uid and domains()==before['domains'],'guest custody changed'
 assert digest(H)==before['helper']['sha256'] and digest(P/'helper.candidate')==EXPECTED
 for path,sha in before['files'].items():assert digest(path)==sha,'protected base/OVN file changed: '+path
 overlay=Path('/var/lib/layersentry/host-network-roles')/(uid+'-migration-peers.json');assert not overlay.exists()
 bridge=next(x for x in before['addresses'] if x['ifname']=='br-mgmt')['address'];assert Path('/sys/class/net/br-mgmt/address').read_text().strip()==bridge
 run(['/usr/sbin/arping','-I','br-mgmt','-c','1','-w','3','10.201.20.6'],8)
 shutil.copy2(H,P/'helper.original');(P/'helper.original').chmod(0o600)
 tmp=H.with_name('.layersentry-host-network-role.onedrs-20261120');assert not tmp.exists();shutil.copyfile(P/'helper.candidate',tmp);tmp.chmod(0o755);os.chown(tmp,0,0)
 run(['restorecon',str(tmp)]);os.replace(tmp,H);run(['restorecon',str(H)])
 R['state']='ADMITTING_NEW_PEER';save()
 R['admission']=json.loads(run([str(H),'migration-peer-admit','dr4','87cee185-4cab-4384-afde-19a5cd3a2239','10.201.20.6'],70))
 R['prepared']=json.loads(run([str(H),'migration-prepare','dr4'],10))
 assert R['prepared']['source_address']==SOURCES[uid] and R['prepared']['target_address']=='10.201.20.6'
 assert R['prepared']['peer_admission_sha256']==digest(overlay)
 run(['ping','-n','-I','ls-migration','-c','2','-W','2','10.201.20.6'],8)
 for path,sha in before['files'].items():assert digest(path)==sha,'protected base/OVN file changed: '+path
 assert domains()==before['domains'],'guest custody changed'
 assert Path('/sys/class/net/br-mgmt/address').read_text().strip()==bridge
 assert digest(H)==EXPECTED and run(['getenforce']).strip()=='Enforcing'
 assert run(['systemctl','is-enabled','layersentry-host-network-roles.service']).strip()=='enabled'
 R.update(state='PASS_PEER_ADMISSION_AND_REACHABILITY',base_and_ovn_files_preserved=True,preserved_file_count=len(before['files']),guest_processes_and_configurations_preserved=True,guest_count=len(before['domains']),live_migration_qualified=False)
except Exception as e:R['state']='FAILED_RETAINED_FOR_RECONCILIATION';R['error']=str(e)
finally:
 R['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps({k:v for k,v in R.items() if k!='actions'},indent=2))
