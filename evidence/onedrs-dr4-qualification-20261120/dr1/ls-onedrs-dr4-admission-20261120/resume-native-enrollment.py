#!/usr/bin/env python3
"""Enroll DR4 in a disabled, separately scoped native qualification cluster."""
import pathlib,json,datetime,socket,xmlrpc.client,xml.etree.ElementTree as E
B=pathlib.Path('/root/ls-onedrs-dr4-admission-20261120')
OUT=B/'native-enrollment-r2.json'
RUN='ls-onedrs-dr4-qualification-20261120'
socket.setdefaulttimeout(20)
auth=pathlib.Path('/var/lib/one/.one/one_auth').read_text().strip()
api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2',allow_none=False)
def call(method,*args):
 r=getattr(api,method)(auth,*args)
 if not isinstance(r,list) or not r[0]:raise RuntimeError(method+': '+str(r[1])[:300])
 return r[1]
def save():OUT.write_text(json.dumps(state,indent=2)+'\n')
def custody():
 root=E.fromstring(call('one.vmpool.info',-2,-1,-1,-1))
 out={}
 for vm in root:
  hs=vm.findall('./HISTORY_RECORDS/HISTORY'); h=hs[-1] if hs else E.Element('HISTORY')
  out[vm.findtext('ID')]={'name':vm.findtext('NAME'),'state':vm.findtext('STATE'),'lcm':vm.findtext('LCM_STATE'),'deploy':vm.findtext('DEPLOY_ID'),'uuid':vm.findtext('./TEMPLATE/OS/UUID'),'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ')}
 return out
assert not OUT.exists(), 'Enrollment already attempted; inspect receipt'
clusters=E.fromstring(call('one.clusterpool.info'))
hosts=E.fromstring(call('one.hostpool.info'))
assert [c.findtext('ID') for c in clusters if c.findtext('NAME')==RUN]==['103']
owned=E.fromstring(call('one.cluster.info',103,False))
assert not owned.findall('./HOSTS/ID') and not owned.findall('./DATASTORES/ID') and not owned.findall('./VNETS/ID')
assert all(h.findtext('NAME') not in ['172.17.60.88','dr4'] for h in hosts)
before=custody()
assert all(v['state']=='8' and v['lcm']=='0' or v['state']=='3' and v['lcm']=='3' for v in before.values()), 'Existing VM is transitional'
(B/'native-custody-before-enrollment.json').write_text(json.dumps(before,indent=2)+'\n')
state={'run':RUN,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'IN_PROGRESS','original_vm_count':len(before),'original_cluster_changed':False}
save()
try:
 cid=103;state['cluster_id']=cid;save()
 call('one.cluster.update',cid,'LAYERSENTRY_LAB_ONLY="YES"\nLAYERSENTRY_OWNER="OneDRS qualification"\nLAYERSENTRY_LAB_OPERATION_ID="'+RUN+'"\nONE_DRS=[ENABLED="no",AUTOMATION="manual",POLICY="balance"]',1)
 hid=call('one.host.allocate','172.17.60.88','kvm','kvm',cid);state['host_id']=hid;save()
 call('one.host.status',hid,1)
 template='RESERVED_CPU="2200"\nRESERVED_MEM="49283072"\nLAYERSENTRY_DRS_READY="NO"\nLAYERSENTRY_PHYSICAL_DOMAIN_VERIFIED="NO"\nLAYERSENTRY_LAB_ONLY="YES"\nLAYERSENTRY_LAB_OPERATION_ID="'+RUN+'"\nLAYERSENTRY_RESERVATION_REASON="18 vCPU and 39 GiB existing OVN guests plus 4 CPU and 8 GiB host headroom"'
 call('one.host.update',hid,template,1)
 for ds in [104,105]:call('one.cluster.adddatastore',cid,ds)
 host=E.fromstring(call('one.host.info',hid,False))
 assert host.findtext('NAME')=='172.17.60.88' and host.findtext('CLUSTER_ID')==str(cid)
 assert host.findtext('STATE') in ['4','7']
 assert host.findtext('./TEMPLATE/LAYERSENTRY_DRS_READY')=='NO'
 after=custody()
 assert before==after,'Original VM custody changed during enrollment'
 state.update(result='ENROLLED_DISABLED_AWAITING_MONITOR_AND_NATIVE_VM_QUALIFICATION',original_vm_custody_preserved=True,reserved_cpu=2200,reserved_memory_kib=49283072,datastores=[104,105],automatic_scheduling=False)
except Exception as e:
 state.update(result='FAIL',error=repr(e))
 if 'host_id' in state:
  try:call('one.host.status',state['host_id'],1);state['host_left_disabled']=True
  except Exception as ex:state['disable_error']=repr(ex)
 raise
finally:
 state['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(state))
