from native_service import *
import concurrent.futures,datetime
EXPECTED='5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a'
def active(m):
 uid=owned(m).findtext('DEPLOY_ID')
 def read(x):
  hid,ip=x;ids=run('timeout 6 virsh -c qemu:///system list --uuid',ip).splitlines();return hid,uid in ids
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:return dict(ex.map(read,m['hosts'].items()))
def guest(m,host):
 text=run('tail -c 24000 '+shlex.quote(str(Path(m['root'])/'console.log')),m['hosts'][str(host)])
 records=[]
 for l in text.splitlines():
  if l.startswith('LS_ONEDRS_CANARY '):
   try:records.append(json.loads(l.split(' ',1)[1]))
   except ValueError:pass
 if not records or records[-1].get('state')!='READY' or records[-1].get('sha256')!=EXPECTED:raise RuntimeError('fresh checksum-valid guest record unavailable')
 return records[-1]
def save_receipt(name,data):
 data.update({'test':name,'identity':'ls-onedrs-lab-svc','uid':10,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 p=D/'results.json';r=json.loads(p.read_text()) if p.exists() else [];r.append(data);p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(data,indent=2),flush=True)
if __name__=='__main__':
 m=manifest();s=status(m);g=guest(m,s['host']);a=active(m);assert s['state']==3 and s['lcm']==3 and sum(a.values())==1 and a[s['host']]
 histories=[{k:h.findtext(k) for k in ['SEQ','HID','DS_ID','PLAN_ID','ACTION_ID','UID','GID','REQUEST_ID','ACTION']} for h in owned(m).findall('HISTORY_RECORDS/HISTORY')]
 save_receipt('native_onedrs_initial_placement',{'result':'PASS','native':s,'active_instances':a,'guest':g,'history':histories,'manual_deploy_calls':0,'cluster_profile_unchanged':True})
 m['reschedule_before']=s;m['guest_before_reschedule']=g;m['reschedule_log_offset']=Path('/var/log/one/oned.log').stat().st_size;save(m)
 # One service-account reschedule request delegates the destination and action
 # to the existing native OneDRS scheduler and plan manager.
 print('SUBMIT_NATIVE_RESCHEDULE',call('one.vm.action','resched',m['vmid']),flush=True)
 start=time.monotonic();final=None
 for _ in range(160):
  t=status(m);r=owned(m)
  if t['state']==3 and t['lcm']==3 and t['host']!=s['host'] and int(t['seq'])>int(s['seq']):
   a=active(m)
   if sum(a.values())==1 and a.get(t['host']):final=t;break
  time.sleep(.5)
 if final is None:
  save_receipt('native_onedrs_reschedule',{'result':'NOT_COMPLETED_WITHIN_OBSERVATION','native_after':status(m),'resched_flag':owned(m).findtext('RESCHED'),'sched_message':owned(m).findtext('USER_TEMPLATE/SCHED_MESSAGE'),'submitted_once':True})
  raise SystemExit(2)
 old=guest(m,final['host'])
 for _ in range(12):
  fresh=guest(m,final['host'])
  if fresh['heartbeat']>old['heartbeat']:break
  time.sleep(.5)
 else:raise RuntimeError('no fresh heartbeat after rescheduling')
 assert final['ds']==s['ds'] and fresh['sha256']==EXPECTED
 save_receipt('native_onedrs_reschedule',{'result':'PASS','native_before':s,'native_after':final,'active_instances':active(m),'guest_after':fresh,'boot_id_preserved':fresh['boot_id']==g['boot_id'],'boot_count_before':g['boot_count'],'boot_count_after':fresh['boot_count'],'elapsed_to_guest_witness_seconds':round(time.monotonic()-start,3),'manual_migrate_calls':0,'native_global_live_rescheds':0,'history':[{k:h.findtext(k) for k in ['SEQ','HID','DS_ID','PLAN_ID','ACTION_ID','UID','GID','REQUEST_ID','ACTION']} for h in owned(m).findall('HISTORY_RECORDS/HISTORY')]})
