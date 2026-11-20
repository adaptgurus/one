#!/usr/bin/env python3
"""Persist qualified DR4 client mounts and its currently active libvirt mode."""
import datetime, hashlib, json, os, pathlib, subprocess
B=pathlib.Path('/root/ls-onedrs-dr4-admission-20261120')
RESULT=B/'persistence-r2-result.json'
EXPORT='172.17.40.215:/Pool_1/SHARED_DATA/Ls_two_DATA/dcdr-lab-20260930/files'
TARGETS=[
 ('/var/lib/one/datastores/104',EXPORT+'/ls-k1p0-20261025-3d188077/storage-20261026/system'),
 ('/var/lib/one/datastores/105',EXPORT+'/ls-k1p0-20261025-3d188077/storage-20261026/image'),
 ('/srv/layersentry-native/dr/files',EXPORT)]
MODES=['virtqemud','virtproxyd','virtinterfaced','virtnetworkd','virtnodedevd','virtnwfilterd','virtsecretd','virtstoraged']
LOG=[]
def run(args,check=True,timeout=40):
 r=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 LOG.append({'command':args,'rc':r.returncode,'stdout':r.stdout[-3000:],'stderr':r.stderr[-1000:]})
 if check and r.returncode: raise RuntimeError(str(args)+' failed: '+r.stderr[-500:])
 return r.stdout.strip()
def snapshot():
 names=run(['virsh','list','--all','--name']).splitlines()
 out={}
 for name in names:
  if not name:continue
  xml=run(['virsh','dumpxml',name,'--inactive'])
  assert '/var/lib/one/datastores/' not in xml and '/srv/layersentry-native/' not in xml, 'Pre-existing guest uses native mount'
  pid=pathlib.Path('/run/libvirt/qemu')/(name+'.pid')
  out[name]={'xml_sha256':hashlib.sha256(xml.encode()).hexdigest(),'pid':pid.read_text().strip() if pid.exists() else None,'uuid':run(['virsh','domuuid',name])}
 return out
def mounts(target):
 text=run(['findmnt','-rn','--mountpoint',target,'-o','SOURCE,FSTYPE,OPTIONS'],False)
 return [x.split(None,2) for x in text.splitlines()]
def unitname(target,suffix):
 return run(['systemd-escape','--path','--suffix='+suffix,target])
assert not RESULT.exists(), 'Existing terminal receipt; do not rerun'
assert run(['hostname','-s'])=='dr4'
assert run(['systemctl','is-active','libvirtd.service'])=='active'
before=snapshot()
assert len(before)==8 and all(x['pid'] for x in before.values())
libpid=run(['systemctl','show','libvirtd.service','--property=MainPID','--value'])
units_before={}
for name in MODES:
 for suffix in ['.service','.socket','-ro.socket','-admin.socket']:
  u=name+suffix
  units_before[u]=run(['systemctl','is-enabled',u],False)
  assert run(['systemctl','is-active',u],False) in ('inactive','unknown'), 'Modular daemon became active'
for u in ['libvirtd.service','libvirtd.socket','libvirtd-ro.socket','libvirtd-admin.socket','virtlogd.socket','virtlockd.socket']:
 units_before[u]=run(['systemctl','is-enabled',u],False)
written=[]; changed_modes={}; original_mounts={}
for target,source in TARGETS:
 p=pathlib.Path(target)
 rows=mounts(target)
 if target.startswith('/var/lib/one/'):
  assert len(rows)==1 and rows[0][0]==source and rows[0][1]=='nfs4'
  original_mounts[target]={'source':source,'options':rows[0][2]}
 else:
  assert p.is_dir() and p.stat().st_uid==0 and not any(p.iterdir()) and not rows, 'Canonical target differs from owned rollback residue'
 for suffix in ['mount','automount']:
  name=unitname(target,suffix)
  assert not (pathlib.Path('/etc/systemd/system')/name).exists(), 'Unit already exists'
(B/'persistence-r2-before.json').write_text(json.dumps({'guests':before,'units':units_before,'mounts':original_mounts,'libvirtd_pid':libpid},indent=2)+'\n')
state={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'IN_PROGRESS'}
try:
 for target,source in TARGETS:
  p=pathlib.Path(target)
  if target in original_mounts:run(['umount',target])
  else:p.mkdir(parents=True,mode=0o755,exist_ok=True)
  assert not any(p.iterdir()), 'Refusing to obscure unmounted local content: '+target
  changed_modes[target]=p.stat().st_mode & 0o7777
  os.chmod(p,0)
  mn=unitname(target,'mount'); an=unitname(target,'automount')
  mount='[Unit]\nDescription=OneDRS DR4 qualified native shared storage\nWants=network-online.target\nAfter=network-online.target\n\n[Mount]\nWhat='+source+'\nWhere='+target+'\nType=nfs4\nOptions=rw,nosuid,nodev,noexec,vers=4.2,hard,proto=tcp,timeo=600,retrans=2,_netdev\nTimeoutSec=45\n'
  auto='[Unit]\nDescription=OneDRS DR4 fail-closed native storage automount\nBefore=libvirtd.service\n\n[Automount]\nWhere='+target+'\nTimeoutIdleSec=0\n\n[Install]\nWantedBy=multi-user.target\n'
  for name,content in [(mn,mount),(an,auto)]:
   file=pathlib.Path('/etc/systemd/system')/name
   file.write_text(content);os.chmod(file,0o644);written.append(str(file))
 run(['systemd-analyze','verify']+written,timeout=45)
 run(['systemctl','daemon-reload'])
 for target,source in TARGETS:
  run(['systemctl','enable','--now',unitname(target,'automount')],timeout=50)
  run(['runuser','-u','oneadmin','--','python3','-c','import os,sys; d=os.scandir(sys.argv[1]); next(d,None); d.close(); print("opened_native_mount")',target],timeout=50)
  rows=mounts(target)
  ns=[x for x in rows if x[1]=='nfs4']
  assert len(ns)==1 and ns[0][0]==source
  opts=set(ns[0][2].split(','))
  assert {'rw','nosuid','nodev','noexec','hard'} <= opts
 # Persistence-only changes: do not stop or restart a running daemon.
 disable=[u for u,v in units_before.items() if v=='enabled' and any(u.startswith(n+'.') or u.startswith(n+'-') for n in MODES)]
 if disable:run(['systemctl','disable']+disable)
 run(['systemctl','enable','libvirtd.service'])
 assert run(['systemctl','show','libvirtd.service','--property=MainPID','--value'])==libpid
 after=snapshot()
 assert before==after, 'Guest identity changed during persistence work'
 for u in disable:assert run(['systemctl','is-enabled',u],False)=='disabled'
 assert run(['systemctl','is-enabled','libvirtd.service'])=='enabled'
 state.update(result='PASS_PERSISTENT_CLIENT_MOUNTS_AND_MATCHED_LIBVIRT_MODE',guests_unchanged=True,guest_count=len(after),libvirtd_pid_unchanged=True,enabled_automounts=[unitname(t,'automount') for t,_ in TARGETS],reboot_performed=False)
except Exception as e:
 state.update(result='FAIL',error=repr(e),rollback_errors=[])
 for target,source in reversed(TARGETS):
  try:
   if str(pathlib.Path('/etc/systemd/system')/unitname(target,'automount')) in written:
    run(['systemctl','stop',unitname(target,'mount')],False)
    run(['systemctl','disable','--now',unitname(target,'automount')],False)
   if target in changed_modes:
    assert not mounts(target), 'Refusing to chmod a still-mounted target'
    os.chmod(target,changed_modes[target])
   if target in original_mounts and not any(x[1]=='nfs4' for x in mounts(target)):
    run(['mount','-t','nfs4','-o',original_mounts[target]['options'],source,target])
  except Exception as re:state['rollback_errors'].append(str(re))
 for file in written:pathlib.Path(file).unlink(missing_ok=True)
 for u,v in units_before.items():
  if v in ('enabled','disabled'):run(['systemctl','enable' if v=='enabled' else 'disable',u],False)
 run(['systemctl','daemon-reload'],False)
 raise
finally:
 state['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 RESULT.write_text(json.dumps(state,indent=2)+'\n')
 (B/'persistence-r2-actions.json').write_text(json.dumps(LOG,indent=2)+'\n')
 print(json.dumps(state))
