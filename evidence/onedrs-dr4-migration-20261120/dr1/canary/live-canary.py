#!/usr/bin/env python3
"""Single native live migration of the fixed disposable VM, with guest continuity."""
import argparse,pathlib,json,time,datetime,socket,xmlrpc.client,xml.etree.ElementTree as E,os
p=argparse.ArgumentParser();p.add_argument('--from-host',type=int,required=True);p.add_argument('--to-host',type=int,required=True);a=p.parse_args()
assert (a.from_host,a.to_host) in [(0,4),(4,0)]
B=pathlib.Path('/root/ls-onedrs-dr4-native-canary-20261120');M=json.loads((B/'manifest.json').read_text())
OUT=B/('live-'+str(a.from_host)+'-to-'+str(a.to_host)+'.json')
assert not OUT.exists(),'Existing receipt; inspect before replay'
os.umask(0o077);socket.setdefaulttimeout(15)
auth=pathlib.Path('/var/lib/one/.one/one_auth').read_text().strip();api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2',allow_none=False)
def call(m,*args):
 r=getattr(api,m)(auth,*args)
 if not r[0]:raise RuntimeError(m+': '+str(r[1])[:500])
 return r[1]
def owned():
 e=E.fromstring(call('one.vm.info',M['vm_id'],False));h=e.findall('./HISTORY_RECORDS/HISTORY')[-1]
 assert e.findtext('NAME')==M['run'] and e.findtext('./USER_TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==M['run']
 assert e.findtext('./TEMPLATE/OS/UUID')=='1c133f56-0d0c-4d0e-aefd-1a990f71489b'
 return {'state':int(e.findtext('STATE')),'lcm':int(e.findtext('LCM_STATE')),'host':int(h.findtext('HID')),'ds':int(h.findtext('DS_ID')),'seq':int(h.findtext('SEQ')),'uuid':e.findtext('./TEMPLATE/OS/UUID')}
def guest():
 q=pathlib.Path(M['root'])/'console.log'
 with q.open('rb') as f:
  f.seek(max(0,q.stat().st_size-16384));data=f.read().decode(errors='replace')
 rs=[json.loads(x.split(' ',1)[1]) for x in data.splitlines() if x.startswith('LS_ONEDRS_CANARY ')]
 assert rs,'No guest heartbeat';return rs[-1]
def custody():
 d={}
 for v in E.fromstring(call('one.vmpool.info',-2,-1,-1,-1)):
  if v.findtext('ID')==str(M['vm_id']):continue
  hs=v.findall('./HISTORY_RECORDS/HISTORY');h=hs[-1] if hs else E.Element('HISTORY')
  d[v.findtext('ID')]={k:v.findtext(k) for k in ['NAME','STATE','LCM_STATE','DEPLOY_ID']}
  d[v.findtext('ID')].update(host=h.findtext('HID'),ds=h.findtext('DS_ID'),seq=h.findtext('SEQ'))
 return d
before=owned();gb=guest();others=custody()
assert (before['state'],before['lcm'],before['host'],before['ds'])==(3,3,a.from_host,104)
assert gb['state']=='READY' and gb['sha256']=='5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a' and not gb['initialized']
time.sleep(2.2);fresh=guest();assert fresh['heartbeat']>gb['heartbeat'] and fresh['boot_id']==gb['boot_id'],'Guest telemetry stale';gb=fresh
host=E.fromstring(call('one.host.info',a.to_host,False))
assert host.findtext('NAME')=={0:'172.17.60.80',4:'172.17.60.88'}[a.to_host]
assert int(host.findtext('./HOST_SHARE/MAX_CPU'))-int(host.findtext('./HOST_SHARE/CPU_USAGE'))>=100
assert int(host.findtext('./HOST_SHARE/MAX_MEM'))-int(host.findtext('./HOST_SHARE/MEM_USAGE'))>=262144
r={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'IN_PROGRESS','scope':'Native live migration of 256 MiB synthetic VM; no production SLA or physical-failure claim','declared_completion_bound_seconds':180,'declared_payload_loss_bytes':0,'before':before,'guest_before':gb,'from_host':a.from_host,'to_host':a.to_host,'native_vm_id':M['vm_id'],'other_vm_count':len(others),'transitions':[]}
def save():
 q=OUT.with_suffix('.tmp');q.write_text(json.dumps(r,indent=2)+'\n')
 with q.open('rb') as f:os.fsync(f.fileno())
 os.replace(q,OUT)
save();start=time.monotonic()
try:
 call('one.vm.migrate',M['vm_id'],a.to_host,True,True,104,0)
 r['native_request_accepted']=True;save()
 while time.monotonic()-start<180:
  c=owned();g=guest()
  if not r['transitions'] or c!=r['transitions'][-1]:r['transitions'].append(c);save()
  assert g['boot_id']==gb['boot_id'] and g['boot_count']==gb['boot_count'],'Guest rebooted during live migration'
  assert g['state']=='READY' and g['sha256']==gb['sha256'] and g['initialized'] is False,'Guest data check failed'
  if (c['state'],c['lcm'],c['host'],c['ds'])==(3,3,a.to_host,104) and c['seq']>before['seq'] and g['heartbeat']>gb['heartbeat']+1:
   assert custody()==others,'Other VM custody changed during observation'
   r.update(result='PASS_LIVE_MIGRATION_GUEST_CONTINUITY',after=c,guest_after=g,elapsed_seconds=round(time.monotonic()-start,3),other_vm_custody_preserved=True);break
  time.sleep(.5)
 else:raise RuntimeError('Live migration exceeded qualification bound')
except Exception as e:
 r.update(result='FAIL_RECONCILIATION_REQUIRED',error=repr(e),elapsed_seconds=round(time.monotonic()-start,3))
 try:r['observed_after_error']=owned();r['guest_after_error']=guest()
 except Exception as secondary:r['secondary_error']=repr(secondary)
 raise
finally:
 r['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(r),flush=True)
