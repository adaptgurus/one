#!/usr/bin/python3
"""Read-only host network and storage qualification; no guest/native acceptance implied."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,shlex,shutil,subprocess
import xml.etree.ElementTree as ET
R=Path('/root/ls-onedrs-rc-20261120');OUT=R/'guest-network-qualification-r3.json'
assert not OUT.exists() and shutil.disk_usage(R).free>15*1024**3
nodes=json.loads((R/'provisioning.json').read_text())['members']
pre=json.loads((R/'guest-network-preflight-r1.json').read_text())
for name in ['guest-network-first-r3.json','guest-network-followers-r3.json']:
 assert json.loads((R/name).read_text())['status']=='PASS'
def remote(ip,program,timeout=80,principal='root',trust=R,known_hosts=None):
 args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known_hosts or trust/'known_hosts'),'-o','ConnectTimeout=8','-i',str(trust/'lab_ed25519'),'haqa@'+ip,'sudo -n -u '+shlex.quote(principal)+' python3 -c '+shlex.quote(program)]
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError(ip+': '+p.stderr[-1800:])
 return json.loads(p.stdout)
CODE=r"""
from pathlib import Path
import hashlib,json,os,socket,subprocess
def run(a,timeout=12):
 p=subprocess.run(a,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError(str(a)+': '+(p.stdout+p.stderr)[-1200:])
 return p.stdout.strip()
assert run(['hostname'])==NODE['name']+'.candidate-lab.internal'
assert Path('/sys/class/dmi/id/product_uuid').read_text().strip().lower()==NODE['uuid']
assert run(['getenforce'])=='Enforcing'
assert run(['systemctl','is-active','firewalld'])=='active'
assert run(['systemctl','is-active','ls-onedrs-rc-guest-network-20261120.service'])=='active'
assert run(['firewall-cmd','--get-zone-of-interface=eth0'])=='onedrs-rc'
assert run(['firewall-cmd','--get-zone-of-interface=br-rc-guest'])=='onedrs-rc-guest'
network=json.loads(run(['python3','-I','/usr/local/libexec/ls-onedrs-rc-guest-network-20261120',str(INDEX)]))
addr=json.loads(run(['ip','-json','address','show','dev','eth0']))
routes=json.loads(run(['ip','-json','-4','route','show']))
assert addr==BEFORE['eth0_addresses']
assert [r for r in routes if r.get('dst')!='10.247.20.0/24']==BEFORE['routes']
uuid=run(['nmcli','-g','GENERAL.CON-UUID','device','show','eth0'])
args=['nmcli','-g','connection.uuid,connection.interface-name,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.routes','connection','show',uuid]
assert hashlib.sha256(run(args).encode()).hexdigest()==BEFORE['management_profile_sha256']
mounts=json.loads(run(['findmnt','--json','-t','nfs4','-o','TARGET,SOURCE,FSTYPE,OPTIONS']))['filesystems']
assert mounts==BEFORE['nfs_mounts']
assert run(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--uuid'])==''
source='10.247.20.'+NODE['ip'].rsplit('.',1)[1]
pings=[];ssh=[];denials=[]
for peer in NODES:
 dst='10.247.20.'+peer['ip'].rsplit('.',1)[1]
 raw=run(['ping','-n','-I',source,'-M','do','-s','1422','-c','1','-W','2',dst])
 pings.append({'destination':dst,'payload_bytes':1422,'dont_fragment':True,'self':peer['name']==NODE['name'],'success':True,'raw':raw})
 cmd=['sudo','-n','-u','oneadmin','ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/var/lib/one/.ssh/known_hosts','-o','GlobalKnownHostsFile=/dev/null','-o','ControlMaster=no','-o','ControlPath=none','-o','ConnectTimeout=4','-i','/var/lib/one/.ssh/id_ed25519_onedrs_rc','oneadmin@'+peer['ip'],'id -u; hostname']
 identity=run(cmd)
 assert identity.splitlines()==['9869',peer['name']+'.candidate-lab.internal'],repr(identity)
 ssh.append({'destination':peer['ip'],'uid':9869,'hostname':peer['name']+'.candidate-lab.internal','pinned':True})
 if peer['name']!=NODE['name']:
  s=socket.socket();s.settimeout(1);s.bind((source,0))
  try:
   s.connect((dst,22))
  except (TimeoutError,ConnectionError,OSError):denials.append({'source':source,'destination':dst,'port':22,'denied':True})
  else:raise AssertionError('Guest bridge host SSH unexpectedly accepted')
  finally:s.close()
print(json.dumps({'status':'PASS','node':NODE['name'],'uuid':NODE['uuid'],'network':network['network'],'ownership':json.loads(Path('/var/lib/ls-onedrs-rc-guest-network-20261120/ownership.json').read_text()),'mtu_pings':pings,'native_ssh':ssh,'guest_host_ssh_denials':denials,'eth0_profile_routes_unchanged':True,'nfs_mounts_unchanged':True,'selinux':'Enforcing','native_guest_count':0}))
"""
def check(item):
 i,n=item;b=next(x for x in pre['results'] if x['node']==n['name'])
 try:return remote(n['ip'],'NODE='+repr(n)+'\nNODES='+repr(nodes)+'\nBEFORE='+repr(b)+'\nINDEX='+str(i)+'\n'+CODE)
 except Exception as e:return {'status':'FAIL','node':n['name'],'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(check,enumerate(nodes)))
result={'status':'PASS' if all(x['status']=='PASS' for x in results) else 'FAIL','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'OWNED_HOST_BRIDGE_VXLAN_MTU_SSH_STORAGE_CUSTODY_ONLY_NO_NATIVE_GUEST_OR_FAULT_ACCEPTANCE','nodes':results}
if result['status']=='PASS':
 deny=r"""import json,socket
out=[]
for ip in IPS:
 s=socket.socket();s.settimeout(1);s.bind(('192.168.247.16',0))
 try:s.connect((ip,22))
 except (TimeoutError,ConnectionError,OSError):out.append({'source':'192.168.247.16','destination':ip,'port':22,'denied':True})
 else:raise AssertionError('Unallowlisted storage VM SSH accepted')
 finally:s.close()
print(json.dumps(out))"""
 result['storage_to_compute_ssh_denials']=remote('192.168.247.16','IPS='+repr([n['ip'] for n in nodes])+'\n'+deny)
 # Reuse the exact prior read-only custody/storage checks, writing a distinct retained receipt.
 prior=(R/'verify_realm_storage_r3.py').read_text()
 prior=prior.replace("p=R/'storage-qualification-r3.json'","p=R/'storage-network-custody-r4.json'")
 p=subprocess.run(['python3','-c',prior],capture_output=True,text=True,timeout=80)
 (R/'storage-network-custody-r4.log').write_text(p.stdout+p.stderr)
 assert p.returncode==0,p.stderr[-1500:]
 result['storage_custody_receipt']='storage-network-custody-r4.json'
 result['full_mesh_mtu_pings']=sum(not p['self'] for x in results for p in x['mtu_pings'])
 result['self_pings']=sum(p['self'] for x in results for p in x['mtu_pings'])
 result['native_pinned_ssh_connections']=sum(len(x['native_ssh']) for x in results)
 result['guest_host_ssh_denials']=sum(len(x['guest_host_ssh_denials']) for x in results)
result['free_host_bytes']=shutil.disk_usage(R).free;assert result['free_host_bytes']>15*1024**3
OUT.write_text(json.dumps(result,indent=2)+'\n');OUT.chmod(0o600)
print(json.dumps({k:v for k,v in result.items() if k!='nodes'}))
if result['status']!='PASS':print(json.dumps([{'node':x['node'],'error':x.get('error')} for x in results]))
