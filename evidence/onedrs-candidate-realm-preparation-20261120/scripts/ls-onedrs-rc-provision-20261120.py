#!/usr/bin/env python3
"""Create an isolated candidate qualification realm without changing the R13 realm."""
import concurrent.futures, datetime, hashlib, ipaddress, json, os, pathlib, pwd, shutil, subprocess, traceback, uuid
import xml.etree.ElementTree as ET

D = pathlib.Path('/root/ls-onedrs-rc-20261120')
IMG = pathlib.Path('/var/lib/libvirt/images/ls-onedrs-rc-20261120')
BASE = pathlib.Path('/var/lib/libvirt/images/ls-onedrs-ha-e2e-20261114/rocky9-base.qcow2')
BASE_SHA = '92c206cc6f790c61583247eefe87890f8828420662c17cacf247cec78ab4eec8'
NET, BRIDGE = 'ls-onedrs-rc-20261120', 'lsdrrc20br0'
SUBNET = ipaddress.ip_network('192.168.247.0/24')
MEMBERS = [{'name':f'ls-onedrs-rc-{i:02d}', 'ip':f'192.168.247.{10+i}', 'mac':f'52:54:00:da:27:{16+i:02x}', 'uuid':str(uuid.uuid4())} for i in range(1,6)]

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(args, timeout=120):
    p = subprocess.run([str(x) for x in args], text=True, capture_output=True, timeout=timeout, stdin=subprocess.DEVNULL)
    if p.returncode:
        raise RuntimeError(f'{args[0]} {args[1] if len(args)>1 else ""} exit {p.returncode}: {p.stderr[-1000:]}')
    return p.stdout

def sha(path):
    h=hashlib.sha256()
    with pathlib.Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def save(name, obj):
    p=D/name; p.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n'); p.chmod(0o600)

def snapshot():
    names=run(['virsh','list','--name']).split()
    def domain(name):
        x=ET.fromstring(run(['virsh','dumpxml',name,'--inactive']))
        pid=int(pathlib.Path('/run/libvirt/qemu',name+'.pid').read_text())
        stat=pathlib.Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()
        return name,{'uuid':x.findtext('uuid'),'pid':pid,'start_ticks':stat[19], 'inactive_xml_sha256':hashlib.sha256(ET.tostring(x)).hexdigest()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        domains=dict(ex.map(domain,names))
    networks={n:hashlib.sha256(run(['virsh','net-dumpxml',n]).encode()).hexdigest() for n in run(['virsh','net-list','--all','--name']).split()}
    return {'at_utc':now(),'domains':domains,'networks':networks,'routes':json.loads(run(['ip','-json','-4','route','show'])),'free_bytes':shutil.disk_usage('/').free}

def main():
    os.umask(0o077)
    if D.exists() or IMG.exists(): raise RuntimeError('Owned output path already exists; do not replay provisioning')
    if sha(BASE)!=BASE_SHA: raise RuntimeError('Base image digest changed')
    info=json.loads(run(['qemu-img','info','--output=json',BASE]))
    if info['format']!='qcow2' or info['virtual-size']!=10*1024**3 or info.get('backing-filename'): raise RuntimeError('Unexpected base image structure')
    free=shutil.disk_usage('/').free
    if free<50*1024**3: raise RuntimeError('Need at least 50 GiB free before preparation')
    mem={l.split(':')[0]:int(l.split()[1]) for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.split(':')[0] in ('MemAvailable',)}
    if mem['MemAvailable']<64*1024**2: raise RuntimeError('Insufficient host memory headroom')
    existing=run(['virsh','list','--all','--name']).split()
    if any(m['name'] in existing for m in MEMBERS): raise RuntimeError('Domain name collision')
    macs=set()
    for name in existing:
        x=ET.fromstring(run(['virsh','dumpxml',name,'--inactive']))
        macs.update(n.get('address','').lower() for n in x.findall('./devices/interface/mac'))
    if any(m['mac'] in macs for m in MEMBERS): raise RuntimeError('MAC collision')
    nets=run(['virsh','net-list','--all','--name']).split()
    for name in nets:
        x=ET.fromstring(run(['virsh','net-dumpxml',name]))
        if name==NET or (x.find('bridge') is not None and x.find('bridge').get('name')==BRIDGE): raise RuntimeError('Network identity collision')
        for ip in x.findall('ip'):
            if ':' not in ip.get('address',''):
                n=ipaddress.ip_network(ip.get('address')+'/'+ip.get('netmask',ip.get('prefix','32')),strict=False)
                if SUBNET.overlaps(n): raise RuntimeError('Subnet overlaps defined libvirt network')
    for route in json.loads(run(['ip','-json','-4','route','show','table','all'])):
        dest=route.get('dst','default')
        if dest!='default' and SUBNET.overlaps(ipaddress.ip_network(dest,strict=False)): raise RuntimeError('Subnet overlaps existing route')
    if any(x['ifname']==BRIDGE for x in json.loads(run(['ip','-json','link','show']))): raise RuntimeError('Bridge name collision')
    before=snapshot()
    D.mkdir(mode=0o700); IMG.mkdir(mode=0o755)
    save('before-host.json',before)
    result={'started_utc':now(),'state':'PREPARING','scope':'Fresh isolated five-voter candidate software qualification realm; no physical-failure claim; original R13 realm unchanged','base_sha256':BASE_SHA,'network':NET,'subnet':str(SUBNET),'members':MEMBERS,'native_candidate_installed':False,'soak_started':False,'storage_budget_note':'10 GiB sparse roots; pause new work below 15 GiB host free space; no existing disk cleanup'}
    save('provisioning.json',result)
    owner=pwd.getpwnam('oneadmin')
    run(['ssh-keygen','-q','-t','ed25519','-N','','-C','onedrs-candidate-qualification-20261120','-f',D/'lab_ed25519'])
    pub=(D/'lab_ed25519.pub').read_text().strip()
    known=[]
    for m in MEMBERS:
        d=D/m['name']; d.mkdir(mode=0o700)
        run(['ssh-keygen','-q','-t','ed25519','-N','','-C',m['name'],'-f',d/'host_ed25519'])
        hostpub=(d/'host_ed25519.pub').read_text().strip()
        known.append(m['ip']+' '+hostpub)
        private=''.join('    '+line+'\n' for line in (d/'host_ed25519').read_text().splitlines())
        userdata=f'''#cloud-config
hostname: {m['name']}
fqdn: {m['name']}.candidate-lab.internal
manage_etc_hosts: true
disable_root: true
ssh_pwauth: false
users:
  - name: haqa
    gecos: Dedicated OneDRS candidate qualification
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
final_message: "CANDIDATE-REALM-READY {m['name']}"
'''
        (d/'user-data').write_text(userdata)
        (d/'meta-data').write_text(f"instance-id: {m['uuid']}\nlocal-hostname: {m['name']}\n")
        iso=IMG/(m['name']+'-cidata.iso');disk=IMG/(m['name']+'.qcow2')
        run(['genisoimage','-quiet','-output',iso,'-volid','cidata','-joliet','-rock',d/'user-data',d/'meta-data'])
        run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',BASE,disk])
        for p,label in [(disk,'virt_image_t'),(iso,'virt_content_t')]:
            os.chown(p,owner.pw_uid,owner.pw_gid);p.chmod(0o600);run(['chcon','-t',label,p])
        xml=f'''<domain type="kvm"><name>{m['name']}</name><uuid>{m['uuid']}</uuid>
<memory unit="MiB">4096</memory><vcpu placement="static">2</vcpu>
<os><type arch="x86_64">hvm</type><boot dev="hd"/></os><features><acpi/><apic/></features>
<cpu mode="host-passthrough" check="none"/><clock offset="utc"/>
<on_poweroff>destroy</on_poweroff><on_reboot>restart</on_reboot><on_crash>destroy</on_crash>
<devices><emulator>/usr/libexec/qemu-kvm</emulator>
<disk type="file" device="disk"><driver name="qemu" type="qcow2" cache="none"/><source file="{disk}"/><target dev="vda" bus="virtio"/></disk>
<disk type="file" device="cdrom"><driver name="qemu" type="raw"/><source file="{iso}"/><target dev="sda" bus="sata"/><readonly/></disk>
<interface type="network"><mac address="{m['mac']}"/><source network="{NET}"/><model type="virtio"/></interface>
<serial type="pty"/><console type="pty"/><graphics type="vnc" autoport="yes" listen="127.0.0.1"/><memballoon model="virtio"/>
</devices></domain>'''
        (d/'domain.xml').write_text(xml)
    (D/'known_hosts').write_text('\n'.join(known)+'\n')
    entries=''.join(f'<host mac="{m["mac"]}" ip="{m["ip"]}" name="{m["name"]}"/>' for m in MEMBERS)
    netxml=f'<network><name>{NET}</name><forward mode="nat"/><bridge name="{BRIDGE}" stp="on" delay="0"/><ip address="192.168.247.1" netmask="255.255.255.0"><dhcp>{entries}</dhcp></ip></network>'
    (D/'network.xml').write_text(netxml)
    run(['virsh','net-define',D/'network.xml']);run(['virsh','net-start',NET])
    for m in MEMBERS:
        if shutil.disk_usage('/').free<15*1024**3: raise RuntimeError('Disk headroom guard stopped new VM startup')
        run(['virsh','define',D/m['name']/'domain.xml']);run(['virsh','start',m['name']])
    after=snapshot();save('after-host.json',after)
    changes=[n for n,v in before['domains'].items() if after['domains'].get(n)!=v]
    network_changes=[n for n,v in before['networks'].items() if after['networks'].get(n)!=v]
    missing_routes=[r for r in before['routes'] if r not in after['routes']]
    result.update({'ended_utc':now(),'state':'BOOT_REQUESTED_CUSTODY_PRESERVED' if not changes and not network_changes and not missing_routes else 'BOOT_REQUESTED_CUSTODY_DIFFERENCE','existing_domain_count':len(before['domains']),'changed_existing_domains':changes,'changed_existing_networks':network_changes,'missing_existing_routes':missing_routes,'free_bytes_after':after['free_bytes'],'source_sha256':sha(__file__)})
    save('provisioning.json',result)
    print(json.dumps({k:result[k] for k in ['state','members','changed_existing_domains','changed_existing_networks','missing_existing_routes','free_bytes_after','native_candidate_installed','soak_started']}))

if __name__=='__main__':
    try:main()
    except Exception as e:
        if D.exists():save('provisioning-failure.json',{'at_utc':now(),'state':'STOPPED','error':str(e),'traceback':traceback.format_exc(),'automatic_rollback':False})
        raise
