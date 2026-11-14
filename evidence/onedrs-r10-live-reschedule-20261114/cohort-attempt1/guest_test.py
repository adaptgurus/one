"""One exact disposable, service-owned VM. Native placement/rescheduling only."""
from pathlib import Path
import datetime, hashlib, json, os, re, shlex, shutil, socket, subprocess, time, uuid, xml.etree.ElementTree as E, xmlrpc.client
D = Path('/var/lib/layersentry/onedrs-r10-cohort-20261114'); os.umask(0o077); socket.setdefaulttimeout(8)
HOSTS = {0: '172.17.60.80', 1: '172.17.60.81', 2: '172.17.60.82'}
AUTH = Path('/var/lib/one/.one/one_auth').read_text().strip()
SVC = Path('/var/lib/layersentry/onedrs-lab-service-20261113/one_auth').read_text().strip()
APIS = {i: xmlrpc.client.ServerProxy('http://' + ip + ':2633/RPC2') for i, ip in HOSTS.items()}
EXPECTED = '5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a'
def api(method, *args, admin=False):
    for i in HOSTS:
        r = APIS[i].one.zone.raftstatus(AUTH)
        if r[0] and E.fromstring(r[1]).findtext('STATE') == '3':
            out = getattr(APIS[i], method)(AUTH if admin else SVC, *args)
            if not out[0]: raise RuntimeError(method + ': ' + str(out[1])[:600])
            return out[1]
    raise RuntimeError('No authoritative native leader')
def shell(host, command, timeout=20):
    args = ['bash', '-lc', command] if host == 0 else ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=4', 'root@' + HOSTS[host], command]
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode: raise RuntimeError('test fixture command failed on ' + HOSTS[host] + ': ' + p.stderr[-250:])
    return p.stdout

def canonical(e): return (e.tag, (e.text or '').strip(), tuple(canonical(c) for c in e))
def inventory():
    rows = {}
    for v in E.fromstring(api('one.vmpool.info', -2, -1, -1, -1, admin=True)).findall('VM'):
        if v.findtext('STATE') == '6': continue
        hs = v.findall('HISTORY_RECORDS/HISTORY'); h = hs[-1] if hs else E.Element('HISTORY')
        rows[v.findtext('ID')] = {k: v.findtext(k) for k in ['ID', 'NAME', 'UID', 'STATE', 'LCM_STATE']} | {'host': h.findtext('HID'), 'ds': h.findtext('DS_ID'), 'seq': h.findtext('SEQ')}
    return rows

def execute():
    assert not (D / 'guest-result.json').exists(), 'Already attempted; do not replay allocation'
    run_id = 'ls-onedrs-r10-' + uuid.uuid4().hex[:12]; root = Path('/srv/layersentry-native/dr/files') / run_id
    state = {'run': run_id, 'root': str(root), 'ds': None, 'template': None, 'vm': None, 'acls': [], 'mounts': []}
    result = {'scope': 'ONE_SERVICE_OWNED_NATIVE_SCHEDULER_VM', 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'manual_deploy_calls': 0, 'manual_migrate_calls': 0, 'DR4_touched': False}
    save = lambda: (D / 'guest-manifest.json').write_text(json.dumps(state, indent=2) + '\n')
    before = inventory(); policy = canonical(E.fromstring(api('one.cluster.info', 0, False, admin=True)).find('TEMPLATE/ONE_DRS'))
    original_ids = set(before); result['original_VM_count'] = len(before)
    guest_uuid = None; cleanup_errors = []
    def own():
        r = E.fromstring(api('one.vm.info', state['vm'], False))
        assert r.findtext('NAME') == run_id and r.findtext('UID') == '10' and r.findtext('USER_TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID') == run_id
        return r
    def status():
        r = own(); hs = r.findall('HISTORY_RECORDS/HISTORY'); h = hs[-1] if hs else E.Element('HISTORY')
        return {'state': r.findtext('STATE'), 'lcm': r.findtext('LCM_STATE'), 'host': h.findtext('HID'), 'ds': h.findtext('DS_ID'), 'seq': h.findtext('SEQ'), 'uuid': r.findtext('DEPLOY_ID'), 'resched': r.findtext('RESCHED')}
    def wait_vm(predicate, seconds=120):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            current = status()
            if predicate(current): return current
            time.sleep(1)
        message = own().findtext('USER_TEMPLATE/SCHED_MESSAGE')
        raise RuntimeError('native scheduler deadline: ' + json.dumps(current) + '; ' + str(message)[:500])
    def witness():
        records = []
        p = root / 'console.log'
        if p.exists():
            with p.open('rb') as f:
                f.seek(max(0, p.stat().st_size - 65536)); text = f.read().decode(errors='replace')
            for line in text.splitlines():
                if line.startswith('LS_ONEDRS_CANARY '):
                    try: records.append(json.loads(line.split(' ', 1)[1]))
                    except ValueError: pass
        if not records or records[-1].get('state') != 'READY' or records[-1].get('sha256') != EXPECTED: return None
        return records[-1]
    def instances(identity):
        return {str(h): identity in shell(h, 'timeout 8 virsh -c qemu:///system list --uuid').split() for h in HOSTS}
    try:
        assert all((x['STATE'], x['LCM_STATE']) in [('3','3'), ('8','0')] for x in before.values())
        assert not root.exists() and not root.is_symlink(); root.mkdir(mode=0o750); os.chown(root,9869,9869)
        for name in ['boot', 'system']:
            p = root / name; p.mkdir(mode=0o750); os.chown(p,9869,9869)
        (root / 'system/owner-witness').write_text(run_id); os.chown(root / 'system/owner-witness',9869,9869)
        kernel = Path('/boot/vmlinuz-5.14.0-687.52.1.el9_8.x86_64')
        initrd = Path('/root/onedrs-native-data-canary-20261113/initramfs-v1.gz')
        for source, name in [(kernel,'vmlinuz'), (initrd,'initramfs.gz')]:
            target=root/'boot'/name; shutil.copy2(source,target); os.chown(target,9869,9869); os.chmod(target,0o644)
        save()
        ds_template=f'NAME="{run_id}-system"\nTYPE="SYSTEM_DS"\nTM_MAD="shared"\nDISK_TYPE="FILE"\nSHARED="YES"\nNFS_AUTO_ENABLE="NO"\nLAYERSENTRY_LAB_ONLY="YES"\nLAYERSENTRY_LAB_OPERATION_ID="{run_id}"\n'
        state['ds']=int(api('one.datastore.allocate',ds_template,0,admin=True)); save(); ds=state['ds']
        for h in HOSTS:
            p=f'/var/lib/one/datastores/{ds}'; q=shlex.quote(p); source=shlex.quote(str(root/'system'))
            shell(h,f'set -e; test ! -L {q}; if test -d {q}; then test -z "$(ls -A {q})"; else mkdir {q}; fi; ! mountpoint -q {q}; mount --bind {source} {q}; test "$(cat {q}/owner-witness)" = {shlex.quote(run_id)}')
            state['mounts'].append(h); save()
        template=(Path('/root/onedrs-scheduler-features-20261113/vm.template').read_text().replace('ls-onedrs-sched-6f909d40d06c-approved',run_id+'-template').replace('ls-onedrs-sched-6f909d40d06c',run_id).replace('SCHED_REQUIREMENTS="ID = 0"','SCHED_REQUIREMENTS="ID = 0 | ID = 1 | ID = 2"').replace('SCHED_DS_REQUIREMENTS="ID = 116"',f'SCHED_DS_REQUIREMENTS="ID = {ds}"'))
        state['template']=int(api('one.template.allocate',template,admin=True)); save()
        for resource,identity in [('DATASTORE',ds),('TEMPLATE',state['template'])]:
            rule=f'#10 {resource}/#{identity} USE #0'; out=shell(0,'oneacl create '+shlex.quote(rule)); match=re.search(r'ID:\s*(\d+)',out)
            assert match, 'ACL creation result requires reconciliation'; state['acls'].append({'id':int(match.group(1)),'rule':rule}); save()
        state['vm']=int(api('one.template.instantiate',state['template'],run_id,True,'',False)); save()
        assert own().findtext('STATE')=='2'
        start=time.monotonic(); api('one.vm.action','release',state['vm'])
        initial=wait_vm(lambda s:s['state']=='3' and s['lcm']=='3')
        guest_uuid=initial['uuid']; assert guest_uuid
        end=time.monotonic()+45
        while time.monotonic()<end and witness() is None: time.sleep(1)
        g=witness(); assert g is not None, 'Guest has no checksum-valid READY record'
        active=instances(guest_uuid); assert sum(active.values())==1 and active[initial['host']]
        result['initial_placement']={'native':initial,'guest':g,'active_instances':active,'seconds_to_guest_witness':round(time.monotonic()-start,3)}
        print('R10_NATIVE_INITIAL_PLACEMENT_PASS',json.dumps(initial),flush=True)
        start=time.monotonic(); api('one.vm.action','resched',state['vm'])
        final=wait_vm(lambda s:s['state']=='3' and s['lcm']=='3' and s['host']!=initial['host'] and int(s['seq'])>int(initial['seq']),150)
        at=instances(guest_uuid); assert sum(at.values())==1 and at[final['host']]
        observed=witness(); end=time.monotonic()+20
        while time.monotonic()<end:
            fresh=witness()
            if fresh and observed and fresh['heartbeat']>observed['heartbeat']: break
            time.sleep(.5)
        else: raise RuntimeError('No advancing checksum-valid guest heartbeat after rescheduling')
        assert final['ds']==initial['ds']
        result['native_reschedule']={'before':initial,'after':final,'guest_after':fresh,'active_instances':at,'seconds_to_guest_witness':round(time.monotonic()-start,3),'boot_id_preserved':fresh['boot_id']==g['boot_id'],'native_live_rescheds':0,'not_physical_failure_RTO':True}
        result['history']=[{k:h.findtext(k) for k in ['SEQ','HID','DS_ID','PLAN_ID','ACTION_ID','UID','GID','REQUEST_ID','ACTION']} for h in own().findall('HISTORY_RECORDS/HISTORY')]
        result['result']='PASS_NATIVE_PLACEMENT_AND_RESCHEDULE'; print('R10_NATIVE_RESCHEDULE_PASS',json.dumps(result['native_reschedule']),flush=True)
    except BaseException as ex:
        result['result']='FAIL'; result['error']=str(ex)
    finally:
        # Do not touch any pre-existing VM or any shared NFS parent.
        try:
            if state['vm'] is not None:
                r=own(); guest_uuid=r.findtext('DEPLOY_ID') or guest_uuid
                if r.findtext('RESCHED')=='1': api('one.vm.action','unresched',state['vm'])
                if r.findtext('STATE')!='6': api('one.vm.action','terminate-hard',state['vm']); wait_vm(lambda s:s['state']=='6',90)
                if guest_uuid:
                    assert all(guest_uuid not in shell(h,'timeout 8 virsh -c qemu:///system list --all --uuid').split() for h in HOSTS)
                result['owned_VM_DONE']=True
            if state['template'] is not None:
                t=E.fromstring(api('one.template.info',state['template'],admin=True)); assert t.findtext('TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==run_id
                api('one.template.delete',state['template'],False,admin=True)
            for h in reversed(state['mounts']):
                p=f'/var/lib/one/datastores/{state["ds"]}'; q=shlex.quote(p)
                shell(h,f'set -e; test ! -L {q}; test "$(cat {q}/owner-witness)" = {shlex.quote(run_id)}; umount {q}; rmdir {q}')
            if state['ds'] is not None:
                t=E.fromstring(api('one.datastore.info',state['ds'],admin=True)); assert t.findtext('TEMPLATE/LAYERSENTRY_LAB_OPERATION_ID')==run_id
                api('one.datastore.delete',state['ds'],admin=True)
            for a in state['acls']: api('one.acl.delrule',a['id'],admin=True)
            # Retain only this small marked run subtree for diagnostics; no shared storage deletion.
            result['owned_NFS_diagnostic_root_retained']=str(root); result['native_objects_and_bind_mounts_cleaned']=True
        except BaseException as ex: cleanup_errors.append(str(ex))
        after=inventory(); result['original_VM_records_preserved']=all(after.get(i)==v for i,v in before.items())
        result['original_HA_policy_preserved']=canonical(E.fromstring(api('one.cluster.info',0,False,admin=True)).find('TEMPLATE/ONE_DRS'))==policy
        result['foreign_new_VM_ids']=sorted(set(after)-original_ids-({str(state['vm'])} if state['vm'] is not None else set()))
        result['cleanup_errors']=cleanup_errors; result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        (D/'guest-result.json').write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps(result,indent=2),flush=True)
    if result['result']!='PASS_NATIVE_PLACEMENT_AND_RESCHEDULE' or cleanup_errors or not result['original_VM_records_preserved'] or not result['original_HA_policy_preserved']: raise RuntimeError('Native guest qualification failed; inspect guest-result.json')
    return result
if __name__=='__main__': execute()
