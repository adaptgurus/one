#!/usr/bin/env python3
"""One owned cold-migration observation; no existing VM lifecycle actions."""
import argparse,pathlib,json,time,datetime,socket,xmlrpc.client,xml.etree.ElementTree as E
p=argparse.ArgumentParser();p.add_argument('--from-host',type=int,required=True);p.add_argument('--to-host',type=int,required=True);args=p.parse_args()
if (args.from_host,args.to_host) not in [(4,0),(0,4)]:raise SystemExit('Only the reviewed DR4/DR1 pair is allowed')
B=pathlib.Path('/root/ls-onedrs-dr4-native-canary-20261120');M=json.loads((B/'manifest.json').read_text())
OUT=B/('cold-'+str(args.from_host)+'-to-'+str(args.to_host)+'.json')
if OUT.exists():raise SystemExit('Existing terminal or running receipt; inspect before another operation')
socket.setdefaulttimeout(15);auth=pathlib.Path('/var/lib/one/.one/one_auth').read_text().strip()
api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2',allow_none=False)
def call(method,*a):
 r=getattr(api,method)(auth,*a)
 if not r[0]:raise RuntimeError(method+': '+str(r[1])[:400])
 return r[1]
def owned():
 e=E.fromstring(call('one.vm.info',M['vm_id'],False))
 if e.findtext('NAME')!=M['run'] or e.findtext('./USER_TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')!=M['run']:raise RuntimeError('Owned VM identity mismatch')
 if e.findtext('./TEMPLATE/OS/UUID')!='1c133f56-0d0c-4d0e-aefd-1a990f71489b':raise RuntimeError('Owned VM UUID mismatch')
 h=e.findall('./HISTORY_RECORDS/HISTORY')[-1]
 return {'state':int(e.findtext('STATE')),'lcm':int(e.findtext('LCM_STATE')),'host':int(h.findtext('HID')),'ds':int(h.findtext('DS_ID')),'seq':int(h.findtext('SEQ')),'uuid':e.findtext('./TEMPLATE/OS/UUID')}
def guest():
 p=pathlib.Path(M['root'])/'console.log'
 with p.open('rb') as f:
  f.seek(max(0,p.stat().st_size-16384));data=f.read().decode(errors='replace')
 rs=[json.loads(x.split(' ',1)[1]) for x in data.splitlines() if x.startswith('LS_ONEDRS_CANARY ')]
 if not rs:raise RuntimeError('No real guest heartbeat')
 return rs[-1]
def custody():
 r=E.fromstring(call('one.vmpool.info',-2,-1,-1,-1));d={}
 for v in r:
  if v.findtext('ID')==str(M['vm_id']):continue
  hs=v.findall('./HISTORY_RECORDS/HISTORY');h=hs[-1] if hs else E.Element('HISTORY')
  d[v.findtext('ID')]={k:v.findtext(k) for k in ['NAME','STATE','LCM_STATE','DEPLOY_ID']}
  d[v.findtext('ID')].update(host=h.findtext('HID'),ds=h.findtext('DS_ID'),seq=h.findtext('SEQ'))
 return d
before=owned();gb=guest();others=custody()
if (before['state'],before['lcm'],before['host'],before['ds'])!=(3,3,args.from_host,104):raise SystemExit('Owned VM is not in the reviewed source state')
if gb['state']!='READY' or gb['sha256']!='5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a':raise SystemExit('Guest payload not healthy')
host=E.fromstring(call('one.host.info',args.to_host,False))
if host.findtext('NAME')!={0:'172.17.60.80',4:'172.17.60.88'}[args.to_host]:raise SystemExit('Target identity mismatch')
if int(host.findtext('./HOST_SHARE/MAX_CPU'))-int(host.findtext('./HOST_SHARE/CPU_USAGE'))<100:raise SystemExit('Insufficient current native CPU capacity')
if int(host.findtext('./HOST_SHARE/MAX_MEM'))-int(host.findtext('./HOST_SHARE/MEM_USAGE'))<262144:raise SystemExit('Insufficient current native memory capacity')
state={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'IN_PROGRESS','scope':'Disposable 256 MiB synthetic cold migration, not autonomous failure recovery or production workload SLA','declared_rto_seconds':180,'declared_synthetic_payload_rpo_bytes':0,'before':before,'guest_before':gb,'from_host':args.from_host,'to_host':args.to_host,'native_vm_id':M['vm_id'],'other_vm_count':len(others)}
def save():OUT.write_text(json.dumps(state,indent=2)+'\n')
save();start=time.monotonic()
try:
 call('one.vm.migrate',M['vm_id'],args.to_host,False,True,104,2)
 state['native_request_accepted']=True;save()
 while time.monotonic()-start<180:
  current=owned();g=guest()
  if (current['state'],current['lcm'],current['host'],current['ds'])==(3,3,args.to_host,104) and g.get('state')=='READY' and g.get('boot_count')==gb['boot_count']+1 and g.get('boot_id')!=gb['boot_id']:
   if g['sha256']!=gb['sha256'] or g['initialized'] is not False:raise RuntimeError('Cold migration lost existing guest payload')
   if custody()!=others:raise RuntimeError('Other native VM custody changed during canary')
   state.update(result='PASS_COLD_MIGRATION_AND_GUEST_PAYLOAD',after=current,guest_after=g,elapsed_seconds=round(time.monotonic()-start,3),other_vm_custody_preserved=True);break
  time.sleep(1)
 else:raise RuntimeError('Cold migration exceeded the declared 180-second qualification bound')
except Exception as e:
 state.update(result='FAIL',error=repr(e),elapsed_seconds=round(time.monotonic()-start,3))
 try:state['observed_after_error']=owned();state['guest_after_error']=guest()
 except Exception as secondary:state['secondary_error']=repr(secondary)
 raise
finally:
 state['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(state))
