"""DR4 fixed native NFS paths: remount read/write, verify cross-host semantics.
Only unique owned witness files are created; no existing workload file is changed.
"""
from pathlib import Path
import datetime, hashlib, json, os, subprocess, sys, xml.etree.ElementTree as E
D=Path('/root/ls-onedrs-dr4-admission-20261120')
TARGETS={'104':'172.17.40.215:/Pool_1/SHARED_DATA/Ls_two_DATA/dcdr-lab-20260930/files/ls-k1p0-20261025-3d188077/storage-20261026/system','105':'172.17.40.215:/Pool_1/SHARED_DATA/Ls_two_DATA/dcdr-lab-20260930/files/ls-k1p0-20261025-3d188077/storage-20261026/image'}
os.umask(0o077)
def must(value,message):
 if not value:raise RuntimeError(message)
def run(args,timeout=20):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,stdin=subprocess.DEVNULL)
 with (D/'storage-actions.jsonl').open('a') as f:f.write(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'argv':args[:5],'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})+'\n')
 must(p.returncode==0,'Fixed storage command failed; inspect private log')
 return p.stdout
def mounts():
 out={}
 for ds,source in TARGETS.items():
  row=json.loads(run(['findmnt','-J','-M','/var/lib/one/datastores/'+ds]))['filesystems'][0]
  must(row['source']==source and row['fstype']=='nfs4','Unexpected native NFS identity')
  out[ds]=row
 return out
must(subprocess.check_output(['hostname'],text=True).strip()=='dr4','Wrong node')
must(Path('/sys/class/dmi/id/product_uuid').read_text().strip()=='87cee185-4cab-4384-afde-19a5cd3a2239','Wrong node identity')
must(not (D/'storage-result.json').exists(),'Already attempted; do not replay')
before=mounts()
for row in before.values():must('ro' in row['options'].split(','),'Expected prior read-only qualification mount')
for name in run(['virsh','list','--name']).split():
 root=E.fromstring(run(['virsh','dumpxml',name]))
 for source in root.findall('devices/disk/source'):
  must(not any(source.get('file','').startswith('/var/lib/one/datastores/'+d+'/') for d in TARGETS),'Existing guest uses qualification path')
result={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'DR4 client NFS readiness, not storage fencing','before':before,'result':'FAIL'}
changed=[]
WITNESS=r"""
import errno,fcntl,hashlib,json,os,pathlib,shlex,subprocess,uuid
peers=['172.17.60.80','172.17.60.81','172.17.60.82']
run_id='ls-onedrs-dr4-qual-'+uuid.uuid4().hex
rows=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def peer(ip,code,args):
 command=shlex.join(['python3','-c',code,*args])
 p=subprocess.run(['ssh','-T','-n','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=4','oneadmin@'+ip,command],capture_output=True,text=True,timeout=12)
 if p.returncode:raise RuntimeError('Native shared path peer request failed on '+ip)
 return json.loads(p.stdout)
read_code='import pathlib,hashlib,json,sys; p=pathlib.Path(sys.argv[1]); print(json.dumps({"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"uid":p.stat().st_uid}))'
lock_code='''import errno,fcntl,json,sys
f=open(sys.argv[1],"r+")
try:
 fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
 print(json.dumps({"remote_lock_refused":False}))
except BlockingIOError:
 print(json.dumps({"remote_lock_refused":True}))
finally:f.close()
'''
write_code='''import pathlib,hashlib,json,sys,os
p=pathlib.Path(sys.argv[1]);expected=sys.argv[2]
if hashlib.sha256(p.read_bytes()).hexdigest()!=expected:raise RuntimeError("Witness changed")
with p.open("ab") as f:f.write(b"native-peer-append");f.flush();os.fsync(f.fileno())
print(json.dumps({"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}))
'''
for ds in ['104','105']:
 p=pathlib.Path('/var/lib/one/datastores')/ds/('.'+run_id)
 payload=(run_id+'\n'+ds+'\n').encode()
 fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(payload);f.flush();os.fsync(f.fileno())
 expected=sha(payload);row={'ds':ds,'witness':p.name,'initial_sha256':expected,'peer_reads':[]}
 for ip in peers:
  got=peer(ip,read_code,[str(p)])
  if got!={'sha256':expected,'uid':9869}:raise RuntimeError('Native shared path content/owner mismatch')
  row['peer_reads'].append({'host':ip,**got})
 with p.open('r+') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  result=peer(peers[0],lock_code,[str(p)])
  if result!={'remote_lock_refused':True}:raise RuntimeError('Native cross-host advisory lock not enforced')
  row['cross_host_advisory_lock']=True
 after=peer(peers[0],write_code,[str(p),expected])
 if sha(p.read_bytes())!=after['sha256'] or p.read_bytes()!=payload+b'native-peer-append':raise RuntimeError('Native reverse write/readback mismatch')
 row['reverse_write_sha256']=after['sha256']
 if p.is_symlink() or p.stat().st_uid!=9869:raise RuntimeError('Owned witness identity changed')
 p.unlink();row['owned_witness_removed']=True
 rows.append(row)
print(json.dumps({'run_id':run_id,'results':rows,'existing_workload_files_written':False}))
"""
try:
 for ds in TARGETS:
  run(['mount','-o','remount,rw','/var/lib/one/datastores/'+ds]);changed.append(ds)
 after=mounts()
 for row in after.values():must('rw' in row['options'].split(',') and 'ro' not in row['options'].split(','),'NFS remains read-only')
 result['witness']=json.loads(run(['sudo','-n','-u','oneadmin','python3','-c',WITNESS],timeout=90))
 result['after']=after;result['result']='PASS_NATIVE_NFS_RW_CROSS_HOST_AND_LOCK_SEMANTICS'
except BaseException as exc:
 result['error']=str(exc);result['rollback']=[]
 for ds in reversed(changed):
  try:run(['mount','-o','remount,ro','/var/lib/one/datastores/'+ds]);result['rollback'].append({'ds':ds,'restored_readonly':True})
  except Exception as e:result['rollback'].append({'ds':ds,'error':str(e)})
finally:
 result['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (D/'storage-result.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result,indent=2))
if not result['result'].startswith('PASS'):sys.exit(1)
