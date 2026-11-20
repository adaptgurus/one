#!/usr/bin/python3
"""Add one owned storage VM, preserving existing guests/networks/NFS services."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,os,pwd,shutil,subprocess,uuid
import xml.etree.ElementTree as ET
R=Path('/root/ls-onedrs-rc-20261120');IMG=Path('/var/lib/libvirt/images/ls-onedrs-rc-20261120')
BASE=Path('/var/lib/libvirt/images/ls-onedrs-ha-e2e-20261114/rocky9-base.qcow2')
NAME='ls-onedrs-rc-storage';IP='192.168.247.16';MAC='52:54:00:da:27:16';NET='ls-onedrs-rc-20261120';BR='lsdrrc20br0'
EXPECTED='92c206cc6f790c61583247eefe87890f8828420662c17cacf247cec78ab4eec8'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(args,timeout=90):
 p=subprocess.run([str(a) for a in args],capture_output=True,text=True,timeout=timeout,stdin=subprocess.DEVNULL)
 if p.returncode:raise RuntimeError(str(args[0])+' failed: '+p.stderr[-1500:])
 return p.stdout
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def save(name,obj):
 p=R/name;assert not p.exists();p.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n');p.chmod(0o600)
def snapshot():
 def domain(name):
  x=ET.fromstring(run(['virsh','dumpxml',name,'--inactive']));pid=int(Path('/run/libvirt/qemu',name+'.pid').read_text())
  ticks=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[19]
  return name,{'uuid':x.findtext('uuid'),'pid':pid,'start_ticks':ticks,'inactive_xml_sha256':hashlib.sha256(ET.tostring(x)).hexdigest()}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:domains=dict(pool.map(domain,run(['virsh','list','--name']).split()))
 networks={}
 for name in run(['virsh','net-list','--all','--name']).split():
  x=ET.fromstring(run(['virsh','net-dumpxml',name,'--inactive']));x.attrib.pop('connections',None);networks[name]=hashlib.sha256(ET.tostring(x)).hexdigest()
 exports={str(p):sha(p) for p in [Path('/etc/exports'),*sorted(Path('/etc/exports.d').glob('*'))] if p.is_file()}
 return {'at':now(),'domains':domains,'networks':networks,'exports':exports,'nfs_services':run(['systemctl','show','nfs-server','nfs-mountd','rpcbind','-p','Id','-p','MainPID','-p','ExecMainStartTimestampMonotonic','-p','ActiveEnterTimestampMonotonic']),'routes':json.loads(run(['ip','-json','-4','route','show'])),'free_bytes':shutil.disk_usage(R).free}
os.umask(0o077)
assert not (R/NAME).exists() and not (R/'storage-provisioning.json').exists()
assert shutil.disk_usage(R).free>15*1024**3
assert sha(BASE)==EXPECTED
base=json.loads(run(['qemu-img','info','--output=json',BASE]));assert base['format']=='qcow2' and base['virtual-size']==10*1024**3 and not base.get('backing-filename')
existing=run(['virsh','list','--all','--name']).split();assert NAME not in existing
for name in existing:
 x=ET.fromstring(run(['virsh','dumpxml',name,'--inactive']));assert all(m.get('address','').lower()!=MAC for m in x.findall('devices/interface/mac'))
net=ET.fromstring(run(['virsh','net-dumpxml',NET]));assert net.findtext('uuid')=='dac45dfe-107a-4e39-97b5-60802ab29421' and net.find('bridge').get('name')==BR
assert all(h.get('ip')!=IP for h in net.findall('ip/dhcp/host'))
dad=subprocess.run(['arping','-D','-I',BR,'-c','3','-w','4',IP],capture_output=True,text=True,timeout=8)
assert dad.returncode==0,'Storage IP duplicate-address check failed'
before=snapshot();save('storage-before-host.json',before)
d=R/NAME;d.mkdir(mode=0o700);ident=str(uuid.uuid4())
run(['ssh-keygen','-q','-t','ed25519','-N','','-C',NAME,'-f',d/'host_ed25519'])
hostpub=(d/'host_ed25519.pub').read_text().strip();pub=(R/'lab_ed25519.pub').read_text().strip()
private=''.join('    '+line+'\n' for line in (d/'host_ed25519').read_text().splitlines())
userdata=f'''#cloud-config
hostname: {NAME}
fqdn: {NAME}.candidate-lab.internal
manage_etc_hosts: true
disable_root: true
ssh_pwauth: false
users:
  - name: haqa
    gecos: Dedicated OneDRS storage qualification
    shell: /bin/bash
    groups: [wheel]
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: true
    ssh_authorized_keys:
      - {pub}
ssh_keys:
  ed25519_private: |
{private}  ed25519_public: {hostpub}
ssh_publish_hostkeys:
  enabled: false
growpart:
  mode: auto
  devices: ["/"]
resize_rootfs: true
runcmd:
  - [systemctl, enable, --now, sshd]
final_message: "CANDIDATE-STORAGE-READY {NAME}"
'''
(d/'user-data').write_text(userdata);(d/'meta-data').write_text('instance-id: '+ident+'\nlocal-hostname: '+NAME+'\n')
(d/'network-config').write_text(f'''version: 1
config:
  - type: physical
    name: eth0
    mac_address: '{MAC}'
    subnets:
      - type: static
        address: {IP}
        netmask: 255.255.255.0
        gateway: 192.168.247.1
        dns_nameservers: [192.168.14.142]
''')
iso=IMG/(NAME+'-cidata.iso');disk=IMG/(NAME+'.qcow2');assert not iso.exists() and not disk.exists()
run(['genisoimage','-quiet','-output',iso,'-volid','cidata','-joliet','-rock',d/'user-data',d/'meta-data',d/'network-config'])
run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',BASE,disk])
u=pwd.getpwnam('oneadmin')
for path,label in [(disk,'virt_image_t'),(iso,'virt_content_t')]:
 os.chown(path,u.pw_uid,u.pw_gid);path.chmod(0o600);run(['chcon','-t',label,path])
xml=f'''<domain type="kvm"><name>{NAME}</name><uuid>{ident}</uuid>
<memory unit="MiB">2048</memory><vcpu placement="static">1</vcpu>
<os><type arch="x86_64">hvm</type><boot dev="hd"/></os><features><acpi/><apic/></features>
<cpu mode="host-passthrough" check="none"/><clock offset="utc"/>
<on_poweroff>destroy</on_poweroff><on_reboot>restart</on_reboot><on_crash>destroy</on_crash>
<devices><emulator>/usr/libexec/qemu-kvm</emulator>
<disk type="file" device="disk"><driver name="qemu" type="qcow2" cache="none"/><source file="{disk}"/><target dev="vda" bus="virtio"/></disk>
<disk type="file" device="cdrom"><driver name="qemu" type="raw"/><source file="{iso}"/><target dev="sda" bus="sata"/><readonly/></disk>
<interface type="network"><mac address="{MAC}"/><source network="{NET}"/><model type="virtio"/></interface>
<serial type="pty"/><console type="pty"/><graphics type="vnc" autoport="yes" listen="127.0.0.1"/><memballoon model="virtio"/>
</devices></domain>'''
(d/'domain.xml').write_text(xml)
known=R/'known_hosts';old=known.read_bytes();assert len(old.splitlines())==5 and IP.encode() not in old
with known.open('ab') as file:file.write((IP+' '+hostpub+'\n').encode())
assert known.read_bytes().startswith(old) and len(known.read_bytes().splitlines())==6
assert shutil.disk_usage(R).free>15*1024**3
run(['virsh','define',d/'domain.xml']);run(['virsh','start',NAME])
after=snapshot();save('storage-after-host.json',after)
changes=[name for name,value in before['domains'].items() if after['domains'].get(name)!=value]
assert not changes and before['networks']==after['networks'] and before['exports']==after['exports'] and before['nfs_services']==after['nfs_services'] and before['routes']==after['routes']
result={'state':'BOOT_REQUESTED_CUSTODY_PRESERVED','name':NAME,'uuid':ident,'ip':IP,'mac':MAC,'vcpus':1,'memory_mib':2048,'disk':str(disk),'virtual_disk_bytes':10*1024**3,'allocated_bytes':disk.stat().st_blocks*512,'base_sha256':EXPECTED,'host_key_pin_preseeded':True,'previous_known_host_entries_preserved':True,'existing_domains_unchanged':len(before['domains']),'network_definitions_unchanged':True,'outer_nfs_services_exports_unchanged':True,'scope':'Disposable storage software domain outside five-voter fault set; not physical independence','free_host_bytes':after['free_bytes'],'source_sha256':sha(__file__),'at':now()}
save('storage-provisioning.json',result);print(json.dumps(result))
