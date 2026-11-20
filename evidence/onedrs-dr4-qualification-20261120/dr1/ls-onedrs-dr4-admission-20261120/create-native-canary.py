#!/usr/bin/env python3
"""Deploy one owned synthetic disk-integrity guest on disabled DR4."""
import pathlib,json,hashlib,gzip,os,shutil,secrets,socket,xmlrpc.client,xml.etree.ElementTree as E,datetime,subprocess
B=pathlib.Path('/root/ls-onedrs-dr4-native-canary-20261120')
B.mkdir(mode=0o700,exist_ok=True)
M=B/'manifest.json'
assert not M.exists(), 'Canary already allocated or prepared; inspect manifest'
K=pathlib.Path('/boot/vmlinuz-5.14.0-687.52.1.el9_8.x86_64')
I=pathlib.Path('/root/onedrs-native-data-canary-20261113/initramfs.gz')
assert hashlib.sha256(K.read_bytes()).hexdigest()=='d44af9bb3f25a31bdcf9ed3f724ffd3a76f5c9eef06df9b1fed1b453b48680a6'
assert hashlib.sha256(I.read_bytes()).hexdigest()=='460f9fe5b302cdc17ceedcb413f503dc42a3285a91ce42047cc2aa9e19af7995'
cpio=gzip.decompress(I.read_bytes());pos=0;contents={}
while pos+110<=len(cpio):
 h=cpio[pos:pos+110];assert h[:6] in (b'070701',b'070702')
 size=int(h[54:62],16);nl=int(h[94:102],16)
 name=cpio[pos+110:pos+110+nl-1].decode();start=(pos+110+nl+3)//4*4
 if name=='TRAILER!!!':break
 contents[name]=hashlib.sha256(cpio[start:start+size]).hexdigest()
 pos=(start+size+3)//4*4
assert contents.get('init',contents.get('./init'))=='847d74041f5b6c10af69bb40b407815950f9b10f00e372af4293928e05199972'
socket.setdefaulttimeout(20)
auth=pathlib.Path('/var/lib/one/.one/one_auth').read_text().strip()
api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2',allow_none=False)
def call(method,*args):
 r=getattr(api,method)(auth,*args)
 if not r[0]:raise RuntimeError(method+': '+str(r[1])[:400])
 return r[1]
host=E.fromstring(call('one.host.info',4,False))
assert host.findtext('NAME')=='172.17.60.88' and host.findtext('CLUSTER_ID')=='103'
assert host.findtext('STATE') in ['4','7'] and host.findtext('./TEMPLATE/LAYERSENTRY_DRS_READY')=='NO'
assert int(host.findtext('./HOST_SHARE/MAX_CPU'))>=100 and int(host.findtext('./HOST_SHARE/MAX_MEM'))>=262144
run='ls-onedrs-dr4-canary-20261120-'+secrets.token_hex(4)
root=pathlib.Path('/srv/layersentry-native/dr/files')/run
find=subprocess.run(['findmnt','-rn','-T',str(root.parent),'-o','SOURCE,FSTYPE'],capture_output=True,text=True,check=True)
assert find.stdout.strip()=='172.17.40.215:/Pool_1/SHARED_DATA/Ls_two_DATA/dcdr-lab-20260930/files nfs4'
root.mkdir(mode=0o755);os.chmod(root,0o755);os.chown(root,9869,9869)
boot=root/'boot';boot.mkdir(mode=0o755);os.chmod(boot,0o755);os.chown(boot,9869,9869)
for src,name in [(K,'vmlinuz'),(I,'initramfs.gz')]:
 dst=boot/name;shutil.copyfile(src,dst);os.chmod(dst,0o644);os.chown(dst,9869,9869)
console=root/'console.log';console.touch(mode=0o600);os.chown(console,9869,9869)
manifest={'run':run,'root':str(root),'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'native_host_id':4,'qualification_cluster_id':103,'system_datastore_id':104,'purpose':'Owned 256 MiB native synthetic disk-integrity guest; not production HA acceptance','scope':'No existing VM lifecycle or original cluster policy changes','state':'PREPARED','assets':{x:hashlib.sha256((boot/x).read_bytes()).hexdigest() for x in ['vmlinuz','initramfs.gz']},'init_sha256':contents.get('init',contents.get('./init'))}
def save():M.write_text(json.dumps(manifest,indent=2)+'\n')
save()
template=f'''NAME="{run}"
CPU="1"
VCPU="1"
MEMORY="256"
HYPERVISOR="kvm"
LAYERSENTRY_LAB_ONLY="YES"
LAYERSENTRY_LAB_OPERATION_ID="{run}"
SCHED_REQUIREMENTS="CLUSTER_ID = 103 | CLUSTER_ID = 0"
SCHED_DS_REQUIREMENTS="ID = 104"
OS=[ARCH="x86_64",MACHINE="q35",KERNEL="{boot}/vmlinuz",INITRD="{boot}/initramfs.gz",KERNEL_CMD="console=ttyS0,115200 rdinit=/init panic=0 quiet loglevel=3"]
CPU_MODEL=[MODEL="qemu64"]
DISK=[TYPE="fs",FORMAT="raw",SIZE="64",TARGET="vda",DEV_PREFIX="vd",DRIVER="raw",CACHE="none"]
FEATURES=[ACPI="yes",APIC="yes",GUEST_AGENT="no"]
RAW=[TYPE="kvm",DATA="<devices><serial type='file'><source path='{console}' append='on'/><target port='0'/></serial></devices>"]
'''
(B/'vm.template').write_text(template)
try:
 vid=call('one.vm.allocate',template,True)
 manifest.update(vm_id=vid,state='ALLOCATED_HOLD');save()
 vm=E.fromstring(call('one.vm.info',vid,False))
 assert vm.findtext('NAME')==run and vm.findtext('USER_TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==run
 call('one.vm.deploy',vid,4,True,104,'')
 manifest.update(state='DEPLOY_REQUEST_ACCEPTED');save()
except Exception as e:
 manifest.update(state='ERROR_REQUIRES_INSPECTION',error=repr(e));save();raise
print(json.dumps(manifest))
