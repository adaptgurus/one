"""DR4-only NetworkManager bridge activation with timed local recovery.
Original profiles, NAT bridge, guests, and storage contents are preserved.
"""
import concurrent.futures, datetime, fcntl, hashlib, json, os, pathlib, subprocess, sys, time, secrets
D = pathlib.Path('/root/ls-onedrs-dr4-bridge-20261120')
OLD = 'b2e5871a-c7ca-3412-9ebd-a839d1a3fa34'
BR = 'ls-onedrs-dr4-br-mgmt-20261120'
PORT = 'ls-onedrs-dr4-br-port-20261120'
IFACE = 'enp6s18'
IP = '172.17.60.88'
MAC = 'bc:24:11:3b:38:0f'
BUS = ['busctl','call','org.freedesktop.NetworkManager','/org/freedesktop/NetworkManager','org.freedesktop.NetworkManager']
IPS = ['172.17.60.65','172.17.60.80','192.168.122.102','192.168.122.103','192.168.122.104','192.168.122.105','192.168.122.181','192.168.122.179','192.168.122.254','192.168.122.125']
EXPECTED_NAMES = sorted(['ls-ovn26-canary-a-20261109','ls-ovn26-canary-b-20261109','ls-ovn26-canary-c-20261109','ls-ovn26-canary-d-20261109','ls-ovn26-rpmbuilder-20261110','ls-ovn26-gen106-signed-rpm-qa-20261112','ls-ovn26-gen109-native-20261113','ls-ovn26-ipv6-feature-20261113'])
os.umask(0o077)
def require(ok, message):
    if not ok: raise RuntimeError(message)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name, value):
    p = D / (name + '.next')
    with p.open('w') as f:
        json.dump(value,f,indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
    p.replace(D/name)
def event(label, args, timeout=25, check=True):
    p = subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    with (D/'actions.jsonl').open('a') as f:
        f.write(json.dumps({'utc':now(),'label':label,'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})+'\n');f.flush();os.fsync(f.fileno())
    if check: require(p.returncode==0,label+' failed; see private actions.jsonl')
    return p.stdout.strip()
def out(args, timeout=12):
    return subprocess.check_output(args,text=True,timeout=timeout,stdin=subprocess.DEVNULL).strip()
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def nm(*args): return event('nmcli', ['nmcli','--wait','15']+list(args))
def domains():
    names=sorted(out(['virsh','list','--name']).split())
    require(names==EXPECTED_NAMES,'Original eight guest names changed')
    return {n:{'uuid':out(['virsh','domuuid',n]),'xml_sha256':digest(out(['virsh','dumpxml','--inactive',n])),
               'pid':int(pathlib.Path('/run/libvirt/qemu/'+n+'.pid').read_text())} for n in names}
def ping(ip):
    p=subprocess.run(['ping','-n','-c','1','-W','2',ip],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=4)
    return ip,p.returncode==0
def probes():
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: return dict(pool.map(ping,IPS))
def profiles():
    result={}
    for name in [OLD,'ls-dr4-br-mgmt-prepared-20261025','ls-dr4-br-port-prepared-20261025']:
        fields='connection,ipv4,ipv6,802-3-ethernet' if name==OLD else 'connection,ipv4,ipv6'
        raw=out(['nmcli','-t','-f',fields,'con','show',name])
        result[name]=digest('\n'.join(line for line in raw.splitlines() if not line.startswith('connection.timestamp:')))
    return result
def profile_absent(name):
    return subprocess.run(['nmcli','con','show',name],capture_output=True,timeout=10).returncode!=0
def original_network(s):
    addrs={a['ifname']:a for a in s['addresses']}
    return (addrs.get(IFACE,{}).get('address')==MAC and
      any(a.get('local')==IP and a.get('prefixlen')==26 for a in addrs.get(IFACE,{}).get('addr_info',[])) and
      not addrs.get(IFACE,{}).get('master') and
      any(r.get('dst')=='default' and r.get('dev')==IFACE and r.get('gateway')=='172.17.60.65' for r in s['routes']) and
      any(r.get('dst')=='10.246.40.0/24' and r.get('dev')==IFACE and r.get('gateway')=='172.17.60.71' and r.get('metric')==40 for r in s['routes']))
def snapshot():
    return {'domains':domains(),'nat_xml_sha256':digest(out(['virsh','net-dumpxml','default'])),
            'addresses':json.loads(out(['ip','-j','address','show'])),
            'routes':json.loads(out(['ip','-j','route','show'])),
            'ping':probes()}
def valid_bridge(s):
    addrs={a['ifname']:a for a in s['addresses']}
    return (addrs.get('br-mgmt',{}).get('address')==MAC and any(a.get('local')==IP and a.get('prefixlen')==26 for a in addrs.get('br-mgmt',{}).get('addr_info',[]))
      and not any(a.get('family')=='inet' for a in addrs.get(IFACE,{}).get('addr_info',[]))
      and addrs.get(IFACE,{}).get('master')=='br-mgmt'
      and any(r.get('dst')=='default' and r.get('gateway')=='172.17.60.65' and r.get('dev')=='br-mgmt' for r in s['routes'])
      and any(r.get('dst')=='10.246.40.0/24' and r.get('gateway')=='172.17.60.71' and r.get('dev')=='br-mgmt' for r in s['routes']))
def preserved(s, before):
    return s['domains']==before['domains'] and s['nat_xml_sha256']==before['nat_xml_sha256'] and all(s['ping'].values())
def recover(reason):
    state=json.loads((D/'state.json').read_text()) if (D/'state.json').exists() else {}
    if state.get('status') in ('COMMITTED','ROLLED_BACK'): return
    if not state.get('mutation_started'): return
    errors=[]
    for label,cmd in [('down-owned-port',['nmcli','--wait','15','con','down',PORT]),
                      ('down-owned-bridge',['nmcli','--wait','15','con','down',BR])]:
        try: event(label,cmd,check=False)
        except Exception as e: errors.append(str(e))
    if state.get('checkpoint'):
        try: event('native-checkpoint-rollback',BUS+['CheckpointRollback','o',state['checkpoint']],check=False)
        except Exception as e: errors.append(str(e))
    try:
        nm('con','mod',OLD,'connection.autoconnect','yes')
        if out(['nmcli','-g','GENERAL.CON-UUID','dev','show',IFACE])!=OLD: nm('con','up',OLD)
        event('restore-original-route',['ip','route','replace','10.246.40.0/24','via','172.17.60.71','dev',IFACE,'metric','40'])
        for profile in [BR,PORT]: event('owned-autoconnect-off',['nmcli','con','mod',profile,'connection.autoconnect','no'],check=False)
        after=snapshot(); save('rollback-readback.json',after)
        original=json.loads((D/'before.json').read_text())
        require(preserved(after,original),'Guest/NAT/ping mismatch after recovery')
        require(original_network(after),'Original address/MAC/gateway/secondary route not restored')
        state.update(status='ROLLED_BACK',reason=reason,ended_utc=now(),recovery_errors=errors)
    except Exception as e:
        state.update(status='RECOVERY_FAILED',reason=reason,error=str(e),ended_utc=now(),recovery_errors=errors)
    save('state.json',state)
def prepare():
    if (D/'before.json').exists():
        require(json.loads((D/'state.json').read_text())['status']=='PREPARED','Already attempted; refuse recapture')
        require(preserved(snapshot(),json.loads((D/'before.json').read_text())),'Original preflight drift')
    require(not pathlib.Path('/sys/class/net/br-mgmt').exists(),'br-mgmt already exists; reconcile')
    require(out(['hostname'])=='dr4','Wrong host')
    require(pathlib.Path('/sys/class/net/'+IFACE+'/address').read_text().strip()==MAC,'Wrong uplink MAC')
    require(out(['nmcli','-g','GENERAL.CON-UUID','dev','show',IFACE])==OLD,'Uplink profile changed')
    before=snapshot();require(all(before['ping'].values()),'Preflight reachability failed')
    require(any(r.get('dst')=='default' and r.get('dev')==IFACE and r.get('gateway')=='172.17.60.65' for r in before['routes']),'Unexpected gateway')
    require(any(r.get('dst')=='10.246.40.0/24' and r.get('gateway')=='172.17.60.71' for r in before['routes']),'Secondary route missing')
    before['profile_hashes']=profiles();before['validation_schema']=2
    require(profile_absent(BR) and profile_absent(PORT) and not (D/'external-ack.json').exists(),'Owned profile or acknowledgement already exists')
    require(original_network(before),'Original network mismatch')
    save('before.json',before)
    event('backup-profiles',['tar','--acls','--xattrs','-cpf',str(D/'network-profiles-before.tar'),'/etc/NetworkManager/system-connections'])
    save('state.json',{'status':'PREPARED','host_uuid':pathlib.Path('/sys/class/dmi/id/product_uuid').read_text().strip(),'started_utc':now(),'mutation_started':False,'activation_id':secrets.token_hex(16)})
    print('PREPARED_WITH_8_GUESTS_AND_10_REACHABILITY_PROBES',flush=True)
def apply():
    state=json.loads((D/'state.json').read_text());require(state['status']=='PREPARED','Never replay apply')
    require(state['host_uuid']==pathlib.Path('/sys/class/dmi/id/product_uuid').read_text().strip(),'Host identity changed')
    before=json.loads((D/'before.json').read_text());fresh=snapshot()
    require(preserved(fresh,before) and original_network(fresh),'Preflight network/guest drift')
    require(before.get('validation_schema')==2 and profiles()==before['profile_hashes'],'Profile drift since preflight')
    require(out(['nmcli','-g','GENERAL.CON-UUID','dev','show',IFACE])==OLD,'Original profile no longer active')
    require(profile_absent(BR) and profile_absent(PORT) and not (D/'external-ack.json').exists(),'Owned profile or acknowledgement already exists')
    state['mutation_started']=True;state['status']='PREPARING_OWNED_LINK';save('state.json',state)
    try:
        nm('con','clone','ls-dr4-br-mgmt-prepared-20261025',BR)
        nm('con','clone','ls-dr4-br-port-prepared-20261025',PORT)
        bruuid=out(['nmcli','-g','connection.uuid','con','show',BR])
        nm('con','mod',BR,'connection.autoconnect','no','connection.zone','public','connection.autoconnect-ports','0',
           '802-3-ethernet.cloned-mac-address',MAC,'bridge.stp','no','ipv4.method','disabled',
           'ipv4.addresses','','ipv4.gateway','','ipv4.dns','','ipv4.routes','','ipv6.method','disabled')
        nm('con','mod',PORT,'connection.controller',bruuid,'connection.autoconnect','no','connection.zone','public')
        nm('con','up',BR)
        require(original_network(snapshot()),'Address-free bridge preparation disturbed original uplink')
        device=json.loads(out(BUS+['GetDeviceByIpIface','s',IFACE])[2:])
        bridge_device=json.loads(out(BUS+['GetDeviceByIpIface','s','br-mgmt'])[2:])
        state['checkpoint']=json.loads(event('native-checkpoint-create',BUS+['CheckpointCreate','aouu','2',device,bridge_device,'210','0'])[2:])
        state['status']='APPLYING';save('state.json',state)
        nm('con','mod',BR,'ipv4.method','manual','ipv4.addresses','172.17.60.88/26',
           'ipv4.gateway','172.17.60.65','ipv4.dns','192.168.14.142','ipv4.route-metric','100',
           'ipv4.routes','10.246.40.0/24 172.17.60.71 40','ipv6.method','auto')
        nm('con','up',PORT)
        nm('device','reapply','br-mgmt')
        after=snapshot();save('activated-readback.json',after)
        require(valid_bridge(after),'Bridge address/route/port readback mismatch')
        require(preserved(after,before),'Original guest/NAT/reachability not preserved')
        state.update(status='WAITING_EXTERNAL_ACK',local_verified_utc=now());save('state.json',state)
        print('WAITING_EXTERNAL_ACK',flush=True)
        limit=time.monotonic()+100
        while time.monotonic()<limit:
            if (D/'external-ack.json').exists():
                ack=json.loads((D/'external-ack.json').read_text())
                require(ack.get('from_host')=='dr1' and ack.get('ssh_host')=='dr4' and ack.get('bridge_ip')==IP and ack.get('uplink_master')=='br-mgmt','Invalid external witness')
                require(ack.get('activation_id')==state['activation_id'],'External witness belongs to another activation')
                require(0<=time.time()-(D/'external-ack.json').stat().st_mtime<60,'Stale or future external witness')
                require(ack.get('nat_egress_verified') is True,'Independent NAT egress witness missing')
                final=snapshot();require(valid_bridge(final) and preserved(final,before),'Final readback drift')
                nm('con','mod',BR,'connection.autoconnect','yes','connection.autoconnect-priority','100','connection.autoconnect-ports','1')
                nm('con','mod',PORT,'connection.autoconnect','yes','connection.autoconnect-priority','100')
                nm('con','mod',OLD,'connection.autoconnect','no')
                event('native-checkpoint-commit',BUS+['CheckpointDestroy','o',state['checkpoint']])
                save('after.json',final)
                state.update(status='COMMITTED',ended_utc=now(),eight_guest_processes_and_configurations_preserved=True,external_witness=ack)
                save('state.json',state);print('COMMITTED_BR_MGMT_8_GUESTS_PRESERVED',flush=True);return
            time.sleep(1)
        raise RuntimeError('No timely independent external acknowledgement')
    except BaseException as e:
        state.update(error=str(e));save('state.json',state);recover(str(e));raise
if __name__=='__main__':
    require(os.geteuid()==0 and not D.is_symlink() and D.stat().st_mode&0o077==0,'Requires private root directory')
    lock=(D/'execution.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX)
    action=sys.argv[1]
    if action=='prepare':prepare()
    elif action=='apply':apply()
    elif action=='recover':recover('systemd post-stop recovery')
    else:raise ValueError('Unknown fixed action')
