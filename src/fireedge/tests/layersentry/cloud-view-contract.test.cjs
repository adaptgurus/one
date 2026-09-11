/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { resolve } = require('node:path')
const YAML = require('yaml')

const cloud = resolve(__dirname, '../../etc/sunstone/views/cloud')
const read = (name) => YAML.parse(readFileSync(resolve(cloud, name), 'utf8'))
const existing = (name) => read(name)

const expectedNewResources = {
  'image-tab.yaml': 'IMAGE',
  'file-tab.yaml': 'FILE',
  'backup-tab.yaml': 'BACKUP',
  'backupjobs-tab.yaml': 'BACKUPJOBS',
  'vnet-tab.yaml': 'VIRTUAL-NETWORK',
  'vnet-template-tab.yaml': 'NETWORK-TEMPLATE',
  'sec-group-tab.yaml': 'SECURITY-GROUP',
  'vrouter-tab.yaml': 'VROUTER',
  'vm-group-tab.yaml': 'VM-GROUP',
  'service-template-tab.yaml': 'SERVICE-TEMPLATE',
  'oneks-tab.yaml': 'KUBERNETES',
  'support-tab.yaml': 'SUPPORT',
}

for (const [file, resource] of Object.entries(expectedNewResources)) {
  test(`customer view includes valid ${resource} configuration`, () => {
    const data = read(file)
    assert.equal(data.resource_name, resource)
    assert.ok(data.actions || data['info-tabs'])
  })
}

test('cloud view never exposes provider infrastructure resources', () => {
  const forbidden = new Set(['DATASTORE', 'HOST', 'CLUSTER', 'PROVIDER', 'ZONE', 'ACL', 'VDC'])
  const resources = readdirSync(cloud)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => read(f)?.resource_name)
    .filter(Boolean)
  for (const resource of resources) assert.equal(forbidden.has(resource), false, resource)
})

test('new customer resources cannot transfer ownership', () => {
  for (const file of Object.keys(expectedNewResources)) {
    const data = read(file)
    assert.notEqual(data.actions?.chown, true, `${file}: chown`)
    assert.notEqual(data.actions?.chgrp, true, `${file}: chgrp`)
    assert.notEqual(data['info-tabs']?.info?.ownership_panel?.actions?.chown, true, `${file}: ownership chown`)
    assert.notEqual(data['info-tabs']?.info?.ownership_panel?.actions?.chgrp, true, `${file}: ownership chgrp`)
  }
})

test('customer dashboard is workload-only and avoids provider capacity/host cards', () => {
  const cards = read('dashboard-tab.yaml').cards
  assert.deepEqual(cards.map(({ id }) => id), [
    'virtual-machines', 'virtual-networks', 'images', 'cpu-chart', 'memory-chart',
  ])
  for (const { id } of cards) assert.equal(['hosts', 'hosts-summary', 'host-cpu-chart', 'host-memory-chart', 'cluster-capacity', 'system'].includes(id), false)
})

test('native VM self-service safety/function set remains present', () => {
  const vm = existing('vm-tab.yaml')
  for (const action of ['vnc', 'ssh', 'rdp', 'resume', 'reboot', 'poweroff', 'terminate']) assert.equal(vm.actions[action], true, action)
  assert.equal(vm['info-tabs'].storage.actions['disk-attach'].enabled, true)
  assert.equal(vm['info-tabs'].storage.actions['disk-detach'], true)
  assert.equal(vm['info-tabs'].storage.actions['disk-resize'], true)
  assert.equal(vm['info-tabs'].network.actions['nic-attach'], true)
  assert.equal(vm['info-tabs'].network.actions['nic-detach'], true)
  assert.equal(vm['info-tabs'].network.actions['nic-update'], true)
  assert.equal(vm['info-tabs'].network.actions['sg-attach'], true)
  assert.equal(vm['info-tabs'].network.actions['sg-detach'], true)
  assert.equal(vm['info-tabs'].snapshot.actions['snapshot-create'], true)
  assert.equal(vm['info-tabs'].snapshot.actions['snapshot-revert'], true)
  assert.equal(vm['info-tabs'].snapshot.actions['snapshot-delete'], true)
})

test('VM template instantiation retains customer network/storage/backup configuration', () => {
  const cfg = existing('vm-template-tab.yaml')
  assert.equal(cfg.actions.instantiate_dialog, true)
  for (const key of ['capacity', 'network', 'storage', 'vm_group', 'sched_action', 'booting']) assert.equal(cfg.dialogs.instantiate_dialog[key], true, key)
})

test('native OneKS customer lifecycle includes create, worker groups, recovery, upgrade and access', () => {
  const cfg = read('oneks-tab.yaml')
  assert.equal(cfg.actions.create_dialog, true)
  assert.equal(cfg.actions.recover, true)
  assert.equal(cfg.actions.upgrade, true)
  assert.equal(cfg.actions.delete, true)
  assert.equal(cfg['info-tabs'].nodegroup.actions.create_dialog, true)
  assert.equal(cfg['info-tabs'].logs.enabled, true)
  assert.equal(cfg['info-tabs'].events.enabled, true)
  assert.equal(cfg['info-tabs'].kubeconfig.enabled, true)
})

test('network self-service includes template instantiation, IP ranges, leases and rule attachment', () => {
  const vnet = read('vnet-tab.yaml')
  assert.equal(vnet.actions.instantiate_dialog, true)
  assert.equal(vnet.actions.reserve_dialog, true)
  assert.equal(vnet['info-tabs'].address.actions.add_ar, true)
  assert.equal(vnet['info-tabs'].address.actions.update_ar, true)
  assert.equal(vnet['info-tabs'].lease.actions.hold_lease, true)
  assert.equal(vnet['info-tabs'].lease.actions.release_lease, true)
  assert.equal(vnet['info-tabs'].security.actions.add_secgroup, true)
  assert.equal(vnet['info-tabs'].security.actions.delete_secgroup, true)
  assert.equal(vnet.actions.change_cluster, false)
})

test('traffic rules are customer-manageable but ownership and raw attributes are not', () => {
  const cfg = read('sec-group-tab.yaml')
  assert.equal(cfg.actions.create_dialog, true)
  assert.equal(cfg.actions.update_dialog, true)
  assert.equal(cfg.actions.commit, true)
  assert.equal(cfg['info-tabs'].info.rules_panel.enabled, true)
  assert.equal(cfg['info-tabs'].info.attributes_panel.actions.add, false)
  assert.equal(cfg['info-tabs'].info.attributes_panel.actions.edit, false)
})

test('backup jobs expose native schedule/run/cancel without provider ownership actions', () => {
  const cfg = read('backupjobs-tab.yaml')
  for (const action of ['create_dialog', 'update_dialog', 'start', 'cancel', 'delete']) assert.equal(cfg.actions[action], true, action)
  for (const action of ['sched_action_create', 'sched_action_update', 'sched_action_delete']) assert.equal(cfg['info-tabs'].sched_actions.actions[action], true, action)
})

test('application templates remain publish-and-consume for ordinary customers', () => {
  const cfg = read('service-template-tab.yaml')
  assert.equal(cfg.actions.instantiate_dialog, true)
  for (const action of ['create_dialog', 'update_dialog', 'delete', 'share', 'chown', 'chgrp']) assert.notEqual(cfg.actions[action], true, action)
  assert.equal(cfg['info-tabs'].roles.enabled, true)
  assert.equal(cfg['info-tabs'].networks.enabled, true)
})

test('self-service support can create tickets and comments', () => {
  const cfg = read('support-tab.yaml')
  assert.equal(cfg.actions.create_dialog, true)
  assert.equal(cfg['info-tabs'].comments.actions.comment, true)
})
