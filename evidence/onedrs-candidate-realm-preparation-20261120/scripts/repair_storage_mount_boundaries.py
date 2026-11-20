#!/usr/bin/python3
"""Repair only the empty disposable NFS pseudo-root using persistent bind mounts."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,shlex,shutil,subprocess
R=Path('/root/ls-onedrs-rc-20261120');nodes=json.loads((R/'provisioning.json').read_text())['members']
assert shutil.disk_usage(R).free>15*1024**3
assert json.loads((R/'compute-storage-r1-result.json').read_text())['status']=='FAIL'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def execute(ip,label,program):
 args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),'haqa@'+ip,'sudo -n python3 -c '+shlex.quote(program)]
 log=R/(label+'-storage-boundary-r2.log')
 with log.open('x') as out:
  log.chmod(0o600);p=subprocess.run(args,stdout=out,stderr=subprocess.STDOUT,timeout=150)
 result={'ip':ip,'label':label,'exit':p.returncode,'log':str(log),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
 if p.returncode:raise RuntimeError(json.dumps(result))
 return result
unmount='''from pathlib import Path
import subprocess
assert not subprocess.check_output(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--name'],text=True).strip()
subprocess.run(['systemctl','stop','virtqemud.socket','virtqemud.service'],check=True)
paths=['/var/lib/one/datastores/0','/var/lib/one/datastores/1','/var/lib/one/datastores/2','/var/lib/one/onedrs_fences']
for path in paths:
 name=subprocess.check_output(['systemd-escape','--path','--suffix=mount',path],text=True).strip()
 subprocess.run(['systemctl','stop',name],check=True)
 assert subprocess.run(['mountpoint','-q',path]).returncode!=0
print('Stopped only empty fresh compute NFS mounts and QEMU activation.')
'''
server='''from pathlib import Path
import json,os,subprocess
assert subprocess.check_output(['hostname','-s'],text=True).strip()=='ls-onedrs-rc-storage'
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
root=Path('/srv/onedrs-rc');backing=Path('/srv/onedrs-rc-data')
assert not backing.exists()
for name in ['system','images','files','fences']:assert not list((root/name).iterdir())
subprocess.run(['systemctl','stop','nfs-server'],check=True)
backing.mkdir(mode=0o755)
units=[]
for name in ['system','images','files','fences']:
 src=backing/name;dst=root/name;dst.rename(src);dst.mkdir(mode=0o755)
 unit=subprocess.check_output(['systemd-escape','--path','--suffix=mount',str(dst)],text=True).strip();units.append(unit)
 p=Path('/etc/systemd/system')/unit;assert not p.exists()
 p.write_text('[Unit]\\nDescription=OneDRS candidate '+name+' export boundary\\nBefore=nfs-server.service\\n\\n[Mount]\\nWhat='+str(src)+'\\nWhere='+str(dst)+'\\nType=none\\nOptions=bind,nosuid,nodev,noexec'+(',ro' if name=='fences' else ',rw')+'\\n\\n[Install]\\nWantedBy=multi-user.target\\n');p.chmod(0o644)
subprocess.run(['semanage','fcontext','-a','-t','public_content_rw_t','/srv/onedrs-rc-data(/.*)?'],check=True)
subprocess.run(['restorecon','-RF',str(backing),str(root)],check=True)
d=Path('/etc/systemd/system/nfs-server.service.d');d.mkdir(exist_ok=True)
p=d/'10-onedrs-rc-bind-mounts.conf';p.write_text('[Unit]\\nRequiresMountsFor=/srv/onedrs-rc/system /srv/onedrs-rc/images /srv/onedrs-rc/files /srv/onedrs-rc/fences\\n');p.chmod(0o644)
exports=Path('/etc/exports.d/onedrs-rc.exports');old=exports.read_text();lines=old.splitlines();assert lines[0].startswith('/srv/onedrs-rc ')
assert lines[0].count('ro,sync,')==5;lines[0]=lines[0].replace('ro,sync,','ro,sync,crossmnt,')
Path('/root/ls-onedrs-rc-20261120/exports-r1').write_text(old)
exports.write_text('\\n'.join(lines)+'\\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
for unit in units:subprocess.run(['systemctl','enable','--now',unit],check=True,capture_output=True)
subprocess.run(['systemctl','start','nfs-server'],check=True)
assert Path('/proc/fs/nfsd/versions').read_text().strip()=='-3 +4 -4.0 -4.1 +4.2'
proof=[]
for name in ['system','images','files','fences']:
 path=root/name
 result=json.loads(subprocess.check_output(['findmnt','--json','-M',str(path),'-o','TARGET,SOURCE,FSTYPE,OPTIONS'],text=True))['filesystems'];assert len(result)==1
 assert {'nosuid','nodev','noexec'}.issubset(set(result[0]['options'].split(',')))
 assert ('ro' if name=='fences' else 'rw') in result[0]['options'].split(',')
 proof.append(result[0])
print(json.dumps({'status':'PASS','bind_mounts':proof,'exports':subprocess.check_output(['exportfs','-s'],text=True),'selinux':'Enforcing','backing_path':str(backing)}))
'''
remount='''from pathlib import Path
import errno,json,os,subprocess
node=NODE_NAME
mounts=[('system','/var/lib/one/datastores/0',False),('images','/var/lib/one/datastores/1',False),('files','/var/lib/one/datastores/2',False),('fences','/var/lib/one/onedrs_fences',True)]
for source,path,readonly in mounts:
 unit=subprocess.check_output(['systemd-escape','--path','--suffix=mount',path],text=True).strip();subprocess.run(['systemctl','start',unit],check=True)
 info=json.loads(subprocess.check_output(['findmnt','--json','-M',path,'-o','TARGET,SOURCE,FSTYPE,OPTIONS'],text=True))['filesystems'][0]
 flags=set(info['options'].split(','));assert info['source']=='192.168.247.16:/'+source and info['fstype']=='nfs4'
 assert {'vers=4.2','proto=tcp','hard','nosuid','nodev','noexec'}.issubset(flags) and ('ro' if readonly else 'rw') in flags
 try:
  fd=os.open(Path(path)/('.rc-root-denied-'+node),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd);raise AssertionError('Root write unexpectedly allowed')
 except OSError as exc:assert exc.errno in [errno.EACCES,errno.EROFS]
subprocess.run(['systemctl','start','virtqemud.socket'],check=True)
assert not subprocess.check_output(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--name'],text=True).strip()
proof='''+repr("""from pathlib import Path
import errno,json,os
node=NODE_NAME
for leaf in ['0','1','2']:
 p=Path('/var/lib/one/datastores')/leaf/('.rc-access-'+node)
 with p.open('x') as out:
  out.write('owned-native-nfs42:'+node+'\\n');out.flush();os.fsync(out.fileno())
 assert p.read_text()=='owned-native-nfs42:'+node+'\\n'
try:
 with (Path('/var/lib/one/onedrs_fences')/('.rc-denied-'+node)).open('x') as out:out.write('must not be written')
 raise AssertionError('Fence directory unexpectedly writable')
except OSError as exc:assert exc.errno in [errno.EACCES,errno.EROFS]
print(json.dumps({'oneadmin_data_writes':3,'oneadmin_fence_write_denied':True}))
""")+'''
p=subprocess.run(['sudo','-n','-u','oneadmin','python3','-c','NODE_NAME='+repr(node)+'\\n'+proof],capture_output=True,text=True)
if p.returncode:raise RuntimeError(p.stderr)
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
print(json.dumps({'node':node,'status':'PASS','oneadmin_proof':json.loads(p.stdout),'root_write_denied':True,'mounts':'NFSv4.2/TCP/hard/nosuid/nodev/noexec','selinux':'Enforcing','nested_domains':0}))
'''
result={'started':now(),'scope':'OWNED_STORAGE_BIND_BOUNDARIES_AND_FRESH_CLIENT_RETRY','phases':[]}
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result['phases']+=list(pool.map(lambda n:execute(n['ip'],n['name']+'-unmount',unmount),nodes))
 result['phases'].append(execute('192.168.247.16','storage-server',server))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result['phases']+=list(pool.map(lambda n:execute(n['ip'],n['name']+'-remount','NODE_NAME='+repr(n['name'])+'\n'+remount),nodes))
 result['status']='PASS'
except Exception as exc:
 result['status']='FAIL';result['error']=str(exc);raise
finally:
 result['ended']=now();result['free_host_bytes']=shutil.disk_usage(R).free
 p=R/'storage-boundary-r2-result.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600);print(json.dumps(result))
