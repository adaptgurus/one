#!/usr/bin/python3
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,os,shlex,shutil,subprocess
R=Path('/root/ls-onedrs-rc-20261120');nodes=json.loads((R/'provisioning.json').read_text())['members']
assert json.loads((R/'storage-configure-r1-result.json').read_text())['status']=='PASS'
assert shutil.disk_usage(R).free>15*1024**3
remote='''from pathlib import Path
import errno,hashlib,json,os,pwd,re,subprocess
node=json.loads(NODE);r=Path('/root/ls-onedrs-rc-20261120')
assert subprocess.check_output(['hostname','-s'],text=True).strip()==node['name']
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
assert subprocess.run(['rpm','-q','opennebula'],stdout=subprocess.DEVNULL).returncode!=0
u=pwd.getpwnam('oneadmin');assert (u.pw_uid,u.pw_gid)==(9869,9869)
parent=Path('/var/lib/one/datastores');parent.mkdir(mode=0o755);os.chown(parent,u.pw_uid,u.pw_gid)
mounts=[('system',parent/'0',False),('images',parent/'1',False),('files',parent/'2',False),('fences',Path('/var/lib/one/onedrs_fences'),True)]
unit_names=[]
for source,target,readonly in mounts:
 assert not target.exists(),str(target)
 target.mkdir(mode=0o750);os.chown(target,u.pw_uid,u.pw_gid)
 name=subprocess.check_output(['systemd-escape','--path','--suffix=mount',str(target)],text=True).strip()
 options='vers=4.2,proto=tcp,hard,timeo=600,retrans=2,nosuid,nodev,noexec,_netdev'+(',ro' if readonly else ',rw')
 unit=Path('/etc/systemd/system')/name;assert not unit.exists()
 unit.write_text('[Unit]\\nDescription=OneDRS candidate '+source+' datastore\\nAfter=network-online.target\\nWants=network-online.target\\n\\n[Mount]\\nWhat=192.168.247.16:/'+source+'\\nWhere='+str(target)+'\\nType=nfs4\\nOptions='+options+'\\nTimeoutSec=25\\n\\n[Install]\\nWantedBy=multi-user.target\\n');unit.chmod(0o644);unit_names.append(name)
subprocess.run(['systemctl','daemon-reload'],check=True)
for name in unit_names:subprocess.run(['systemctl','enable','--now',name],check=True,capture_output=True)
results=[]
for source,target,readonly in mounts:
 info=json.loads(subprocess.check_output(['findmnt','--json','-M',str(target),'-o','TARGET,SOURCE,FSTYPE,OPTIONS'],text=True))['filesystems']
 assert len(info)==1
 mounted=info[0];flags=set(mounted['options'].split(','))
 assert mounted['source']=='192.168.247.16:/'+source and mounted['fstype']=='nfs4'
 assert {'vers=4.2','proto=tcp','hard','nosuid','nodev','noexec'}.issubset(flags)
 assert ('ro' if readonly else 'rw') in flags
 denied=False
 try:
  fd=os.open(target/('.rc-root-denied-'+node['name']),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
 except OSError as exc:
  denied=exc.errno in [errno.EACCES,errno.EROFS]
 assert denied,'Root-squash/read-only boundary failed'
 results.append({'source':mounted['source'],'target':str(target),'fstype':mounted['fstype'],'required_mount_flags':True,'root_write_denied':True})
qemu=Path('/etc/libvirt/qemu.conf');original=qemu.read_text();(r/'qemu.conf.vendor').write_text(original);(r/'qemu.conf.vendor').chmod(0o600)
settings=dict(re.findall(r'^\\s*([a-z_]+)\\s*=\\s*([^#\\n]+)',original,re.M))
assert settings.get('user','').strip()=='"oneadmin"' and settings.get('group','').strip()=='"oneadmin"' and settings.get('dynamic_ownership','').strip()=='0'
assert 'migration_address' not in settings
qemu.write_text(original+'\\n# Dedicated candidate-realm migration listener.\\nmigration_address = "'+node['ip']+'"\\n');qemu.chmod(0o644)
subprocess.run(['restorecon',str(qemu)],check=True)
subprocess.run(['setsebool','-P','virt_use_nfs','on'],check=True)
for service in ['opennebula.service','virtqemud.service']:
 d=Path('/etc/systemd/system')/(service+'.d');d.mkdir(exist_ok=True)
 p=d/'10-onedrs-rc-storage.conf';assert not p.exists()
 p.write_text('[Unit]\\nRequiresMountsFor=/var/lib/one/datastores/0 /var/lib/one/datastores/1 /var/lib/one/datastores/2 /var/lib/one/onedrs_fences\\n'+('After=mariadb.service\\nRequires=mariadb.service\\n' if service=='opennebula.service' else ''));p.chmod(0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','virtqemud.socket'],check=True,capture_output=True)
listing=subprocess.check_output(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--name'],text=True)
assert not listing.strip(),'Fresh compute must have no nested workload'
proof='''+repr("""from pathlib import Path
import errno,json,os
node=NODE_NAME
for leaf in ['0','1','2']:
 p=Path('/var/lib/one/datastores')/leaf/('.rc-access-'+node)
 with p.open('x') as out:
  out.write('owned-native-nfs42:'+node+'\\n');out.flush();os.fsync(out.fileno())
 assert p.read_text()=='owned-native-nfs42:'+node+'\\n'
p=Path('/var/lib/one/onedrs_fences')/('.rc-denied-'+node)
try:
 with p.open('x') as out:out.write('must not be written')
 raise AssertionError('Fence directory was writable')
except OSError as exc:assert exc.errno in [errno.EACCES,errno.EROFS]
print(json.dumps({'oneadmin_data_writes':3,'oneadmin_fence_write_denied':True}))
""")+'''
p=subprocess.run(['sudo','-n','-u','oneadmin','python3','-c','NODE_NAME='+repr(node['name'])+'\\n'+proof],capture_output=True,text=True,check=True)
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
result={'node':node['name'],'status':'PASS','mounts':results,'oneadmin_proof':json.loads(p.stdout),'libvirt_native_identity':True,'nested_domains':0,'virt_use_nfs':True,'qemu_identity':'oneadmin:oneadmin','migration_address':node['ip'],'native_service_active':False,'selinux':'Enforcing'}
assert subprocess.run(['systemctl','is-active','--quiet','opennebula.service']).returncode!=0
(r/'compute-storage-result.json').write_text(json.dumps(result,indent=2)+'\\n');print(json.dumps(result))
'''
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def one(node):
 if shutil.disk_usage(R).free<15*1024**3:raise RuntimeError('Host free-space guard')
 program='NODE='+repr(json.dumps(node))+'\n'+remote
 args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),'haqa@'+node['ip'],'sudo -n python3 -c '+shlex.quote(program)]
 log=R/(node['name']+'-compute-storage-r1.log');started=now()
 with log.open('x') as out:
  log.chmod(0o600);p=subprocess.run(args,stdout=out,stderr=subprocess.STDOUT,timeout=150)
 return {'node':node['name'],'started':started,'ended':now(),'exit':p.returncode,'log':str(log),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
result={'started':now(),'scope':'FRESH_FIVE_NODE_NFS42_MOUNTS_AND_NATIVE_COMPUTE_IDENTITY'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result['nodes']=list(pool.map(one,nodes))
result.update(status='PASS' if all(x['exit']==0 for x in result['nodes']) else 'FAIL',ended=now(),free_host_bytes=shutil.disk_usage(R).free)
p=R/'compute-storage-r1-result.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600);print(json.dumps(result))
raise SystemExit(result['status']!='PASS')
