"""Finite read-only original-r8 stability observation; NOT candidate stress/soak."""
from pathlib import Path
import datetime,hashlib,json,os,socket,subprocess,time,xml.etree.ElementTree as E,xmlrpc.client
os.umask(0o077);socket.setdefaulttimeout(4)
D=Path('/var/lib/layersentry/onedrs-postrestore-validation-20261114')
OLD=Path('/var/lib/layersentry/onedrs-r10-cohort-r3-20261114')
AUTH=Path('/var/lib/one/.one/one_auth').read_text().strip()
IPS={0:'172.17.60.80',1:'172.17.60.81',2:'172.17.60.82'}
APIS={i:xmlrpc.client.ServerProxy('http://'+ip+':2633/RPC2') for i,ip in IPS.items()}
expected=json.loads((OLD/'cohort-vm-before.json').read_text())
base='d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1'
result={'scope':'READ_ONLY_ORIGINAL_R8_POST_RESTORATION_OBSERVATION_NOT_R10_STRESS_OR_PRODUCTION_SOAK','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requested_seconds':900,'sample_interval_seconds':5,'samples':0,'management_checks':0,'max_commit_gap':0,'mutation_calls':0,'errors':[]}
start=time.monotonic();initial_term=None;last_commits={};initial_pids=None

def call(i,method,*args):
 r=getattr(APIS[i],method)(AUTH,*args)
 if not r[0]:raise RuntimeError(method+' read failed')
 return r[1]

def native_inventory():
 current={}
 for v in E.fromstring(call(0,'one.vmpool.info',-2,-1,-1,-1)).findall('VM'):
  if v.findtext('STATE')=='6':continue
  hs=v.findall('HISTORY_RECORDS/HISTORY');h=hs[-1] if hs else E.Element('HISTORY')
  current[v.findtext('ID')]={k:v.findtext(k) for k in ['ID','NAME','UID','STATE','LCM_STATE']}|{'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ')}
 if not all(current.get(k)==v for k,v in expected.items()):raise RuntimeError('original VM state or placement changed')
 return len(current)

node=r'''from pathlib import Path
import subprocess,json,hashlib
D=Path('/var/lib/layersentry/onedrs-r10-cohort-r3-20261114');s=json.loads((D/'actor-state.json').read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
pid=int(subprocess.check_output(['systemctl','show','opennebula','-p','MainPID','--value'],text=True))
print(json.dumps({'pid':pid,'installed':sha('/usr/bin/oned'),'running':sha('/proc/'+str(pid)+'/exe'),'driver_ok':sha('/var/lib/one/remotes/vmm/kvm/deploy')==s['driver_sha'],'guards_ok':all(sha(p)==d for p,d in s['guards'].items()),'services_ok':all(subprocess.run(['systemctl','is-active','--quiet',u]).returncode==0 for u in s['active_units']),'domains_ok':sorted(subprocess.check_output(['virsh','-c','qemu:///system','list','--uuid'],text=True).split())==s['domain_uuids'],'key_absent':subprocess.run(['rpm','-q','gpg-pubkey-aa428403'],capture_output=True).returncode!=0,'selinux':subprocess.check_output(['getenforce'],text=True).strip()}))'''

def node_checks():
 rows={}
 for i,ip in IPS.items():
  cmd=['python3','-c',node] if i==0 else ['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=4','root@'+ip,'python3 - <<\'END\'\n'+node+'\nEND']
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=20)
  if p.returncode:raise RuntimeError('read-only host check failed on '+str(i))
  r=json.loads(p.stdout);rows[str(i)]=r
  if not (r['installed']==base and r['running']==base and r['selinux']=='Enforcing' and all(r[k] for k in ['driver_ok','guards_ok','services_ok','domains_ok','key_absent'])):raise RuntimeError('restored native state drift on '+str(i))
 return rows

try:
 initial_nodes=node_checks();initial_pids={k:v['pid'] for k,v in initial_nodes.items()};(D/'initial-nodes.json').write_text(json.dumps(initial_nodes,indent=2)+'\n')
 for n in range(181):
  target=start+n*5
  if target>time.monotonic():time.sleep(target-time.monotonic())
  states={}
  for i in IPS:
   root=E.fromstring(call(i,'one.zone.raftstatus'));r={k:int(root.findtext(k)) for k in ['SERVER_ID','STATE','TERM','COMMIT','LOG_INDEX']}
   if r['SERVER_ID']!=i or r['STATE']!=(3 if i==0 else 2) or r['LOG_INDEX']<r['COMMIT']:raise RuntimeError('raft identity/state/geometry changed')
   if i in last_commits and r['COMMIT']<last_commits[i]:raise RuntimeError('commit regression')
   last_commits[i]=r['COMMIT'];states[str(i)]=r
  terms={r['TERM'] for r in states.values()}
  if len(terms)!=1:raise RuntimeError('raft term disagreement')
  term=next(iter(terms))
  if initial_term is None:initial_term=term
  if term!=initial_term:raise RuntimeError('leadership term changed during restored-state observation')
  gap=max(r['COMMIT'] for r in states.values())-min(r['COMMIT'] for r in states.values());result['max_commit_gap']=max(result['max_commit_gap'],gap)
  sample={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsed_seconds':round(time.monotonic()-start,3),'raft':states,'sampled_commit_gap':gap}
  if n%6==0 or n==180:
   if E.fromstring(call(0,'one.zone.info',0)).findtext('STATE')!='0':raise RuntimeError('zone no longer enabled')
   hosts=E.fromstring(call(0,'one.hostpool.info')).findall('HOST')
   if {int(h.findtext('ID')) for h in hosts}!={0,1,2} or not all(h.findtext('STATE') in ['1','2'] for h in hosts):raise RuntimeError('native host monitoring changed')
   sample['VM_count']=native_inventory();nodes=node_checks()
   if {k:v['pid'] for k,v in nodes.items()}!=initial_pids:raise RuntimeError('controller restarted during observation')
   sample['nodes']=nodes;result['management_checks']+=1
  with (D/'samples.jsonl').open('a') as f:f.write(json.dumps(sample)+'\n')
  result['samples']+=1
  if n%12==0:print('READ_ONLY_PROGRESS',n,round(time.monotonic()-start,1),'seconds; original-r8; no workload mutations',flush=True)
 result['result']='PASS_15_MINUTE_ORIGINAL_R8_READ_ONLY_STABILITY'
except Exception as ex:
 result['result']='FAIL_POSTRESTORE_OBSERVATION';result['errors'].append(str(ex))
finally:
 result.update({'elapsed_seconds':round(time.monotonic()-start,3),'ended_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'initial_term':initial_term,'initial_pids':initial_pids})
 (D/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if result['errors']:raise SystemExit(1)
