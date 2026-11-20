"""Native VMGroup admission contracts for the private capacity harness.

The caller owns the loopback-only PID/mount/network namespace, disposable native
DB and inert drivers. This module does not create credentials, contact an
installed daemon, or claim a hypervisor/physical-failure qualification. Ordinary
RPCs use their real enforce flag; no synthetic group-admission endpoint exists.
"""
import concurrent.futures
from pathlib import Path
import json
import sqlite3
import threading
import xml.etree.ElementTree as ET


def run(ctx):
    """Run ordinary enforced/native membership cases; return checked-case state."""
    required = ('rpc ok check vm host cluster stop start reset_case dbread dbwrite '
                'put controls events waitfor ledger cid source target ds vms F D DB').split()
    if any(name not in ctx for name in required):
        raise AssertionError('Incomplete private native contract context')
    rpc, ok, check = (ctx[k] for k in ('rpc', 'ok', 'check'))
    vm, host, stop, start = (ctx[k] for k in ('vm', 'host', 'stop', 'start'))
    reset, dbread, dbwrite, put = (ctx[k] for k in ('reset_case', 'dbread', 'dbwrite', 'put'))
    controls, events, waitfor, ledger = (ctx[k] for k in ('controls', 'events', 'waitfor', 'ledger'))
    cid, source, target, ds = (ctx[k] for k in ('cid', 'source', 'target', 'ds'))
    vms = list(ctx['vms'])
    d, db, fixture = (Path(ctx[k]).resolve() for k in ('D', 'DB', 'F'))
    if d.parent != Path('/root') or not d.name.startswith('ls-onedrs-checked-api-runtime-'):
        raise AssertionError('Dedicated private native runtime required')
    if db != d / 'prefix/var/one.db' or fixture != d / 'prefix/var/capacity-fixture':
        raise AssertionError('Unexpected fixture database or driver custody')
    isolation = json.loads((d / 'evidence/network-isolation.json').read_text())
    if isolation.get('host_namespaces_distinct') is not True or isolation.get('routes'):
        raise AssertionError('Private loopback-only isolation evidence required')

    def current(vid):
        return max(vm(vid).findall('HISTORY_RECORDS/HISTORY'),
                   key=lambda item: int(item.findtext('SEQ', '-1')), default=None)

    def running(vid, hid):
        body = vm(vid)
        item = max(body.findall('HISTORY_RECORDS/HISTORY'),
                   key=lambda h: int(h.findtext('SEQ', '-1')), default=None)
        return (body.findtext('STATE') == '3' and body.findtext('LCM_STATE') == '3'
                and item is not None and item.findtext('HID') == str(hid))

    def group_xml(gid):
        return ET.fromstring(ok('one.vmgroup.info', gid))

    def group(label, roles, rules=''):
        return int(ok('one.vmgroup.allocate', 'NAME="group-contract-' + label + '" ' + roles + ' ' + rules))

    def join(vid, gid, role='replica'):
        ok('one.vm.vmgroupadd', vid, gid, role)
        check('group_join_' + str(gid) + '_' + str(vid),
              vm(vid).findtext('TEMPLATE/VMGROUP/VMGROUP_ID') == str(gid)
              and vm(vid).findtext('TEMPLATE/VMGROUP/ROLE') == role)

    def history(vid):
        root = vm(vid).find('HISTORY_RECORDS')
        return ET.tostring(root) if root is not None else b''

    def driver_calls():
        return len(events('vmm')) + len(events('tm'))

    def refused(label, vid, hid, deploy=False):
        before_history, before_drivers = history(vid), driver_calls()
        before_ledgers = {h: ledger(h) for h in all_hosts}
        reply = (rpc('one.vm.deploy', vid, hid, True, ds, '') if deploy else
                 rpc('one.vm.migrate', vid, hid, True, True, ds, 0))
        check(label + '_refused_before_admission', reply[0] is False)
        check(label + '_no_history_or_driver_publication',
              history(vid) == before_history and driver_calls() == before_drivers)
        check(label + '_no_capacity_change', {h: ledger(h) for h in all_hosts} == before_ledgers)

    def release(operation, vid, result='SUCCESS'):
        (fixture / ('release-' + operation + '-' + str(vid))).write_text(result)

    def migrate(label, vid, hid, enforce=True, complete=True):
        before = len(events('vmm', 'MIGRATE'))
        check(label + '_accepted', rpc('one.vm.migrate', vid, hid, True, enforce, ds, 0)[0] is True)
        waitfor(lambda: len(events('vmm', 'MIGRATE')) == before + 1)
        check(label + '_durable_enforcement', current(vid).findtext('ENFORCE_CAPACITY') == ('1' if enforce else '0'))
        if complete:
            release('MIGRATE', vid)
            waitfor(lambda: running(vid, hid))
            check(label + '_native_completion', running(vid, hid))

    reset('group-bootstrap')
    spare = int(ok('one.host.allocate', 'group-spare-a', 'capacity', 'capacity', cid))
    spare2 = int(ok('one.host.allocate', 'group-spare-b', 'capacity', 'capacity', cid))
    all_hosts = [source, target, spare, spare2]
    stop()
    # Capacity is deliberately ample: group-rule refusals must not be capacity
    # refusals. Fixture edits occur only while this disposable daemon is stopped.
    for hid in all_hosts:
        body = dbread('host_pool', hid)
        put(body, 'STATE', 2)
        put(body, 'PREV_STATE', 2)
        put(body, 'HOST_SHARE/MAX_CPU', 800)
        put(body, 'HOST_SHARE/MAX_MEM', 8388608)
        for key, value in {'ARCH': 'x86_64', 'HYPERVISOR': 'kvm', 'PIN_POLICY': 'NONE'}.items():
            put(body, 'TEMPLATE/' + key, value)
        dbwrite('host_pool', hid, body, state=2)
    baseline = d / 'vmgroup-baseline.db'
    if baseline.exists():
        raise AssertionError('Refusing to overwrite group baseline')
    with sqlite3.connect(db) as connection, sqlite3.connect(baseline) as backup:
        connection.backup(backup)

    def fresh(label):
        reset('group-' + label, snapshot=baseline)
        controls(MIGRATE='HOLD')

    fresh('contradictory-rules')
    reply = rpc('one.vmgroup.allocate', 'NAME="group-contradictory" ROLE=[NAME="web"] ROLE=[NAME="app"] AFFINED="web,app" ANTI_AFFINED="web,app"')
    check('group_contradictory_native_rules_refused', reply[0] is False)

    fresh('host-constraints')
    gid = group('host-constraints', 'ROLE=[NAME="replica",HOST_AFFINED="' + ','.join(map(str, [source, target, spare])) + '",HOST_ANTI_AFFINED="' + str(target) + '"]')
    join(vms[0], gid)
    refused('group_host_deny_overrides_allow', vms[0], target)
    refused('group_host_outside_allow', vms[0], spare2)
    migrate('group_allowed_host', vms[0], spare)

    fresh('intra-anti')
    gid = group('intra-anti', 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"]')
    join(vms[0], gid)
    join(vms[2], gid)
    refused('group_intra_role_occupied_host', vms[0], target)
    migrate('group_intra_role_free_host', vms[0], spare)

    fresh('inter-anti')
    gid = group('inter-anti', 'ROLE=[NAME="web"] ROLE=[NAME="app"]', 'ANTI_AFFINED="web,app"')
    join(vms[0], gid, 'web')
    join(vms[1], gid, 'web')
    join(vms[2], gid, 'app')
    check('group_inter_role_does_not_invent_intra_role_anti', running(vms[0], source) and running(vms[1], source))
    refused('group_inter_role_occupied_host', vms[0], target)
    migrate('group_inter_role_free_host', vms[0], spare)

    fresh('affinity')
    gid = group('affinity', 'ROLE=[NAME="replica",POLICY="AFFINED"]')
    join(vms[0], gid)
    join(vms[1], gid)
    refused('group_affined_member_requires_peer_host', vms[0], target)

    fresh('unplaced')
    gid = group('unplaced', 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"]')
    extra = [int(ok('one.vm.allocate', 'NAME="group-new-' + str(i) + '" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"] VMGROUP=[VMGROUP_ID="' + str(gid) + '",ROLE="replica"]', True)) for i in range(2)]
    controls(DEPLOY='HOLD', MIGRATE='HOLD')
    check('group_unplaced_first_deploy_accepted', rpc('one.vm.deploy', extra[0], source, True, ds, '')[0] is True)
    waitfor(lambda: len(events('vmm', 'DEPLOY')) == 1)
    refused('group_unplaced_second_defers_unresolved_peer', extra[1], target, deploy=True)
    release('DEPLOY', extra[0])
    waitfor(lambda: running(extra[0], source))
    check('group_unplaced_second_deploy_after_settlement', rpc('one.vm.deploy', extra[1], target, True, ds, '')[0] is True)
    waitfor(lambda: len(events('vmm', 'DEPLOY')) == 2)
    release('DEPLOY', extra[1])
    waitfor(lambda: running(extra[1], target))
    check('group_unplaced_initial_placement_progresses', running(extra[0], source) and running(extra[1], target))

    for trial in range(3):
        fresh('concurrent-' + str(trial))
        gid = group('concurrent', 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"]')
        join(vms[0], gid)
        join(vms[2], gid)
        moves = [(vms[0], spare), (vms[2], spare2)]
        before = {vid: history(vid) for vid, _ in moves}
        barrier = threading.Barrier(2)
        def contend(move):
            barrier.wait(timeout=5)
            return rpc('one.vm.migrate', move[0], move[1], True, True, ds, 0)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(contend, moves))
        winners = [i for i, reply in enumerate(replies) if reply[0] is True]
        check('group_concurrent_' + str(trial) + '_one_admission', len(winners) == 1)
        winner = winners[0]
        loser = 1 - winner
        waitfor(lambda: len(events('vmm', 'MIGRATE')) == 1)
        check('group_concurrent_' + str(trial) + '_loser_has_no_history', history(moves[loser][0]) == before[moves[loser][0]])
        release('MIGRATE', moves[winner][0])
        waitfor(lambda: running(*moves[winner]))
        migrate('group_concurrent_' + str(trial) + '_deferred_progress', *moves[loser])
        check('group_concurrent_' + str(trial) + '_distinct_final_hosts', all(running(*move) for move in moves))

    fresh('force')
    gid = group('force', 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"]')
    join(vms[0], gid)
    join(vms[2], gid)
    migrate('group_explicit_force', vms[0], target, enforce=False, complete=False)
    refused('group_force_still_publishes_unresolved_peer', vms[2], spare)
    release('MIGRATE', vms[0])
    waitfor(lambda: running(vms[0], target))
    migrate('group_enforced_move_after_force_settlement', vms[2], spare)

    fresh('restart-membership')
    gid = group('restart-membership', 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"] ROLE=[NAME="unused"]')
    join(vms[0], gid)
    join(vms[2], gid)
    migrate('group_unresolved_before_restart', vms[0], spare, complete=False)
    stop(crash=True)
    start('group-unresolved-restart')
    refused('group_unresolved_after_restart', vms[2], spare2)
    before = ET.tostring(group_xml(gid))
    mutations = [
        ('join', ('one.vm.vmgroupadd', vms[1], gid, 'unused')),
        ('leave', ('one.vm.vmgroupdel', vms[2])),
        ('role_add', ('one.vmgroup.roleadd', gid, 'ROLE=[NAME="extra"]')),
        ('role_update', ('one.vmgroup.roleupdate', gid, 1, 'ROLE=[NAME="unused",HOST_AFFINED="' + str(source) + '"]')),
        ('role_delete', ('one.vmgroup.roledelete', gid, 1)),
        ('delete', ('one.vmgroup.delete', gid)),
    ]
    for label, args in mutations:
        check('group_unresolved_' + label + '_refused', rpc(*args)[0] is False)
        check('group_unresolved_' + label + '_authority_unchanged', ET.tostring(group_xml(gid)) == before)
    check('group_unresolved_peer_keeps_original_membership', vm(vms[2]).findtext('TEMPLATE/VMGROUP/VMGROUP_ID') == str(gid))
    ok('one.vm.recover', vms[0], 0)
    waitfor(lambda: running(vms[0], source))
    ok('one.vm.vmgroupdel', vms[2])
    join(vms[2], gid)
    ok('one.vmgroup.roleadd', gid, 'ROLE=[NAME="settled-extra"]')
    check('group_settled_membership_and_role_edits_progress', any(role.findtext('NAME') == 'settled-extra' for role in group_xml(gid).findall('ROLES/ROLE')))

    for action, state in [('poweroff', '8'), ('suspend', '5')]:
        fresh('settled-' + action)
        gid = group('settled-' + action, 'ROLE=[NAME="replica",POLICY="ANTI_AFFINED"]')
        join(vms[0], gid)
        join(vms[2], gid)
        ok('one.vm.action', action, vms[2])
        waitfor(lambda: vm(vms[2]).findtext('STATE') == state)
        check('group_' + action + '_settled', vm(vms[2]).findtext('LCM_STATE') == '0')
        refused('group_' + action + '_placement_remains_occupied', vms[0], target)
        migrate('group_' + action + '_other_host_allowed', vms[0], spare)

    fresh('role-write-failure')
    gid = group('role-write-failure', 'ROLE=[NAME="replica"]')
    before = ET.tostring(group_xml(gid))
    with sqlite3.connect(db) as connection:
        connection.execute('CREATE TRIGGER group_role_write_failure BEFORE UPDATE ON vm_group_pool WHEN NEW.oid=' + str(gid) + " BEGIN SELECT RAISE(ABORT,'private group role fixture'); END")
    try:
        check('group_failed_role_persistence_is_not_acknowledged', rpc('one.vmgroup.roleadd', gid, 'ROLE=[NAME="never-persisted"]')[0] is False)
        check('group_failed_role_persistence_has_no_visible_change', ET.tostring(group_xml(gid)) == before)
    finally:
        with sqlite3.connect(db) as connection:
            connection.execute('DROP TRIGGER group_role_write_failure')
    stop()
    start('group-role-write-failure-restart')
    check('group_failed_role_persistence_survives_restart_unchanged', ET.tostring(group_xml(gid)) == before)
    return {'baseline': baseline, 'spare': spare, 'spare2': spare2, 'all_hosts': all_hosts}
