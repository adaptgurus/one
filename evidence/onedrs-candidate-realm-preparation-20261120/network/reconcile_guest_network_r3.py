#!/usr/bin/python3
"""Explicit one-time reconciliation of completed rc01 creation after readback schema failure."""
from pathlib import Path
import datetime,hashlib,json,os,shlex,shutil,subprocess
R=Path('/root/ls-onedrs-rc-20261120')
OUT=R/'guest-network-first-r3.json'
assert not OUT.exists() and shutil.disk_usage(R).free>15*1024**3
node=json.loads((R/'provisioning.json').read_text())['members'][0]
before=next(x for x in json.loads((R/'guest-network-preflight-r1.json').read_text())['results'] if x['node']==node['name'])
source=(R/'guest_network_node_r3.py').read_text()
oldsha=hashlib.sha256((R/'guest_network_node_r2.py').read_bytes()).hexdigest()
REMOTE=r"""
from pathlib import Path
import datetime,hashlib,json,os,subprocess
def run(a):
 p=subprocess.run(a,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=40)
 if p.returncode:raise RuntimeError(str(a)+': '+(p.stdout+p.stderr)[-1600:])
 return p.stdout.strip()
assert os.geteuid()==0 and run(['hostname'])==NODE['name']+'.candidate-lab.internal'
assert Path('/sys/class/dmi/id/product_uuid').read_text().strip().lower()==NODE['uuid']
assert run(['getenforce'])=='Enforcing'
assert run(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--uuid'])==''
target=Path('/usr/local/libexec/ls-onedrs-rc-guest-network-20261120')
assert not target.is_symlink() and target.stat().st_uid==0 and target.stat().st_mode&0o777==0o755
assert hashlib.sha256(target.read_bytes()).hexdigest()==OLD_SHA
ns={'__name__':'qualification_reconcile'}
exec(compile(SOURCE,str(target),'exec'),ns)
state=ns['STATE']
assert not state.is_symlink() and state.stat().st_uid==0 and state.stat().st_mode&0o777==0o700
marker_path=state/'ownership.json'
assert not marker_path.is_symlink() and marker_path.stat().st_uid==0 and marker_path.stat().st_mode&0o777==0o600
marker=json.loads(marker_path.read_text())
assert marker=={'realm':'ls-onedrs-rc-20261120','uuid':NODE['uuid'],'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'phase':'CREATING'}
links=json.loads(run(['ip','-json','-details','link','show']))
assert {x['ifname']:x['ifindex'] for x in links if x['ifname'] in [ns['BR'],ns['VX']]}=={'br-rc-guest':3,'vxrc24720':4}
result=ns['verify'](links,ns['MEMBERS'][0],'52:54:00:dc:27:11','52:54:00:dd:27:11',[n[1] for n in ns['MEMBERS'][1:]])
def custody():
 addr=json.loads(run(['ip','-json','address','show','dev','eth0']))
 routes=json.loads(run(['ip','-json','-4','route','show']))
 assert addr==BEFORE['eth0_addresses']
 assert [r for r in routes if r.get('dst')!='10.247.20.0/24']==BEFORE['routes']
 uuid=run(['nmcli','-g','GENERAL.CON-UUID','device','show','eth0'])
 args=['nmcli','-g','connection.uuid,connection.interface-name,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.routes','connection','show',uuid]
 assert hashlib.sha256(run(args).encode()).hexdigest()==BEFORE['management_profile_sha256']
 mounts=json.loads(run(['findmnt','--json','-t','nfs4','-o','TARGET,SOURCE,FSTYPE,OPTIONS']))['filesystems']
 assert mounts==BEFORE['nfs_mounts']
 return {'eth0_addresses':addr,'routes':routes,'management_profile_sha256':BEFORE['management_profile_sha256'],'nfs_unchanged':True}
prior={'firewall':run(['systemctl','show','firewalld','-p','ActiveState','-p','SubState']),'old_rollback':run(['systemctl','show','ls-onedrs-rc-firewall-rollback-20261120.timer','-p','ActiveState']),'network':run(['systemctl','show','ls-onedrs-rc-guest-network-20261120.service','-p','ActiveState','-p','Result'])}
custody()
temp=target.with_name(target.name+'.r3-new')
fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o755)
with os.fdopen(fd,'w') as f:f.write(SOURCE);f.flush();os.fsync(f.fileno())
os.replace(temp,target);run(['restorecon','-F',str(target)])
marker['phase']='READY';marker['ifindices']={'br-rc-guest':3,'vxrc24720':4};ns['save'](marker)
run(['systemd-run','--unit=ls-onedrs-rc-firewall-rollback-r3-20261120','--on-active=90s','/usr/bin/systemctl','stop','firewalld'])
run(['systemctl','start','firewalld'])
run(['firewall-cmd','--zone=onedrs-rc','--change-interface=eth0'])
run(['systemctl','start','ls-onedrs-rc-guest-network-20261120.service'])
assert run(['systemctl','is-active','firewalld'])=='active'
assert run(['systemctl','is-active','ls-onedrs-rc-guest-network-20261120.service'])=='active'
assert run(['firewall-cmd','--get-zone-of-interface=br-rc-guest'])=='onedrs-rc-guest'
receipt={'status':'CONFIGURED_AWAITING_INDEPENDENT_SSH','node':NODE['name'],'previous_state':prior,'ownership':marker,'network':result,'files_sha256':{str(target):hashlib.sha256(target.read_bytes()).hexdigest()},'selinux':run(['getenforce']),**custody()}
print(json.dumps(receipt))
"""
def ssh(command,timeout=140):
 return subprocess.run(['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),'haqa@'+node['ip'],command],capture_output=True,text=True,timeout=timeout)
prefix='NODE='+repr(node)+'\nBEFORE='+repr(before)+'\nSOURCE='+repr(source)+'\nOLD_SHA='+repr(oldsha)+'\n'
p=ssh('sudo -n python3 -c '+shlex.quote(prefix+REMOTE))
(R/'ls-onedrs-rc-01-guest-network-r3-reconcile.log').write_text(p.stdout+p.stderr)
if p.returncode:
 receipt={'status':'FAIL','error':p.stderr[-1800:],'node':node['name'],'automatic_retry':False}
else:
 receipt=json.loads(p.stdout)
 ack_code="""import json,subprocess
assert subprocess.check_output(['hostname'],text=True).strip()=='ls-onedrs-rc-01.candidate-lab.internal'
assert subprocess.check_output(['systemctl','is-active','firewalld'],text=True).strip()=='active'
assert subprocess.check_output(['systemctl','is-active','ls-onedrs-rc-guest-network-20261120.service'],text=True).strip()=='active'
subprocess.run(['systemctl','stop','ls-onedrs-rc-firewall-rollback-r3-20261120.timer'],check=True)
print(json.dumps({'status':'PASS','independent_ssh':True,'rollback_canceled_after_readback':True}))
"""
 ack=ssh('sudo -n python3 -c '+shlex.quote(ack_code),25)
 if ack.returncode:receipt.update(status='FAIL',error='Independent SSH or rollback cancellation failed',detail=ack.stderr[-1000:])
 else:receipt.update(json.loads(ack.stdout))
result={'status':receipt['status'],'scope':'OWNED_FRESH_BRIDGE_VXLAN_ONLY_NO_NATIVE_GUEST_ACCEPTANCE','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':[receipt],'free_host_bytes':shutil.disk_usage(R).free,'reconciliation':'Original R2 links retained; exact UUID, boot, aliases, attributes, ifindices, management and NFS verified before CREATING -> READY. Initial verifier used wrong iproute2 JSON keys; prior failure evidence retained.'}
OUT.write_text(json.dumps(result,indent=2)+'\n');OUT.chmod(0o600)
print(json.dumps({'status':result['status'],'node':node['name'],'error':receipt.get('error'),'free_host_bytes':result['free_host_bytes']}))
