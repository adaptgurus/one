#!/usr/bin/env python3
"""Bounded observation only for the owned OneDRS migration qualification."""
from pathlib import Path
import argparse, subprocess, json, hashlib, os, datetime, re
P=Path('/root/ls-onedrs-migration-endpoint-20261120')
H=Path('/usr/libexec/layersentry-host-network-role')
UUID='1c133f56-0d0c-4d0e-aefd-1a990f71489b'
p=argparse.ArgumentParser();p.add_argument('mode',choices=['snapshot','watch']);p.add_argument('--label',required=True);p.add_argument('--target',choices=['dr1','dr4']);a=p.parse_args()
assert os.geteuid()==0
assert re.fullmatch(r'[a-z0-9-]{1,60}',a.label)
out=P/(a.label+'-'+a.mode+'.json');assert not out.exists(),'Existing receipt; inspect rather than replay'
os.umask(0o077)
def run(argv):return subprocess.check_output(argv,stdin=subprocess.DEVNULL,text=True,timeout=15)
def save(r):
 q=out.with_suffix('.tmp');q.write_text(json.dumps(r,indent=2)+'\n')
 with q.open('rb') as f:os.fsync(f.fileno())
 os.replace(q,out)
r={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'IN_PROGRESS','dmi':Path('/sys/class/dmi/id/product_uuid').read_text().strip(),'helper_sha256':hashlib.sha256(H.read_bytes()).hexdigest()}
try:
 assert r['helper_sha256']=='e2006979aef27d1d32db5c856b2840398ae23b1b06ada272009b838a37b6768f'
 if a.mode=='snapshot':
  guests={}
  for n in run(['virsh','list','--name']).split():
   pid=int(Path('/run/libvirt/qemu/'+n+'.pid').read_text())
   body=Path('/proc/'+str(pid)+'/stat').read_text().rsplit(')',1)[1].split()
   guests[n]={'uuid':run(['virsh','domuuid',n]).strip(),'pid':pid,'start_ticks':body[19],'inactive_xml_sha256':hashlib.sha256(run(['virsh','dumpxml','--inactive',n]).encode()).hexdigest()}
  r.update(state='CAPTURED',owned_guest=guests.pop('one-53',None),other_guests=guests,selinux=run(['getenforce']).strip(),libvirtd_pid=run(['systemctl','show','libvirtd.service','--property=MainPID','--value']).strip())
 else:
  assert a.target and run(['virsh','domuuid','one-53']).strip()==UUID
  assert re.search(r'Job type:\s+None',run(['virsh','domjobinfo','one-53']))
  pid=int(Path('/run/libvirt/qemu/one-53.pid').read_text());r['source_qemu_pid']=pid
  r['prepared']=json.loads(run([str(H),'migration-prepare',a.target]))
  child=subprocess.Popen([str(H),'migration-watch',a.target,UUID,str(pid),'120'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  r.update(state='OBSERVING',watch_pid=child.pid);save(r);print(json.dumps(r),flush=True)
  stdout,stderr=child.communicate(timeout=125);r.update(exit=child.returncode,stderr=stderr)
  if child.returncode:raise RuntimeError('Socket observation did not qualify: '+stderr[:800])
  r.update(state='PASS_NATIVE_QEMU_SOCKET',socket=json.loads(stdout))
except Exception as e:
 r.update(state='FAILED_RETAINED',error=str(e));raise
finally:
 r['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(r);print(json.dumps(r),flush=True)
