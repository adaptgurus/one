#!/usr/bin/python3
from pathlib import Path
import datetime,hashlib,json,os,shlex,shutil,subprocess,time
R=Path('/root/ls-onedrs-rc-20261120');m=json.loads((R/'storage-provisioning.json').read_text())
assert (m['name'],m['ip'],m['mac'])==('ls-onedrs-rc-storage','192.168.247.16','52:54:00:da:27:16')
assert shutil.disk_usage(R).free>15*1024**3
args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=5','-i',str(R/'lab_ed25519'),'haqa@'+m['ip']]
for attempt in range(30):
 p=subprocess.run(args+['true'],capture_output=True,text=True,timeout=9)
 if p.returncode==0:break
 time.sleep(2)
else:raise SystemExit('Storage SSH readiness deadline; no host-key weakening')
remote='''from pathlib import Path
import grp,json,os,pwd,re,subprocess
r=Path('/root/ls-onedrs-rc-20261120');r.mkdir(mode=0o700)
assert subprocess.check_output(['hostname','-s'],text=True).strip()=='ls-onedrs-rc-storage'
subprocess.run(['cloud-init','status','--wait'],check=True)
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
subprocess.run(['dnf','-y','--setopt=install_weak_deps=False','--setopt=keepcache=True','install','nfs-utils','policycoreutils-python-utils','firewalld'],check=True)
assert not Path('/etc/exports').read_text().strip()
assert not any(Path('/etc/exports.d').glob('*'))
try:grp.getgrgid(9869);raise RuntimeError('Unexpected preexisting group9869')
except KeyError:pass
try:pwd.getpwuid(9869);raise RuntimeError('Unexpected preexisting uid9869')
except KeyError:pass
subprocess.run(['groupadd','--gid','9869','oneadmin'],check=True)
subprocess.run(['useradd','--uid','9869','--gid','9869','--system','--no-create-home','--home-dir','/var/lib/one','--shell','/sbin/nologin','oneadmin'],check=True)
root=Path('/srv/onedrs-rc');root.mkdir(mode=0o755)
for name in ['system','images','files','fences']:
 p=root/name;p.mkdir(mode=0o555 if name=='fences' else 0o750)
 if name!='fences':os.chown(p,9869,9869)
subprocess.run(['semanage','fcontext','-a','-t','public_content_rw_t','/srv/onedrs-rc(/.*)?'],check=True)
subprocess.run(['restorecon','-RF',str(root)],check=True)
subprocess.run(['setsebool','-P','nfs_export_all_rw','on'],check=True)
conf=Path('/etc/nfs.conf.d/onedrs-rc.conf');conf.parent.mkdir(exist_ok=True)
conf.write_text('[nfsd]\\nhost=192.168.247.16\\nvers3=n\\nvers4=y\\nvers4.0=n\\nvers4.1=n\\nvers4.2=y\\ntcp=y\\nudp=n\\n');conf.chmod(0o644)
assert subprocess.check_output(['nfsconf','--get','nfsd','vers3'],text=True).strip()=='n'
assert subprocess.check_output(['nfsconf','--get','nfsd','vers4.2'],text=True).strip()=='y'
ips=[f'192.168.247.{i}' for i in range(11,16)]
lines=[]
for name,fsid,mode in [('',0,'ro'),('system',124701,'rw'),('images',124702,'rw'),('files',124703,'rw'),('fences',124704,'ro')]:
 path=str(root/name)
 lines.append(path+' '+ ' '.join(ip+'('+mode+',sync,root_squash,no_subtree_check,secure,sec=sys,fsid='+str(fsid)+')' for ip in ips))
exports=Path('/etc/exports.d/onedrs-rc.exports');exports.write_text('\\n'.join(lines)+'\\n');exports.chmod(0o644)
subprocess.run(['systemctl','enable','--now','firewalld'],check=True)
firewall=['firewall-cmd','--permanent','--zone=onedrs-rc']
subprocess.run(['firewall-cmd','--permanent','--new-zone=onedrs-rc'],check=True)
subprocess.run(firewall+['--set-target=DROP'],check=True)
subprocess.run(firewall+['--add-rich-rule=rule family="ipv4" source address="192.168.247.1/32" port port="22" protocol="tcp" accept'],check=True)
for ip in ips:
 subprocess.run(firewall+['--add-rich-rule=rule family="ipv4" source address="'+ip+'/32" port port="2049" protocol="tcp" accept'],check=True)
for ip in ['192.168.247.1',*ips]:
 subprocess.run(firewall+['--add-rich-rule=rule family="ipv4" source address="'+ip+'/32" icmp-type name="echo-request" accept'],check=True)
subprocess.run(['firewall-cmd','--reload'],check=True)
connection=subprocess.check_output(['nmcli','-g','GENERAL.CONNECTION','device','show','eth0'],text=True).strip();assert connection
subprocess.run(['nmcli','connection','modify',connection,'connection.zone','onedrs-rc'],check=True)
subprocess.run(['firewall-cmd','--zone=onedrs-rc','--change-interface=eth0'],check=True)
assert subprocess.check_output(['firewall-cmd','--get-zone-of-interface','eth0'],text=True).strip()=='onedrs-rc'
subprocess.run(['systemctl','enable','--now','nfs-server'],check=True)
versions=Path('/proc/fs/nfsd/versions').read_text().strip();assert '-3' in versions.split() and '+4.2' in versions.split()
effective=subprocess.check_output(['exportfs','-s'],text=True)
entries=re.findall(r'(/srv/onedrs-rc(?:/[a-z]+)?)\\s+(192\\.168\\.247\\.\\d+)\\(([^)]+)\\)',effective)
assert len(entries)==25,len(entries)
for path,ip,options in entries:
 assert ip in ips and {'sync','root_squash','secure','no_subtree_check','sec=sys'}.issubset(set(options.split(',')))
 assert ('ro' if path in [str(root),str(root/'fences')] else 'rw') in options.split(',')
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
result={'status':'PASS','nfs_versions':versions,'export_clients':ips,'effective_exports':effective,'root_squash':True,'fences_root_owned_read_only':(root/'fences').stat().st_uid==0,'selinux':'Enforcing','firewall_zone':'onedrs-rc','native_software_or_secrets_in_exports':False,'server_is_outside_five_voter_fault_set':True,'scope':'DISPOSABLE_NFS42_SOFTWARE_STORAGE_DOMAIN_NOT_PHYSICAL_INDEPENDENCE'}
(r/'storage-config-result.json').write_text(json.dumps(result,indent=2)+'\\n');print(json.dumps(result))
'''
log=R/'storage-configure-r1.log';started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with log.open('x') as out:
 log.chmod(0o600);p=subprocess.run(args+['sudo -n python3 -c '+shlex.quote(remote)],stdout=out,stderr=subprocess.STDOUT,timeout=900)
allocated=Path(m['disk']).stat().st_blocks*512
result={'status':'PASS' if p.returncode==0 and allocated<=2*1024**3 else 'FAIL','exit':p.returncode,'started':started,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'disk_allocated_bytes':allocated,'pre_payload_budget_bytes':2*1024**3,'free_host_bytes':shutil.disk_usage(R).free,'log':str(log),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
(R/'storage-configure-r1-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
raise SystemExit(result['status']!='PASS')
