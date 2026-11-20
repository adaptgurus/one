#!/usr/bin/python3
"""Verify/install signed vendor dependencies only in the fresh five-node realm."""
from pathlib import Path
import concurrent.futures, datetime, hashlib, json, os, shlex, shutil, subprocess, sys
R=Path('/root/ls-onedrs-rc-20261120')
NODES=json.loads((R/'provisioning.json').read_text())['members']
ALLOWED={f'192.168.247.{i}' for i in range(11,16)}
assert len(NODES)==5 and {n['ip'] for n in NODES}==ALLOWED
assert all(n['name']==f'ls-onedrs-rc-{i:02}' for i,n in enumerate(NODES,1))
PHASE=sys.argv[1] if len(sys.argv)>1 else 'query'
assert PHASE in ['query','install']
SELECTED=NODES[:1] if PHASE=='query' else NODES
if shutil.disk_usage(R).free<15*1024**3:raise SystemExit('Host free-space guard')
REMOTE='''from pathlib import Path
import hashlib,json,os,shutil,subprocess,urllib.request,sys
EXPECTED=json.loads(EXPECTED_JSON)
assert os.geteuid()==0
assert subprocess.check_output(['hostname','-s'],text=True).strip()==EXPECTED['name']
addresses=json.loads(subprocess.check_output(['ip','-j','address','show'],text=True))
assert any(a.get('address')==EXPECTED['mac'] and any(x.get('local')==EXPECTED['ip'] for x in a.get('addr_info',[])) for a in addresses)
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
assert shutil.disk_usage('/').free>2*1024**3
r=Path('/root/ls-onedrs-rc-20261120');r.mkdir(mode=0o700,exist_ok=True);os.chmod(r,0o700)
key=r/'opennebula-repo2.key'
with urllib.request.urlopen('https://downloads.opennebula.io/repo/repo2.key',timeout=45) as response:data=response.read(100001)
assert len(data)<100000
assert hashlib.sha256(data).hexdigest()=='614d5c03d905b2b3bb92f196f770e872465a17d27e69df9084df827344174a6f'
key.write_bytes(data);os.chmod(key,0o644)
gnupg=r/'gpg';gnupg.mkdir(mode=0o700,exist_ok=True)
shown=subprocess.check_output(['gpg','--homedir',str(gnupg),'--batch','--show-keys','--with-colons',str(key)],text=True,stderr=subprocess.DEVNULL)
fingerprints=[line.split(':')[9] for line in shown.splitlines() if line.startswith('fpr:')]
assert fingerprints and fingerprints[0]=='0B2D385C7C9304B11A0367B905A05927906DC27C'
public=Path('/etc/pki/rpm-gpg/RPM-GPG-KEY-opennebula2')
if public.exists():assert public.read_bytes()==data
else:public.write_bytes(data);os.chmod(public,0o644)
subprocess.run(['rpm','--import',str(public)],check=True)
repo=Path('/etc/yum.repos.d/onedrs-vendor-741.repo')
content='[onedrs-vendor-741]\\nname=Verified OpenNebula 7.4.1 dependencies\\nbaseurl=https://downloads.opennebula.io/repo/7.4.1/AlmaLinux/$releasever/$basearch\\nenabled=1\\ngpgcheck=1\\nrepo_gpgcheck=1\\nsslverify=1\\ngpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-opennebula2\\n'
if repo.exists():assert repo.read_text()==content
else:repo.write_text(content);os.chmod(repo,0o644)
print(json.dumps({'node':EXPECTED['name'],'vendor_key_sha256':hashlib.sha256(data).hexdigest(),'fingerprint':fingerprints[0],'repo_sha256':hashlib.sha256(content.encode()).hexdigest(),'phase':PHASE}),flush=True)
base=['dnf','-y','--setopt=install_weak_deps=False','--setopt=keepcache=True']
if PHASE=='query':
 subprocess.run(base+['--disablerepo=*','--enablerepo=onedrs-vendor-741','repoquery','--available','--qf','%{name} %{epoch}:%{version}-%{release}.%{arch}','opennebula-common-onecfg','opennebula-migration','opennebula-tools','opennebula-libs','opennebula-rubygems','opennebula-node-kvm'],check=True)
else:
 units=['opennebula.service','opennebula-scheduler.service','opennebula-sunstone.service','opennebula-fireedge.service','opennebula-flow.service','opennebula-gate.service','opennebula-hem.service']
 for unit in units:
  assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
 subprocess.run(['systemctl','mask',*units],check=True)
 vendor=['opennebula-common-onecfg','opennebula-migration','opennebula-tools','opennebula-libs','opennebula-rubygems','opennebula-node-kvm']
 packages=[p+'-7.4.1-1.el9' for p in vendor]+['python3.12','python3.12-pyyaml','augeas-libs','curl','diffutils','file','git','iputils','logrotate','openssh-server','patch','procps','qemu-img','rsync','sqlite','tar','util-linux','wget','xmlrpc-c','xmlrpc-c-c++','xmlrpc-c-client','xmlrpc-c-client++','xorriso','libabsl_synchronization.so.2111.0.0()(64bit)','libgrpc++.so.1.46()(64bit)','libgrpc++_reflection.so.1.46()(64bit)','libgrpc.so.24()(64bit)','libmysqlclient.so.21()(64bit)','libprotobuf.so.25()(64bit)']
 subprocess.run(base+['--exclude=opennebula,opennebula-fireedge,opennebula-flow,opennebula-gate','install',*packages],check=True)
 for package in vendor:
  installed=subprocess.check_output(['rpm','-q','--qf','%{VERSION}-%{RELEASE}',package],text=True)
  assert installed=='7.4.1-1.el9',(package,installed)
 assert subprocess.run(['rpm','-q','opennebula'],stdout=subprocess.DEVNULL).returncode!=0
 for unit in units:assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
 assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
 subprocess.run(['dnf','check'],check=True)
 rpms=sorted(Path('/var/cache/dnf').glob('*/packages/*.rpm'))
 assert rpms,'Signed transaction cache required for signature receipt'
 for package in rpms:subprocess.run(['rpmkeys','--checksig',str(package)],check=True)
 inventory=subprocess.check_output(['rpm','-qa','--qf','%{NAME}|%{EPOCHNUM}:%{VERSION}-%{RELEASE}.%{ARCH}|%{RSAHEADER:pgpsig}\\n'],text=True)
 (r/'installed-dependencies.txt').write_text(inventory)
 print(json.dumps({'vendor_dependencies_installed':vendor,'installed_inventory_sha256':hashlib.sha256(inventory.encode()).hexdigest(),'checked_cached_rpm_signatures':len(rpms),'native_candidate_installed':False,'native_daemons_active':False,'selinux':'Enforcing','guest_free_bytes':shutil.disk_usage('/').free}),flush=True)

'''
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def one(node):
 if shutil.disk_usage(R).free<15*1024**3:raise RuntimeError('Host free-space guard')
 log=R/(node['name']+'-vendor-'+PHASE+'-r1.log')
 if log.exists():raise RuntimeError('Refusing to overwrite evidence '+str(log))
 program='EXPECTED_JSON='+repr(json.dumps(node))+'\nPHASE='+repr(PHASE)+'\n'+REMOTE
 cmd=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-i',str(R/'lab_ed25519'),'haqa@'+node['ip'],'sudo -n python3 -c '+shlex.quote(program)]
 started=now()
 with log.open('x') as out:
  os.chmod(log,0o600);p=subprocess.run(cmd,stdout=out,stderr=subprocess.STDOUT,timeout=1200)
 return {'name':node['name'],'ip':node['ip'],'started':started,'ended':now(),'exit':p.returncode,'log':str(log),'sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
result={'scope':'VERIFIED_VENDOR_DEPENDENCIES_ONLY_NO_CANDIDATE_OR_SOAK','phase':PHASE,'started':now()}
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:result['nodes']=list(pool.map(one,SELECTED))
 result['status']='PASS' if all(n['exit']==0 for n in result['nodes']) else 'FAIL'
finally:
 result['ended']=now();result['free_host_bytes']=shutil.disk_usage(R).free
 p=R/('vendor-'+PHASE+'-r1-result.json')
 with p.open('x') as out:os.chmod(p,0o600);json.dump(result,out,indent=2);out.write('\n')
 print(json.dumps(result),flush=True)
raise SystemExit(result.get('status')!='PASS')
