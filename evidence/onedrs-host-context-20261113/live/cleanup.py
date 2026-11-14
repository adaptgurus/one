from native_service import *
from scheduler_acceptance import active,guest
import shutil,datetime
m=manifest();root=Path(m['root']);vid=m['vmid'];dsid=m['dsid'];tid=m['template_id']
assert root.parent==Path('/srv/layersentry-native/dr/files') and root.name==m['run'] and root.name.startswith('ls-onedrs-sched-') and not root.is_symlink()
r=owned(m);s=status(m);assert s['state']==3 and s['lcm']==3 and r.findtext('RESCHED')=='0'
uuid=r.findtext('DEPLOY_ID');assert uuid and sum(active(m).values())==1
(D/'guest-before-cleanup.json').write_text(json.dumps(guest(m,s['host']),indent=2)+'\n')
(D/'vm-before-cleanup.xml').write_text(E.tostring(r,encoding='unicode'))
(D/'native-vm-complete.log').write_text(Path('/var/log/one/'+str(vid)+'.log').read_text(errors='replace'))
with Path('/var/log/one/oned.log').open(errors='replace') as f:f.seek(m['scheduler_log_offset']);text=f.read()
(D/'native-scheduler-bounded.log').write_text('\n'.join(l for l in text.splitlines() if any(x in l for x in ['Scheduler place','resilience admission','VM '+str(vid),'Placing VM']))+'\n')
print('TERMINATE_EXACT_OWNED_VM_WITH_SERVICE_IDENTITY',call('one.vm.action','terminate-hard',vid),flush=True)
s=wait(m,lambda s:s['state']==6)
for hid,ip in m['hosts'].items():
 ids=run('timeout 8 virsh -c qemu:///system list --all --uuid',ip).splitlines();assert uuid not in ids
(D/'vm-final.xml').write_text(E.tostring(owned(m),encoding='unicode'))
# Delete only admin-prepared objects with this exact run's ownership marker.
t=E.fromstring(call('one.template.info',tid,admin=True));assert t.findtext('TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==m['run']
call('one.template.delete',tid,False,admin=True)
d=E.fromstring(call('one.datastore.info',dsid,admin=True));assert d.findtext('TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==m['run']
for ent in m['mounts']:
 p=ent['path'];assert p==f'/var/lib/one/datastores/{dsid}'
 cmd='set -e; test ! -L '+shlex.quote(p)+'; test "$(cat '+shlex.quote(p+'/owner-witness')+')" = '+shlex.quote(m['run'])+'; umount '+shlex.quote(p)+'; ! mountpoint -q '+shlex.quote(p)+'; rmdir '+shlex.quote(p)
 run(cmd,ent['host'])
call('one.datastore.delete',dsid,admin=True)
assert not request('one.datastore.info',dsid,admin=True)[0]
aclpool=E.fromstring(call('one.acl.info',admin=True));rows={int(x.findtext('ID')):x for x in aclpool.findall('ACL')}
for a in m['temporary_acls']:
 if a['id'] in rows:
  assert int(rows[a['id']].findtext('USER'),16)==(0x100000000|m['uid'])
  call('one.acl.delrule',a['id'],admin=True)
shutil.rmtree(root)
before=json.loads((D/'original-vms.json').read_text());after=[]
for v in E.fromstring(call('one.vmpool.info',-2,-1,-1,-1,admin=True)).findall('VM'):
 if v.findtext('STATE')=='6':continue
 hs=v.findall('HISTORY_RECORDS/HISTORY');h=hs[-1] if hs else E.Element('HISTORY')
 after.append({k:v.findtext(k) for k in ['ID','NAME','UID','STATE','LCM_STATE']}|{'host':h.findtext('HID'),'ds':h.findtext('DS_ID'),'seq':h.findtext('SEQ')})
def key(rows):return sorted(rows,key=lambda r:int(r['ID']))
def tree(e):return (e.tag,(e.text or '').strip(),tuple(tree(c) for c in e))
cluster=E.fromstring(call('one.cluster.info',0,False,admin=True)).find('TEMPLATE')
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'vmid':vid,'dsid':dsid,'template_id':tid,'native_VM_DONE':s['state']==6,'test_domain_absent_on_DR1_DR2_DR3':True,'owned_bind_mounts_removed':len(m['mounts']),'test_datastore_template_and_object_acls_deleted':True,'owned_NFS_subtree_deleted':not root.exists(),'all_original_VM_identity_state_host_ds_history_preserved':key(before)==key(after),'original_VM_count':len(before),'original_HA_profile_preserved':tree(E.fromstring((D/'original-cluster-template.xml').read_text()))==tree(cluster),'initial_native_placement':'PASS','native_reschedule':'BLOCKED_BY_FILTERED_HOST_POOL_MINIMUM','no_manual_deploy_or_migration_fallback':True,'DR4_enrollment_not_touched':True}
(D/'cleanup-preservation.json').write_text(json.dumps(receipt,indent=2)+'\n');m['cleanup_complete']=True;save(m)
print(json.dumps(receipt,indent=2),flush=True)
assert receipt['all_original_VM_identity_state_host_ds_history_preserved'] and receipt['original_HA_profile_preserved']
