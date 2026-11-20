#!/usr/bin/python3
"""Owned five-node bridge/VXLAN preparation with independent firewall handoff."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,shlex,shutil,subprocess,sys
R=Path('/root/ls-onedrs-rc-20261120')
nodes=json.loads((R/'provisioning.json').read_text())['members']
pre=json.loads((R/'guest-network-preflight-r1.json').read_text());assert pre['status']=='PASS'
source=(R/'guest_network_node_r3.py').read_text()
zone=(R/'bootstrap-proposal/onedrs-rc-zone.xml').read_text().replace('</zone>','')
for ip in [n['ip'] for n in nodes]:
 zone+='  <rule family="ipv4"><source address="'+ip+'/32"/><port port="4789" protocol="udp"/><accept/></rule>\n'
for ip in ['192.168.247.1']+[n['ip'] for n in nodes]:
 zone+='  <rule family="ipv4"><source address="'+ip+'/32"/><icmp-type name="echo-request"/><accept/></rule>\n'
zone+='</zone>\n'
guest_zone='<?xml version="1.0" encoding="utf-8"?>\n<zone target="DROP">\n <interface name="br-rc-guest"/>\n <forward/>\n'
for ip in ['10.247.20.'+str(i) for i in [11,12,13,14,15,101,102]]:
 guest_zone+=' <rule family="ipv4"><source address="'+ip+'/32"/><icmp-type name="echo-request"/><accept/></rule>\n'
guest_zone+='</zone>\n'
nm='[device-ls-onedrs-rc-bridge]\nmatch-device=interface-name:br-rc-guest\nmanaged=0\n\n[device-ls-onedrs-rc-vxlan]\nmatch-device=interface-name:vxrc24720\nmanaged=0\n'
unit="""[Unit]
Description=Owned OneDRS RC isolated guest bridge and VXLAN
After=network-online.target firewalld.service
Wants=network-online.target
Requires=firewalld.service
Before=virtqemud.service opennebula.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/python3 -I /usr/local/libexec/ls-onedrs-rc-guest-network-20261120 @INDEX@
TimeoutStartSec=25
Restart=no
User=root
Group=root
UMask=0077
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_NET_ADMIN
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictNamespaces=yes
RestrictAddressFamilies=AF_UNIX AF_NETLINK AF_INET AF_INET6
ReadWritePaths=/var/lib/ls-onedrs-rc-guest-network-20261120
MemoryMax=96M
TasksMax=32
[Install]
WantedBy=multi-user.target
"""
REMOTE="""from pathlib import Path
import hashlib,json,os,subprocess
def run(args,timeout=45):
 p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Command failed '+args[0]+': '+(p.stderr+p.stdout)[-1200:])
 return p.stdout.strip()
assert os.geteuid()==0 and run(['hostname'])==NODE['name']+'.candidate-lab.internal'
assert Path('/sys/class/dmi/id/product_uuid').read_text().strip().lower()==NODE['uuid']
assert run(['getenforce'])=='Enforcing'
assert run(['sudo','-n','-u','oneadmin','virsh','-c','qemu:///system','list','--all','--uuid'])==''
links=json.loads(run(['ip','-json','link','show']));assert not any(x['ifname'] in ['br-rc-guest','vxrc24720'] for x in links)
before_addr=json.loads(run(['ip','-json','address','show','dev','eth0']))
before_routes=json.loads(run(['ip','-json','-4','route','show']))
assert before_addr==BEFORE['eth0_addresses'] and before_routes==BEFORE['routes']
uuid=run(['nmcli','-g','GENERAL.CON-UUID','device','show','eth0'])
profile_args=['nmcli','-g','connection.uuid,connection.interface-name,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.routes','connection','show',uuid]
assert hashlib.sha256(run(profile_args).encode()).hexdigest()==BEFORE['management_profile_sha256']
assert subprocess.run(['systemctl','is-active','firewalld'],capture_output=True,text=True).stdout.strip()=='inactive'
if subprocess.run(['rpm','-q','firewalld'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 run(['dnf','-y','--setopt=keepcache=False','install','firewalld'],timeout=120)
files={
 '/usr/local/libexec/ls-onedrs-rc-guest-network-20261120':(SOURCE,0o755),
 '/etc/NetworkManager/conf.d/90-ls-onedrs-rc-guest-20261120.conf':(NM,0o644),
 '/etc/firewalld/zones/onedrs-rc.xml':(ZONE,0o644),
 '/etc/firewalld/zones/onedrs-rc-guest.xml':(GUESTZONE,0o644),
 '/etc/systemd/system/ls-onedrs-rc-guest-network-20261120.service':(UNIT,0o644)}
for name,(body,mode) in files.items():
 p=Path(name);assert not p.exists() and not p.is_symlink(),name
 p.parent.mkdir(parents=True,exist_ok=True)
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
 with os.fdopen(fd,'w') as f:f.write(body)
 p.chmod(mode)
state=Path('/var/lib/ls-onedrs-rc-guest-network-20261120');state.mkdir(mode=0o700)
run(['restorecon','-F']+list(files)+[str(state)])
run(['firewall-offline-cmd','--check-config'])
run(['nmcli','general','reload','conf'])
run(['nmcli','connection','modify',uuid,'connection.zone','onedrs-rc'])
run(['systemctl','daemon-reload'])
run(['systemd-analyze','verify','/etc/systemd/system/ls-onedrs-rc-guest-network-20261120.service'])
run(['systemd-run','--unit=ls-onedrs-rc-firewall-rollback-20261120','--on-active=90s','/usr/bin/systemctl','stop','firewalld'])
run(['systemctl','enable','--now','firewalld'])
run(['firewall-cmd','--zone=onedrs-rc','--change-interface=eth0'])
run(['systemctl','enable','--now','ls-onedrs-rc-guest-network-20261120.service'])
assert run(['firewall-cmd','--get-zone-of-interface=eth0'])=='onedrs-rc'
assert run(['firewall-cmd','--get-zone-of-interface=br-rc-guest'])=='onedrs-rc-guest'
after_addr=json.loads(run(['ip','-json','address','show','dev','eth0']))
after_routes=json.loads(run(['ip','-json','-4','route','show']))
assert before_addr==after_addr and [r for r in after_routes if r.get('dst')!='10.247.20.0/24']==before_routes
assert hashlib.sha256(run(profile_args).encode()).hexdigest()==BEFORE['management_profile_sha256']
mounts=json.loads(run(['findmnt','--json','-t','nfs4','-o','TARGET,SOURCE,FSTYPE,OPTIONS']))['filesystems']
assert mounts==BEFORE['nfs_mounts']
assert run(['getenforce'])=='Enforcing'
print(json.dumps({'status':'CONFIGURED_AWAITING_INDEPENDENT_SSH','node':NODE['name'],'routes':after_routes,'eth0_addresses':after_addr,'management_profile_sha256':BEFORE['management_profile_sha256'],'nfs_unchanged':True,'firewall_active':run(['systemctl','is-active','firewalld']),'network_unit':run(['systemctl','is-active','ls-onedrs-rc-guest-network-20261120.service']),'ownership':json.loads((state/'ownership.json').read_text()),'files_sha256':{name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in files},'selinux':'Enforcing'}))
"""
def ssh(n,command,timeout=200):
 args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),'haqa@'+n['ip'],command]
 return subprocess.run(args,capture_output=True,text=True,timeout=timeout)
def prepare(index):
 assert shutil.disk_usage(R).free>15*1024**3
 node=nodes[index];before=next(x for x in pre['results'] if x['node']==node['name'])
 prefix='NODE='+repr(node)+'\nBEFORE='+repr(before)+'\nSOURCE='+repr(source)+'\nNM='+repr(nm)+'\nZONE='+repr(zone)+'\nGUESTZONE='+repr(guest_zone)+'\nUNIT='+repr(unit.replace('@INDEX@',str(index)))+'\n'
 p=ssh(node,'sudo -n python3 -c '+shlex.quote(prefix+REMOTE))
 (R/(node['name']+'-guest-network-r3.log')).write_text(p.stdout+p.stderr)
 if p.returncode:return {'status':'FAIL','node':node['name'],'error':p.stderr[-1500:],'firewall_rollback':'Timer is conditional on passing configuration validation; inspect actual unit state. No automatic retry.'}
 result=json.loads(p.stdout)
 # A new pinned SSH connection must succeed before canceling rollback.
 check="sudo -n python3 -c "+shlex.quote("import subprocess,json;assert subprocess.check_output(['hostname'],text=True).strip()=="+repr(node['name']+'.candidate-lab.internal')+";assert subprocess.check_output(['systemctl','is-active','firewalld'],text=True).strip()=='active';subprocess.run(['systemctl','stop','ls-onedrs-rc-firewall-rollback-20261120.timer'],check=True);print(json.dumps({'status':'PASS','independent_ssh':True,'rollback_canceled_after_readback':True}))")
 ack=ssh(node,check,timeout=25)
 if ack.returncode:return dict(result,status='FAIL',error='Independent SSH/rollback cancellation refused')
 result.update(json.loads(ack.stdout));return result
selection=[int(x) for x in sys.argv[1:]]
assert selection and len(set(selection))==len(selection) and all(i in range(5) for i in selection)
if selection!=[0]:assert json.loads((R/'guest-network-first-r3.json').read_text())['status']=='PASS'
with concurrent.futures.ThreadPoolExecutor(max_workers=len(selection)) as pool:results=list(pool.map(prepare,selection))
name='guest-network-first-r3.json' if selection==[0] else 'guest-network-followers-r3.json'
receipt={'status':'PASS' if all(x['status']=='PASS' for x in results) else 'FAIL','scope':'OWNED_FRESH_BRIDGE_VXLAN_ONLY_NO_NATIVE_GUEST_ACCEPTANCE','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'free_host_bytes':shutil.disk_usage(R).free}
p=R/name;assert not p.exists();p.write_text(json.dumps(receipt,indent=2)+'\n');p.chmod(0o600)
print(json.dumps({'status':receipt['status'],'results':[{'node':x['node'],'status':x['status'],'error':x.get('error')} for x in results],'free_host_bytes':receipt['free_host_bytes']}))
