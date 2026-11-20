#!/usr/bin/python3
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,shlex,shutil,socket,subprocess
import xml.etree.ElementTree as ET
R=Path('/root/ls-onedrs-rc-20261120');nodes=json.loads((R/'provisioning.json').read_text())['members']
assert json.loads((R/'storage-boundary-r2-result.json').read_text())['status']=='PASS'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(args):return subprocess.check_output(args,text=True,stdin=subprocess.DEVNULL)
def remote(ip,program,principal='root',trust=R,known_hosts=None):
 args=['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known_hosts if known_hosts is not None else trust/'known_hosts'),'-o','ConnectTimeout=8','-i',str(trust/'lab_ed25519'),'haqa@'+ip,'sudo -n -u '+shlex.quote(principal)+' python3 -c '+shlex.quote(program)]
 p=subprocess.run(args,capture_output=True,text=True,timeout=30)
 if p.returncode:raise RuntimeError(ip+': '+p.stderr[-1000:])
 return json.loads(p.stdout)
server="""from pathlib import Path
import hashlib,json
r=Path('/srv/onedrs-rc-data');out={}
for leaf in ['system','images','files']:
 files=sorted((r/leaf).iterdir());assert len(files)==5
 for p in files:
  assert p.name.startswith('.rc-access-ls-onedrs-rc-') and p.name[-2:] in ['01','02','03','04','05']
  data=p.read_bytes();assert data.startswith(('owned-native-nfs42:'+p.name.removeprefix('.rc-access-')).encode()) and len(data)<100
  out[leaf+'/'+p.name]=hashlib.sha256(data).hexdigest()
assert not list((r/'fences').iterdir())
print(json.dumps(out))"""
expected=remote('192.168.247.16',server)
client="""from pathlib import Path
import hashlib,json,os,subprocess
expected=json.loads(EXPECTED)
paths={'system':'0','images':'1','files':'2'}
assert os.geteuid()==9869
checks=[]
for name,digest in sorted(expected.items()):
 leaf,file=name.split('/',1);p=Path('/var/lib/one/datastores')/paths[leaf]/file
 assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
 checks.append(name)
print(json.dumps({'status':'PASS','read_checks':len(checks),'files':checks,'uid':os.geteuid()}))"""
def check_node(node):
 result=remote(node['ip'],'EXPECTED='+repr(json.dumps(expected))+'\n'+client,'oneadmin');result['node']=node['name'];return result
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:reads=list(pool.map(check_node,nodes))
before=json.loads((R/'storage-before-host.json').read_text())
domains={}
for name in before['domains']:
 x=ET.fromstring(run(['virsh','dumpxml',name,'--inactive']));pid=int(Path('/run/libvirt/qemu',name+'.pid').read_text());ticks=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[19]
 domains[name]={'uuid':x.findtext('uuid'),'pid':pid,'start_ticks':ticks,'inactive_xml_sha256':hashlib.sha256(ET.tostring(x)).hexdigest()}
networks={}
for name in before['networks']:
 x=ET.fromstring(run(['virsh','net-dumpxml',name,'--inactive']));x.attrib.pop('connections',None);networks[name]=hashlib.sha256(ET.tostring(x)).hexdigest()
exports={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('/etc/exports'),*sorted(Path('/etc/exports.d').glob('*'))] if p.is_file()}
services=run(['systemctl','show','nfs-server','nfs-mountd','rpcbind','-p','Id','-p','MainPID','-p','ExecMainStartTimestampMonotonic','-p','ActiveEnterTimestampMonotonic'])
routes=json.loads(run(['ip','-json','-4','route','show']))
assert domains==before['domains'] and networks==before['networks'] and exports==before['exports'] and services==before['nfs_services'] and routes==before['routes']
old_code="""from pathlib import Path
import json,os,subprocess
mounts=json.loads(subprocess.check_output(['findmnt','--json','-t','nfs4','-o','TARGET,SOURCE,FSTYPE,OPTIONS'],text=True))['filesystems']
checks=[]
for mount in mounts:
 p=Path(mount['target']);items=list(p.iterdir());s=p.stat();checks.append({'target':str(p),'source':mount['source'],'fstype':mount['fstype'],'readable':True,'uid':s.st_uid,'gid':s.st_gid,'entries':len(items)})
assert checks
print(json.dumps({'scope':'READ_ONLY_EXISTING_R13_SHARE_ACCESS','uid':os.geteuid(),'checks':checks}))"""
old_access=remote('192.168.246.11',old_code,'oneadmin',Path('/root/ls-onedrs-ha-e2e-20261114'),Path('/root/.ssh/known_hosts'))
negative=False
try:
 with socket.create_connection(('192.168.247.16',2049),timeout=2):pass
except (TimeoutError,ConnectionError,OSError):negative=True
assert negative,'Unallowlisted outer-host NFS connection was accepted'
assert (R/'known_hosts').read_bytes().splitlines()[:5]==(R/'frontend-auth/known_hosts').read_bytes().splitlines()
result={'status':'PASS','at':now(),'scope':'FRESH_NFS42_SHARED_ACCESS_AND_EXISTING_CUSTODY_NOT_PRODUCTION_OR_PHYSICAL_FAILURE_PROOF','shared_read_checks':sum(n['read_checks'] for n in reads),'node_reads':reads,'existing_domain_identities_unchanged':len(domains),'existing_network_definitions_unchanged':True,'existing_outer_nfs_exports_and_service_identities_unchanged':True,'old_r13_share_read_access':old_access,'unallowlisted_outer_nfs_connection_denied':True,'fences_contains_no_files_or_secrets':True,'five_original_host_pins_preserved':True,'free_host_bytes':shutil.disk_usage(R).free}
p=R/'storage-qualification-r3.json';assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600);print(json.dumps(result))
