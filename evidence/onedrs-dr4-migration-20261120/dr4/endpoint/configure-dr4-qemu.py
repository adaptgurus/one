#!/usr/bin/env python3
"""Set the reviewed DR4 native migration endpoint, preserving existing guests."""
from pathlib import Path
import subprocess,json,hashlib,os,sys,shutil,datetime,re
P=Path('/root/ls-onedrs-migration-endpoint-20261120');CONF=Path('/etc/libvirt/qemu.conf')
R={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'PRECHECK','actions':[],'added_rules':[]}
def sha(b):return hashlib.sha256(b).hexdigest()
def save():
 q=P/'qemu-config-result.json.tmp';q.write_text(json.dumps(R,indent=2)+'\n');q.chmod(0o600)
 with q.open('rb') as f:os.fsync(f.fileno())
 os.replace(q,P/'qemu-config-result.json')
def run(a,timeout=20):
 r=subprocess.run(a,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout);R['actions'].append({'argv':a,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});save()
 if r.returncode:raise RuntimeError(a[0]+' failed: '+r.stderr[:700])
 return r.stdout
def domains():
 out={}
 for n in subprocess.check_output(['virsh','list','--name'],text=True).splitlines():
  if n:
   x=subprocess.check_output(['virsh','dumpxml','--inactive',n],text=True);f=Path('/run/libvirt/qemu/'+n+'.pid')
   out[n]={'uuid':subprocess.check_output(['virsh','domuuid',n],text=True).strip(),'inactive_xml_sha256':sha(x.encode()),'pid':f.read_text().strip() if f.exists() else None}
 return out
if sys.argv[1:]!=['--execute']:raise SystemExit('explicit --execute required')
assert os.geteuid()==0 and Path('/sys/class/dmi/id/product_uuid').read_text().strip()=='87cee185-4cab-4384-afde-19a5cd3a2239'
assert not (P/'qemu-config-result.json').exists(),'inspect existing execution receipt before replay'
os.umask(0o077)
try:
 baseline=json.loads((P/'baseline.json').read_text());expected={k:v for k,v in baseline['domains'].items() if k!='one-53'}
 before=domains();assert len(before)==8 and before==expected
 assert not run(['virsh','list','--name','--transient']).strip(),'transient domain still present'
 assert set(run(['virsh','list','--name','--persistent']).split())==set(before)
 for n in before:
  info=run(['virsh','domjobinfo',n]);assert re.search(r'Job type:\s+None',info),'active guest job'
 old=CONF.read_bytes();assert sha(old)=='82157a72c50ec7285d3739e3cfe83aff40a36f4f97b044e0a06e3c37d8bda291'
 text=old.decode();assert not re.search(r'(?m)^\s*(migration_address|migration_host|migration_port_min|migration_port_max)\s*=',text)
 assert json.loads((P/'activation-result.json').read_text())['state']=='PASS_ENDPOINT_AND_PERSISTENCE_REPLAY'
 for address in ['10.201.20.2','10.201.20.3','10.201.20.4']:run(['ping','-n','-I','ls-migration','-c','1','-W','2',address],6)
 R['libvirtd_pid_before']=int(run(['systemctl','show','libvirtd.service','--property=MainPID','--value']).strip());assert R['libvirtd_pid_before']==97935
 R['nat_xml_sha256']=sha(run(['virsh','net-dumpxml','default']).encode())
 assert run(['systemctl','show','libvirtd.service','--property=KillMode','--value']).strip()=='process'
 rules=['rule family="ipv4" source address="'+source+'/32" destination address="10.201.20.6/32" port port="49152-49215" protocol="tcp" accept' for source in ['10.201.20.2','10.201.20.3','10.201.20.4']]
 R['state']='APPLYING_SCOPED_CONFIGURATION';save()
 for permanent in [False,True]:
  flags=['--permanent'] if permanent else []
  existing=set(run(['firewall-cmd',*flags,'--zone=public','--list-rich-rules']).splitlines())
  for rule in rules:
   if rule not in existing:
    run(['firewall-cmd',*flags,'--zone=public','--add-rich-rule='+rule]);R['added_rules'].append({'permanent':permanent,'rule':rule});save()
 shutil.copy2(CONF,P/'qemu.conf.original');(P/'qemu.conf.original').chmod(0o600)
 new=old+b'\n# Owned OneDRS DR4 migration qualification 20261120\nmigration_address = "10.201.20.6"\nmigration_host = "10.201.20.6"\nmigration_port_min = 49152\nmigration_port_max = 49215\n'
 tmp=CONF.with_name('.qemu.conf.onedrs-20261120');assert not tmp.exists();tmp.write_bytes(new);tmp.chmod(CONF.stat().st_mode&0o777);os.chown(tmp,CONF.stat().st_uid,CONF.stat().st_gid)
 with tmp.open('rb') as f:os.fsync(f.fileno())
 os.replace(tmp,CONF);run(['restorecon',str(CONF)])
 R['qemu_conf_before_sha256']=sha(old);R['qemu_conf_after_sha256']=sha(new);R['state']='RESTARTING_ONLY_LIBVIRTD';save()
 run(['systemctl','restart','libvirtd.service'],110)
 R['libvirtd_pid_after']=int(run(['systemctl','show','libvirtd.service','--property=MainPID','--value']).strip())
 assert R['libvirtd_pid_after']>0 and R['libvirtd_pid_after']!=R['libvirtd_pid_before']
 assert run(['systemctl','is-active','libvirtd.service']).strip()=='active'
 assert domains()==before,'existing guest process/configuration changed'
 assert sha(run(['virsh','net-dumpxml','default']).encode())==R['nat_xml_sha256']
 assert run(['getenforce']).strip()=='Enforcing'
 for target in ['172.17.60.80','172.17.60.65']:
  run(['ssh','-n','-i','/root/ls-ovn26-dr4-canary-20261109/id_ed25519','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/root/ls-ovn26-dr4-canary-20261109/known_hosts','-o','ConnectTimeout=5','rocky@192.168.122.102','ping -n -c 2 -W 2 '+target],12)
 R.update(state='PASS_CONFIGURATION_RESTART_AND_GUEST_PRESERVATION',preserved_guest_count=8,existing_qemu_processes_unchanged=True,host_reboot_performed=False,migration_socket_proof_pending=True)
except Exception as e:R['state']='FAILED_RETAINED_FOR_RECONCILIATION';R['error']=str(e)
finally:
 R['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps({k:v for k,v in R.items() if k!='actions'},indent=2))
