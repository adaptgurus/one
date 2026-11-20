#!/usr/bin/env python3
"""Install signed distribution prerequisites only inside the owned fresh realm."""
import concurrent.futures,datetime,json,pathlib,shutil,subprocess,hashlib
D=pathlib.Path('/root/ls-onedrs-rc-20261120')
MEMBERS=json.loads((D/'provisioning.json').read_text())['members']
REMOTE=r'''set -eu
sudo test -c /dev/kvm
sudo test "$(cat /sys/class/dmi/id/product_uuid | tr 'A-F' 'a-f')" = EXPECTED_UUID
sudo python3 - <<'PY'
import configparser,pathlib,json
c=configparser.ConfigParser(interpolation=None)
c.read('/etc/dnf/dnf.conf')
assert c.getboolean('main','gpgcheck',fallback=True)
repos=[]
for p in pathlib.Path('/etc/yum.repos.d').glob('*.repo'):
 r=configparser.ConfigParser(interpolation=None);r.read(p)
 for section in r.sections():
  assert r.getboolean(section,'gpgcheck',fallback=True), 'Package signatures disabled in '+section
  assert r.getboolean(section,'sslverify',fallback=True), 'TLS verification disabled in '+section
  repos.append(section)
print(json.dumps({'package_verification':'enabled','repository_ids':repos}))
PY
sudo dnf -y --setopt=install_weak_deps=False install epel-release dnf-plugins-core
sudo dnf config-manager --set-enabled crb
sudo dnf -y --disablerepo=epel-cisco-openh264 --setopt=install_weak_deps=False install mariadb-server mariadb-server-galera galera libvirt-daemon-kvm qemu-kvm nfs-utils python3 openssh-clients rsync jq
rpm -q mariadb-server mariadb-server-galera galera libvirt-daemon-kvm qemu-kvm nfs-utils
getenforce
'''

def run(n):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 if shutil.disk_usage('/').free<15*1024**3:return {'name':n['name'],'state':'HEADROOM_REFUSED'}
 a=['ssh','-i',str(D/'lab_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(D/'known_hosts'),'-o','ConnectTimeout=5','haqa@'+n['ip'],'bash','-s']
 log=D/(n['name']+'-baseline-install.log')
 with log.open('w') as f:
  q=subprocess.run(a,input=REMOTE.replace('EXPECTED_UUID',n['uuid']),text=True,stdout=f,stderr=subprocess.STDOUT,timeout=1800)
 return {'name':n['name'],'started_utc':start,'ended_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':q.returncode,'log':str(log),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}

if __name__=='__main__':
 result={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Signed distribution dependencies in fresh candidate VMs only; no native candidate install','state':'RUNNING'}
 out=D/'baseline-install-result.json'
 assert not out.exists(),'Do not replay installation without reviewing the first result'
 out.write_text(json.dumps(result,indent=2)+'\n')
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  checks=list(ex.map(run,MEMBERS))
 result.update({'state':'PASS' if all(x.get('exit')==0 for x in checks) else 'FAILED','checks':checks,'ended_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'free_host_bytes':shutil.disk_usage('/').free})
 out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
