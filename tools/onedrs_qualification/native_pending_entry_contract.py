#!/usr/bin/python3
"""Native pending-entry guards and explicit legacy post-dispatch boundary."""
import json
import secrets
import sqlite3
import time
import xml.etree.ElementTree as ET


def run(ctx):
    globals().update({k: v for k, v in ctx.items() if not k.startswith('__')})
    import native_generation_contract as generation
    generation.__dict__.update({k: v for k, v in ctx.items() if not k.startswith('__')})
    if SUITE == 'legacy-callback-boundary':
        legacy_same_vm_boundary()
        return
    if SUITE in ('callback-guard', 'all'):
        pending_deploy_callback(generation)
    if SUITE in ('pending-api', 'all'):
        pending_api_entries(generation)


def pending_deploy_callback(generation):
    snapshot, vid = generation.capture_api_gap('live')
    reset_case('pending-deploy-response', snapshot)
    before = vm(vid).findtext('DEPLOY_ID')
    plan = cluster().findtext('PLAN_SHA256')
    path = F / ('callback-' + secrets.token_hex(8) + '.json')
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps({'mode': 'vmm', 'operation': 'DEPLOY', 'id': vid,
                              'result': 'SUCCESS', 'extra': 'obsolete-deployment-' + str(vid)}))
    position = log_position(vid)
    tmp.replace(path)
    waitfor(lambda: path.with_suffix('.sent').exists())
    wait_native_error(position, 'Ignoring driver callback before native capacity admission')
    check('pending_deploy_response_does_not_mutate_canonical_deploy_id', vm(vid).findtext('DEPLOY_ID') == before)
    check('pending_deploy_response_preserves_native_admission',
          hist(vm(vid)).findtext('SEQ') == '1' and hist(vm(vid)).findtext('STIME') == '0' and
          cluster().findtext('PLAN_SHA256') == plan and not events('vmm') and not events('tm'))


def pending_api_entries(generation):
    violations = []
    RESULT['pending_entry_violations'] = violations
    reset_case('dm-deploy-publication-failure')
    vid = int(ok('one.vm.allocate', 'NAME="dm-gap" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
    install_failure('dm_deploy_vm_publication', 'vm_pool', 'UPDATE',
                    'NEW.oid=' + str(vid) + ' AND NEW.state=3')
    check('dm_deploy_final_vm_write_failure_is_refused', rpc('one.vm.deploy', vid, target, True, ds, '')[0] is False)
    current = vm(vid)
    check('dm_deploy_failure_retains_canonical_hold_pending_sequence',
          current.findtext('STATE') == '2' and hist(current).findtext('SEQ') == '0' and
          hist(current).findtext('STIME') == '0' and not events('vmm') and not events('tm'))
    remove_failure('dm_deploy_vm_publication')
    stop()
    initial = D / 'pending-final-dm-deploy.db'
    snapshot_db(initial)

    offline, offline_vid = generation.capture_api_gap('poweroff')
    reset_case('closed-predecessor-cancellation-marker', offline)
    install_failure('cancel_final_vm_publication', 'vm_pool', 'UPDATE',
                    'NEW.oid=' + str(offline_vid) + " AND NEW.body LIKE '%<SEQ>2</SEQ>%'")
    check('offline_cancellation_vm_write_failure_is_refused', rpc('one.vm.recover', offline_vid, 0)[0] is False)
    h = hist(vm(offline_vid))
    with sqlite3.connect(DB) as con:
        previous = ET.fromstring(con.execute('SELECT body FROM history WHERE vid=? AND seq=0', (offline_vid,)).fetchone()[0])
    check('offline_partial_cancel_has_closed_predecessor_and_durable_marker',
          h.findtext('SEQ') == '1' and h.findtext('ENFORCED_ADMISSION_CANCELING') == '1' and
          int(previous.findtext('ETIME')) > 0)
    remove_failure('cancel_final_vm_publication')
    stop()
    canceled = D / 'pending-closed-predecessor-cancel.db'
    snapshot_db(canceled)

    for label, image, candidate, sequence in [('initial', initial, vid, '0'), ('offline', canceled, offline_vid, '1')]:
        operations = ('deploy', 'resize', 'update', 'updateconf') if label == 'initial' else ('migrate', 'resize', 'update', 'updateconf')
        for operation in operations:
            reset_case('pending-entry-' + label + '-' + operation, image)
            before = vm(candidate)
            before_cpu = before.findtext('TEMPLATE/CPU')
            before_user = ET.tostring(before.find('USER_TEMPLATE'))
            before_template = ET.tostring(before.find('TEMPLATE'))
            if operation == 'deploy': reply = rpc('one.vm.deploy', candidate, target, True, ds, '')
            elif operation == 'migrate': reply = rpc('one.vm.migrate', candidate, source, False, True, ds, 0)
            elif operation == 'resize': reply = rpc('one.vm.resize', candidate, 'CPU="1" MEMORY="192" VCPU="1"', True)
            elif operation == 'update': reply = rpc('one.vm.update', candidate, 'SCHED_REQUIREMENTS="ID = 999999"', 1)
            else: reply = rpc('one.vm.updateconf', candidate, 'OS=[BOOT="network"]', 1)
            after = vm(candidate)
            unchanged = (hist(after).findtext('SEQ') == sequence and
                         after.findtext('TEMPLATE/CPU') == before_cpu and
                         ET.tostring(after.find('USER_TEMPLATE')) == before_user and
                         ET.tostring(after.find('TEMPLATE')) == before_template and
                         (label != 'offline' or hist(after).findtext('ENFORCED_ADMISSION_CANCELING') == '1'))
            refused = reply[0] is False and unchanged and not events('vmm') and not events('tm')
            name = 'pending_' + label + '_' + operation + '_refused_without_mutation'
            RESULT.setdefault('pending_entry_observations', []).append({'case': name, 'rpc_accepted': reply[0], 'canonical_unchanged': unchanged, 'refused_safely': refused})
            if not refused: violations.append(name)
            check(name + '_observed', True, refused_safely=refused)

        reset_case('pending-entry-native-recovery-' + label, image)
        ok('one.vm.recover', candidate, 0)
        check('pending_entry_' + label + '_native_cancellation_succeeds',
              hist(vm(candidate)).findtext('ENFORCED_ADMISSION_CANCELING') == '0')
        check('pending_entry_' + label + '_stable_template_update_allowed',
              rpc('one.vm.update', candidate, 'RECOVERY_TEST="stable"', 1)[0] is True)
        check('pending_entry_' + label + '_stable_resize_allowed',
              rpc('one.vm.resize', candidate, 'CPU="1" MEMORY="192" VCPU="1"', True)[0] is True)
        next_sequence = str(int(hist(vm(candidate)).findtext('SEQ')) + 1)
        if label == 'initial':
            ok('one.vm.deploy', candidate, target, True, ds, '')
            waitfor(lambda: is_running_on(candidate, target))
            check('pending_entry_initial_deploy_allowed_after_native_cancel', hist(vm(candidate)).findtext('SEQ') == '1')
        else:
            ok('one.vm.migrate', candidate, target, False, True, ds, 0)
            waitfor(lambda: vm(candidate).findtext('STATE') == '8' and hist(vm(candidate)).findtext('HID') == str(target))
            check('pending_entry_offline_migrate_allowed_after_native_cancel', hist(vm(candidate)).findtext('SEQ') == next_sequence)
    RESULT['pending_entry_violations'] = violations
    check('all_pending_entry_paths_refuse_without_mutation', not violations)


def legacy_same_vm_boundary():
    reset_case('legacy-post-dispatch-recovery-boundary')
    controls(MIGRATE='HOLD')
    emit([(vms[0], target, ds)])
    first = cluster().findtext('PLAN/GENERATION')
    check('legacy_boundary_first_checked_plan_accepted', apply()[0] is True)
    waitfor(lambda: len(events('vmm', 'MIGRATE')) == 1)
    ok('one.vm.recover', vms[0], 0)
    waitfor(lambda: is_running_on(vms[0], source) and cluster().findtext('PLAN/STATE') == '3')
    check('legacy_boundary_explicit_post_dispatch_recovery_has_no_driver_cancel', not events('vmm', 'DRIVER_CANCEL'))
    emit([(vms[0], target, ds)])
    second = cluster().findtext('PLAN/GENERATION')
    check('legacy_boundary_second_checked_plan_accepted', apply()[0] is True and second != first)
    waitfor(lambda: len(events('vmm', 'MIGRATE')) == 2)
    check('legacy_boundary_same_vm_second_action_actually_applying', cluster().findtext('PLAN/STATE') == '1')
    release_driver('MIGRATE', vms[0])
    waitfor(lambda: cluster().findtext('PLAN/STATE') in ('2', '3'))
    RESULT['legacy_post_dispatch_same_vm_boundary'] = {
        'first_generation': first, 'second_generation': second,
        'migration_requests': len(events('vmm', 'MIGRATE')),
        'released_held_replies': 1, 'second_plan_state_after_first_reply': cluster().findtext('PLAN/STATE'),
        'scope': 'explicit post-dispatch native recover-failure; outside qualified pre-driver cancellation'}
    check('legacy_same_vm_late_reply_is_correlated_to_its_original_request', cluster().findtext('PLAN/STATE') == '1')
