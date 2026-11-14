"""Bounded same-version lab package transition. Never calls a VM lifecycle API."""
from pathlib import Path
import datetime, hashlib, json, os, shutil, subprocess, sys
D = Path(__file__).resolve().parent
assert D.parent == Path('/var/lib/layersentry') and D.name.startswith('onedrs-r10-cohort-')
assert not D.is_symlink() and D.stat().st_uid == 0 and D.stat().st_mode & 0o077 == 0
os.umask(0o077)
BASE = 'd3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1'
NEW = '782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
DRIVER = '/var/lib/one/remotes/vmm/kvm/deploy'
FPR = '1CBC92283A98C598788048398BF04EAFAA428403'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
if not __debug__: raise RuntimeError("Optimized Python is not admitted for the lab executor")
pre = json.loads((D / 'preflight.json').read_text())
assert subprocess.check_output(['hostname'], text=True).strip() == pre['hostname']
assert Path('/sys/class/dmi/id/product_uuid').read_text().strip() == pre['uuid']
state_file = D / 'actor-state.json'
s = json.loads(state_file.read_text()) if state_file.exists() else {'events': [], 'prepared': False, 'key_added': False}
def save():
    tmp = D / 'actor-state.next'; tmp.write_text(json.dumps(s, indent=2) + '\n'); tmp.replace(state_file)
def run(label, args, timeout=90):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
    (D / (label + '.log')).write_text(p.stdout + p.stderr)
    s['events'].append({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'action': label, 'exit': p.returncode}); save()
    if p.returncode: raise RuntimeError(label + ' failed; inspect private log')
    return p.stdout

def active(unit):
    return subprocess.run(['systemctl', 'is-active', '--quiet', unit], stdout=subprocess.DEVNULL).returncode == 0

def guards():
    return {p: sha(p) for p in ['/etc/one/oned.conf', '/etc/one/monitord.conf', '/var/lib/one/.one/one_auth', '/usr/libexec/layersentry-host-network-role']}

def stop_all():
    # Writers/HEM are stopped before native managers. Hypervisors and agents remain running.
    order = ['opennebula-fireedge.service', 'opennebula-flow.service', 'opennebula-form.service', 'opennebula-gate.service', 'opennebula-hem.service', 'opennebula.service', 'opennebula-ssh-agent.service']
    for u in order:
        if u in s['active_units'] and active(u): run('stop-' + u, ['systemctl', 'stop', u], 60)
    assert not active('opennebula.service')

action = sys.argv[1]
try:
    if action == 'prepare':
        assert not s['prepared'], 'Already prepared; do not replay preparation'
        assert sha('/usr/bin/oned') == BASE
        assert sha(D / 'candidate.rpm') == '30d4cd97930281d699ad3aa45e434f1b87d43ddd23cb249a6c656b7b4088f7ed'
        assert sha(D / 'rollback.rpm') == 'f84b8c8936343cb37d8ea39728113182645a8fdb92a73fb7d275d47d3ea51b18'
        assert guards()['/etc/one/oned.conf'] == pre['native_config']['/etc/one/oned.conf']
        s['guards'] = guards(); s['driver_sha'] = sha(DRIVER)
        s['active_units'] = [u for u in pre['active_units'] if active(u)]
        assert s['active_units'] == pre['active_units'], 'Service state drift'
        shutil.copy2(DRIVER, D / 'deploy.before'); st = Path(DRIVER).stat(); s['driver_meta'] = [st.st_uid, st.st_gid, st.st_mode & 0o7777]
        s['domain_uuids'] = sorted(run('domains-before', ['virsh', '-c', 'qemu:///system', 'list', '--uuid']).split())
        run('config-backup', ['tar', '--acls', '--xattrs', '-cpf', str(D / 'native-config-before.tar'), '/etc/one', '/var/lib/one/.one', '/var/lib/one/.ssh']); os.chmod(D / 'native-config-before.tar', 0o600)
        run('native-database-backup', ['onedb', 'backup', str(D / 'native-db-before.sql')], 120)
        assert (D / 'native-db-before.sql').stat().st_size > 1000; os.chmod(D / 'native-db-before.sql', 0o600)
        pub = run('public-key-fingerprint', ['gpg', '--show-keys', '--with-colons', str(D / 'LAB-ONLY-public.asc')])
        assert 'fpr:::::::::' + FPR + ':' in pub
        assert subprocess.run(['rpm', '-q', 'gpg-pubkey-aa428403'], capture_output=True).returncode != 0
        s['prepared'] = True; save()
        run('temporary-lab-key-import', ['rpm', '--import', str(D / 'LAB-ONLY-public.asc')]); s['key_added'] = True; save()
        for name in ['candidate', 'rollback']:
            text = run(name + '-signature', ['rpm', '--checksig', '--verbose', str(D / (name + '.rpm'))])
            assert 'NOKEY' not in text and 'Signature' in text and 'OK' in text
        run('signed-dependency-preflight', ['rpm', '-Uvh', '--test', str(D / 'candidate.rpm')])
    elif action == 'stop':
        assert s['prepared']; stop_all()
    elif action in ('install', 'rollback'):
        assert s['prepared'] and not active('opennebula.service')
        current = sha('/usr/bin/oned')
        target, filename = (NEW, 'candidate.rpm') if action == 'install' else (BASE, 'rollback.rpm')
        if current != target:
            assert current in [NEW, BASE], 'Unknown installed binary; refuse replacement'
            run('signed-' + action, ['dnf', '-y', '--disablerepo=*', '--setopt=localpkg_gpgcheck=1', '--setopt=gpgcheck=1', '--setopt=install_weak_deps=False', 'install' if action == 'install' else 'downgrade', str(D / filename)], 120)
        assert sha('/usr/bin/oned') == target and guards() == s['guards']
        if action == 'rollback':
            # Old RPM predates DR1 secure-state integration. Restore each host's exact original driver.
            tmp = Path(DRIVER).with_name('deploy.onedrs-r10-rollback-owned')
            assert not tmp.exists(); shutil.copy2(D / 'deploy.before', tmp)
            os.chown(tmp, s['driver_meta'][0], s['driver_meta'][1]); os.chmod(tmp, s['driver_meta'][2]); os.replace(tmp, DRIVER)
            run('restore-driver-label', ['restorecon', '-F', DRIVER]); assert sha(DRIVER) == s['driver_sha']
        else:
            assert sha(DRIVER) == '3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b'
    elif action == 'start-core':
        assert s['prepared'] and guards() == s['guards']
        for u in ['opennebula-ssh-agent.service', 'opennebula.service']:
            if u in s['active_units']: run('start-' + u, ['systemctl', 'start', u], 60)
        pid = subprocess.check_output(['systemctl', 'show', 'opennebula', '-p', 'MainPID', '--value'], text=True).strip()
        assert int(pid) > 0 and sha('/proc/' + pid + '/exe') == sha('/usr/bin/oned')
    elif action == 'restore-services':
        assert guards() == s['guards']
        for u in s['active_units']:
            if not active(u): run('restore-' + u, ['systemctl', 'start', u], 60)
        assert all(active(u) for u in s['active_units'])
    elif action == 'finish':
        assert sha('/usr/bin/oned') == BASE and guards() == s['guards'] and sha(DRIVER) == s['driver_sha']
        assert all(active(u) for u in s['active_units'])
        assert sorted(run('domains-after', ['virsh', '-c', 'qemu:///system', 'list', '--uuid']).split()) == s['domain_uuids'], 'Original running domain inventory differs'
        if s['key_added']:
            run('remove-temporary-lab-key', ['rpm', '-e', 'gpg-pubkey-aa428403']); s['key_added'] = False; save()
        s['finished'] = True; save()
    elif action == 'readback':
        pass
    else: raise ValueError('Unknown fixed operation')
    pid=int(subprocess.check_output(['systemctl','show','opennebula','-p','MainPID','--value'],text=True))
    running_sha=sha('/proc/'+str(pid)+'/exe') if pid>0 else None
    domains=sorted(subprocess.check_output(['virsh','-c','qemu:///system','list','--uuid'],text=True).split())
    print(json.dumps({'host':pre['hostname'],'action':action,'core':sha('/usr/bin/oned'),
        'running_core':running_sha,'active':active('opennebula.service'),
        'prepared':s['prepared'],'key_added':s['key_added'],'result':'PASS',
        'original_driver':sha(DRIVER)==s.get('driver_sha'),'guards_ok':guards()==s.get('guards'),
        'original_domains_equal':domains==s.get('domain_uuids'),
        'services_restored':all(active(u) for u in s.get('active_units',[]))}))
except BaseException as ex:
    s['last_error'] = str(ex); save(); raise
