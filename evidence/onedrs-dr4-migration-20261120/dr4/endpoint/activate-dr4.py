#!/usr/bin/env python3
"""Owned DR4 migration endpoint qualification. Never remove configured endpoints."""
from pathlib import Path
import subprocess,json,hashlib,os,sys,shutil,fcntl,datetime,stat
P=Path('/root/ls-onedrs-migration-endpoint-20261120')
UUID='87cee185-4cab-4384-afde-19a5cd3a2239'
EXPECTED='e2006979aef27d1d32db5c856b2840398ae23b1b06ada272009b838a37b6768f'
UNIT='layersentry-host-migration-role.service'
HELPER=Path('/usr/libexec/layersentry-host-network-role')
R={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Owned DR4 migration endpoint only; no QEMU/native policy change','state':'PRECHECK','actions':[]}
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save():
 q=P/'activation-result.json.tmp';q.write_text(json.dumps(R,indent=2)+'\n');q.chmod(0o600)
 with q.open('rb') as f:os.fsync(f.fileno())
 os.replace(q,P/'activation-result.json')
 fd=os.open(P,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
def run(a,timeout=20):
 r=subprocess.run(a,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 R['actions'].append({'argv':a,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});save()
 if r.returncode:raise RuntimeError(a[0]+' failed: '+r.stderr[:600])
 return r.stdout
def domains():
 out={}
 for name in subprocess.check_output(['virsh','list','--name'],text=True).splitlines():
  if not name.strip():continue
  uuid=subprocess.check_output(['virsh','domuuid',name],text=True).strip()
  xml=subprocess.check_output(['virsh','dumpxml','--inactive',name],text=True)
  pid=Path('/run/libvirt/qemu/'+name+'.pid')
  out[name]={'uuid':uuid,'inactive_xml_sha256':hashlib.sha256(xml.encode()).hexdigest(),'pid':pid.read_text().strip() if pid.exists() else None}
 return out
def install(source,target,mode):
 target=Path(target);tmp=target.with_name('.'+target.name+'.onedrs-20261120')
 assert not tmp.exists();shutil.copyfile(source,tmp);tmp.chmod(mode);os.chown(tmp,0,0)
 subprocess.run(['restorecon',str(tmp)],check=True,capture_output=True)
 with tmp.open('rb') as f:os.fsync(f.fileno())
 os.replace(tmp,target);subprocess.run(['restorecon',str(target)],check=True,capture_output=True)
 fd=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
if sys.argv[1:]!=['--execute']:raise SystemExit('explicit --execute required')
assert os.geteuid()==0 and Path('/sys/class/dmi/id/product_uuid').read_text().strip()==UUID
assert not (P/'activation-result.json').exists(),'existing execution receipt; inspect instead of replay'
lock=(P/'activation.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
os.umask(0o077)
try:
 before=json.loads((P/'baseline.json').read_text());assert domains()==before['domains'],'guest custody changed before activation'
 assert len(before['domains'])==9 and 'one-53' in before['domains']
 assert digest(HELPER)==before['helper']['sha256'] and digest(P/'helper.candidate')==EXPECTED
 for filename,sha in before['files'].items():assert digest(filename)==sha
 binding=json.loads((P/'binding.json').read_text());assert binding['host_uuid']==UUID and digest(P/'profile.json')==binding['profile_sha256']
 target=Path('/etc/layersentry/host-network-roles');assert not target.exists()
 unit=Path('/usr/lib/systemd/system')/UNIT;assert not unit.exists()
 for name in ['ls-migration','ls-mig-peer']:assert not Path('/sys/class/net',name).exists()
 assert Path('/sys/class/net/br-mgmt/address').read_text().strip()=='bc:24:11:3b:38:0f'
 assert Path('/usr/sbin/arping').is_file()
 run(['/usr/sbin/arping','-D','-I','br-mgmt','-c','3','-w','4','10.201.20.6'],10)
 R['state']='STAGING_PROTECTED_INPUT';save()
 shutil.copy2(HELPER,P/'helper.original');(P/'helper.original').chmod(0o600)
 install(P/'helper.candidate',HELPER,0o755)
 target.mkdir(mode=0o700)
 install(P/'profile.json',target/(UUID+'.json'),0o600);install(P/'binding.json',target/'binding.json',0o600)
 custody=Path('/var/lib/layersentry/host-network-roles');custody.mkdir(mode=0o700,exist_ok=True)
 install(P/'layersentry-host-migration-role.service',unit,0o644)
 run(['systemctl','daemon-reload'])
 R['state']='INSTALLING_ENDPOINT';save()
 R['endpoint']=json.loads(run([str(HELPER),'migration-bridge-install'],105))
 assert R['endpoint']['version']==3 and R['endpoint']['state']=='CONFIGURED' and R['endpoint']['ever_configured'] is True
 for peer in ['dr1','dr2','dr3']:
  result=json.loads(run([str(HELPER),'migration-prepare',peer],10));assert result['source_address']=='10.201.20.6'
 R['persistence']=json.loads(run([str(HELPER),'migration-enable-persistence'],105))
 run(['systemctl','start',UNIT],110)
 assert run(['systemctl','is-enabled',UNIT]).strip()=='enabled'
 assert run(['systemctl','is-active',UNIT]).strip()=='active'
 assert domains()==before['domains'],'guest custody changed'
 assert Path('/sys/class/net/br-mgmt/address').read_text().strip()=='bc:24:11:3b:38:0f'
 assert digest(HELPER)==EXPECTED and digest(target/(UUID+'.json'))==binding['profile_sha256']
 assert run(['getenforce']).strip()=='Enforcing'
 R.update(state='PASS_ENDPOINT_AND_PERSISTENCE_REPLAY',guest_count=9,guest_processes_and_configurations_preserved=True,host_reboot_performed=False,live_migration_qualified=False)
except Exception as e:
 R['state']='FAILED_RETAINED_FOR_RECONCILIATION';R['error']=str(e)
finally:
 R['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 print(json.dumps({k:v for k,v in R.items() if k!='actions'},indent=2))
