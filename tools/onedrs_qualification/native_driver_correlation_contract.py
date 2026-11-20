#!/usr/bin/python3
"""Narrow native protocol regression with inert MADs and loopback-only networking.

No crash, SQL failure injection, host service control, SSH, or hypervisor action.
The owning capacity harness creates and reaps only its private native process.
"""
import json
import re
import secrets


def run(ctx):
    globals().update({k: v for k, v in ctx.items() if not k.startswith('__')})
    RESULT['scope'] = 'PRIVATE_LOOPBACK_NATIVE_DRIVER_CORRELATION_WITH_INERT_MADS'
    RESULT['fault_injection'] = False
    RESULT['hypervisor_operations'] = False
    reset_case('driver-correlation')
    controls(MIGRATE='HOLD')
    ident = vms[0]
    emit([(ident, target, ds)])
    first_generation = cluster().findtext('PLAN/GENERATION')
    check('first_correlated_migration_accepted', apply()[0] is True)
    first_event = waitfor(lambda: next(iter(events('vmm', 'MIGRATE')), None))
    first_token = first_event['request_token']
    first_history = hist(vm(ident))
    check('dispatch_identity_is_native_and_persisted',
          bool(re.fullmatch('[0-9a-f]{64}', first_token or '')) and
          first_history.findtext('DRIVER_REQUEST_TOKEN') == first_token and
          first_history.findtext('DRIVER_REQUEST_PENDING') == '1')
    first_sequence = first_history.findtext('SEQ')

    for operation in range(6):
        reply = rpc('one.vm.recover', ident, operation)
        current = hist(vm(ident))
        check('recovery_' + str(operation) + '_cannot_supersede_outstanding_request',
              reply[0] is False and 'outstanding' in reply[1] and
              current.findtext('SEQ') == first_sequence and
              current.findtext('DRIVER_REQUEST_TOKEN') == first_token and
              current.findtext('DRIVER_REQUEST_PENDING') == '1' and
              cluster().findtext('PLAN/STATE') == '1')
    check('rejected_recovery_dispatches_no_cancel_or_replacement',
          not events('vmm', 'DRIVER_CANCEL') and len(events('vmm', 'MIGRATE')) == 1)

    inject('untagged', ident, 'MIGRATE', None)
    inject('wrong-token', ident, 'MIGRATE', 'f' * 64)
    deploy_id = vm(ident).findtext('DEPLOY_ID')
    inject('wrong-operation', ident, 'DEPLOY', first_token, extra='obsolete-deployment')
    check('wrong_operation_cannot_mutate_deploy_identity', vm(ident).findtext('DEPLOY_ID') == deploy_id)
    check('invalid_replies_leave_first_action_applying',
          cluster().findtext('PLAN/STATE') == '1' and hist(vm(ident)).findtext('DRIVER_REQUEST_PENDING') == '1')

    # Finish A through its actual terminal reply, then create B on the same VM.
    # A later duplicate must not be relabelled as B merely because VMID matches.
    release_driver('MIGRATE', ident, 'FAILURE')
    waitfor(lambda: is_running_on(ident, source) and cluster().findtext('PLAN/STATE') == '3')
    check('new_history_does_not_copy_pending_request',
          hist(vm(ident)).findtext('DRIVER_REQUEST_TOKEN', '') == '' and
          hist(vm(ident)).findtext('DRIVER_REQUEST_PENDING') == '0')
    emit([(ident, target, ds)])
    second_generation = cluster().findtext('PLAN/GENERATION')
    check('second_same_vm_generation_accepted', second_generation != first_generation and apply()[0] is True)
    waitfor(lambda: len(events('vmm', 'MIGRATE')) == 2)
    second_token = events('vmm', 'MIGRATE')[1]['request_token']
    check('replacement_request_has_distinct_identity', second_token != first_token)
    inject('obsolete-success', ident, 'MIGRATE', first_token)
    inject('obsolete-failure', ident, 'MIGRATE', first_token, result='FAILURE', extra='obsolete-error')
    check('old_same_vm_replies_cannot_complete_new_generation',
          cluster().findtext('PLAN/STATE') == '1' and
          hist(vm(ident)).findtext('DRIVER_REQUEST_TOKEN') == second_token and
          hist(vm(ident)).findtext('DRIVER_REQUEST_PENDING') == '1')
    check('stale_failure_does_not_mutate_new_vm_error', 'obsolete-error' not in str(vm(ident).findtext('USER_TEMPLATE/ERROR', '')))
    release_driver('MIGRATE', ident)
    waitfor(lambda: is_running_on(ident, target) and cluster().findtext('PLAN/STATE') == '2')
    before = (ledger(source), ledger(target), hist(vm(ident)).findtext('SEQ'))
    inject('duplicate-completion', ident, 'MIGRATE', second_token)
    check('duplicate_completion_leaves_capacity_and_history_unchanged',
          before == (ledger(source), ledger(target), hist(vm(ident)).findtext('SEQ')))
    check('successful_request_retains_consumed_tombstone',
          hist(vm(ident)).findtext('DRIVER_REQUEST_TOKEN') == second_token and
          hist(vm(ident)).findtext('DRIVER_REQUEST_PENDING') == '0')

    controls(DEPLOY='HOLD')
    added = int(ok('one.vm.allocate', 'NAME="correlated-deploy" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
    ok('one.vm.deploy', added, source, True, ds, '')
    event = waitfor(lambda: next((e for e in events('vmm', 'DEPLOY') if e['id'] == str(added)), None))
    token = event['request_token']
    transfers = [e for e in events('tm', 'TRANSFER') if e['id'] == str(added)]
    check('native_prolog_and_deploy_use_distinct_correlated_requests',
          len(transfers) == 1 and bool(re.fullmatch('[0-9a-f]{64}', transfers[0]['request_token'] or '')) and
          transfers[0]['request_token'] != token)
    # The protocol message is observed through its global warning before readback.
    global_log = P / 'log/oned.log'
    offset = global_log.stat().st_size
    send(added, 'DEPLOY', token, extra='-')
    waitfor(lambda: 'Ignoring malformed native deployment acknowledgement' in global_log.read_bytes()[offset:].decode(errors='replace'))
    check('malformed_success_cannot_retire_deployment_request',
          hist(vm(added)).findtext('DRIVER_REQUEST_TOKEN') == token and
          hist(vm(added)).findtext('DRIVER_REQUEST_PENDING') == '1' and
          vm(added).findtext('LCM_STATE') == '2')
    release_driver('DEPLOY', added)
    waitfor(lambda: is_running_on(added, source))
    check('valid_deployment_acknowledgement_completes_exact_request',
          vm(added).findtext('DEPLOY_ID') == 'fixture-' + str(added) and
          hist(vm(added)).findtext('DRIVER_REQUEST_PENDING') == '0')
    RESULT['same_vm_generation_result'] = {
        'first_generation': first_generation, 'second_generation': second_generation,
        'first_request_token': first_token, 'second_request_token': second_token,
        'migration_requests': 2, 'old_replies_refused': 2, 'final_plan_state': '2'}


def send(ident, operation, token, result='SUCCESS', extra=''):
    path = F / ('callback-' + secrets.token_hex(8) + '.json')
    temporary = path.with_suffix('.tmp')
    item = {'mode': 'vmm', 'operation': operation, 'id': ident, 'result': result, 'extra': extra}
    if token is not None:
        item['request_token'] = token
    temporary.write_text(json.dumps(item))
    temporary.replace(path)
    waitfor(lambda: path.with_suffix('.sent').exists())


def inject(label, ident, operation, token, result='SUCCESS', extra=''):
    position = log_position(ident)
    send(ident, operation, token, result, extra)
    wait_native_error(position, 'Ignoring unbound, stale, or wrong-state native driver reply')
    check(label + '_observed_and_refused_by_native_protocol', True)
