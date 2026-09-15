/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,         *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */
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

test('cloud shell hides provider group and zone selectors', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/client/router/InternalLayout/index.js'),
    'utf8'
  )

  assert.match(source, /view === 'cloud' \? \[\] : undefined/)
  assert.match(source, /<Header slots=\{headerSlots\}/)
})

test('cloud view never exposes provider infrastructure resources', () => {
  const forbidden = new Set([
    'DATASTORE',
    'HOST',
    'CLUSTER',
    'PROVIDER',
    'ZONE',
    'ACL',
    'VDC',
  ])
  const resources = readdirSync(cloud)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => read(f)?.resource_name)
    .filter(Boolean)
  for (const resource of resources)
    assert.equal(forbidden.has(resource), false, resource)
})

test('new customer resources cannot transfer ownership', () => {
  for (const file of Object.keys(expectedNewResources)) {
    const data = read(file)
    assert.notEqual(data.actions?.chown, true, `${file}: chown`)
    assert.notEqual(data.actions?.chgrp, true, `${file}: chgrp`)
    assert.notEqual(
      data['info-tabs']?.info?.ownership_panel?.actions?.chown,
      true,
      `${file}: ownership chown`
    )
    assert.notEqual(
      data['info-tabs']?.info?.ownership_panel?.actions?.chgrp,
      true,
      `${file}: ownership chgrp`
    )
  }
})

test('customer dashboard is workload-only and avoids provider capacity/host cards', () => {
  const cards = read('dashboard-tab.yaml').cards
  assert.deepEqual(
    cards.map(({ id }) => id),
    [
      'virtual-machines',
      'virtual-networks',
      'images',
      'cpu-chart',
      'memory-chart',
    ]
  )
  for (const { id } of cards)
    assert.equal(
      [
        'hosts',
        'hosts-summary',
        'host-cpu-chart',
        'host-memory-chart',
        'cluster-capacity',
        'system',
      ].includes(id),
      false
    )
})

test('cloud VM self-service keeps lifecycle but hides raw provider device controls', () => {
  const vm = existing('vm-tab.yaml')
  for (const action of [
    'vnc',
    'ssh',
    'rdp',
    'resume',
    'reboot',
    'poweroff',
    'terminate',
    'backup',
  ])
    assert.equal(vm.actions[action], true, action)
  for (const action of ['deploy', 'migrate', 'live-migrate', 'chown', 'chgrp'])
    assert.notEqual(vm.actions[action], true, action)
  assert.equal(vm['info-tabs'].info.capacity_panel.actions.resize, false)
  assert.equal(vm['info-tabs'].storage.enabled, true)
  assert.equal(vm['info-tabs'].storage.actions['disk-attach'].enabled, false)
  for (const action of [
    'disk-attach-image',
    'disk-attach-volatile',
    'disk-detach',
    'disk-resize',
    'disk-saveas',
    'disk-snapshot-create',
    'disk-snapshot-delete',
    'disk-snapshot-rename',
    'disk-snapshot-revert',
  ])
    assert.equal(vm['info-tabs'].storage.actions[action], false, action)
  for (const action of [
    'nic-attach',
    'nic-attach-alias',
    'nic-detach',
    'nic-update',
    'sg-attach',
    'sg-detach',
  ])
    assert.equal(vm['info-tabs'].network.actions[action], false, action)
  assert.equal(vm['info-tabs'].pci.enabled, false)
  assert.equal(vm['info-tabs'].pci.actions['pci-attach'], false)
  assert.equal(vm['info-tabs'].pci.actions['pci-detach'], false)
  for (const action of [
    'snapshot-create',
    'snapshot-revert',
    'snapshot-delete',
  ])
    assert.equal(vm['info-tabs'].snapshot.actions[action], true, action)
  for (const action of ['backup-configure', 'backup-create', 'backup-restore'])
    assert.equal(vm['info-tabs'].backup.actions[action], true, action)
  assert.equal(vm.actions.create_app_dialog, false)
  assert.equal(vm['info-tabs'].history.enabled, true)
  assert.equal(vm['info-tabs'].logs.enabled, false)
})

test('cloud VM group is hidden while guest execution remains available', () => {
  const vm = read('vm-tab.yaml')
  assert.equal(vm['info-tabs'].vm_group.enabled, false)
  assert.equal(vm['info-tabs'].vm_group.actions['vmgroup-add'], false)
  assert.equal(vm['info-tabs'].vm_group.actions['vmgroup-del'], false)
  assert.equal(vm['info-tabs'].exec.enabled, true)
  assert.equal(vm['info-tabs'].exec.actions.exec, true)
  assert.equal(vm['info-tabs'].exec.actions['exec-retry'], true)
  assert.equal(vm['info-tabs'].exec.actions['exec-cancel'], true)
})

test('VM template instantiation uses LayerSentry resources instead of native provider dialogs', () => {
  const cfg = existing('vm-template-tab.yaml')
  assert.equal(cfg.actions.instantiate_dialog, true)
  assert.equal(cfg.features.hide_cpu, true)
  assert.equal(cfg.features.cpu_factor, 0.5)
  for (const key of ['information', 'capacity', 'gpu', 'protection'])
    assert.equal(cfg.dialogs.instantiate_dialog[key], true, key)
  for (const key of [
    'ownership',
    'vm_group',
    'network',
    'storage',
    'pci',
    'placement',
    'sched_action',
    'booting',
  ])
    assert.equal(cfg.dialogs.instantiate_dialog[key], false, key)
})

test('native OneKS customer lifecycle includes create, worker groups, recovery, upgrade and access', () => {
  const cfg = read('oneks-tab.yaml')
  assert.equal(cfg.actions.create_dialog, true)
  assert.equal(cfg.actions.recover, true)
  assert.equal(cfg.actions.upgrade, true)
  assert.equal(cfg.actions.delete, true)
  assert.equal(cfg['info-tabs'].nodegroup.actions.create_dialog, true)
  assert.equal(cfg['info-tabs'].logs.enabled, false)
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
  assert.equal(vnet.actions.update_dialog, false)
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
  for (const action of [
    'create_dialog',
    'update_dialog',
    'start',
    'cancel',
    'delete',
  ])
    assert.equal(cfg.actions[action], true, action)
  for (const action of [
    'sched_action_create',
    'sched_action_update',
    'sched_action_delete',
  ])
    assert.equal(cfg['info-tabs'].sched_actions.actions[action], true, action)
})

test('application templates remain publish-and-consume for ordinary customers', () => {
  const cfg = read('service-template-tab.yaml')
  assert.equal(cfg.actions.instantiate_dialog, true)
  for (const action of [
    'create_dialog',
    'update_dialog',
    'delete',
    'share',
    'chown',
    'chgrp',
  ])
    assert.notEqual(cfg.actions[action], true, action)
  assert.equal(cfg['info-tabs'].roles.enabled, true)
  assert.equal(cfg['info-tabs'].networks.enabled, true)
})

test('self-service account has quota/reporting and only safe credential actions', () => {
  const cfg = read('user-tab.yaml')
  assert.equal(cfg['info-tabs'].quota.enabled, true)
  assert.equal(cfg['info-tabs'].accounting.enabled, true)
  assert.equal(cfg['info-tabs'].showback.enabled, true)
  assert.equal(cfg['info-tabs'].authentication.actions.update_password, true)
  assert.equal(cfg['info-tabs'].authentication.actions.public_ssh_key, true)
  assert.equal(cfg['info-tabs'].authentication.actions.private_ssh_key, false)
  assert.equal(
    cfg['info-tabs'].authentication.actions.change_authentication,
    false
  )
})

test('cloud view does not expose OpenNebula Marketplace Apps as the LayerSentry catalog', () => {
  assert.equal(readdirSync(cloud).includes('marketplace-app-tab.yaml'), false)
})

test('customer network pages hide provider cluster, driver and raw-attribute details', () => {
  const vnet = read('vnet-tab.yaml')
  assert.equal(vnet.filters.vn_mad, false)
  assert.equal(vnet['info-tabs'].cluster.enabled, false)
  assert.equal(vnet['info-tabs'].info.permissions_panel.enabled, false)
  assert.equal(vnet['info-tabs'].info.ownership_panel.enabled, false)
  assert.equal(vnet['info-tabs'].info.attributes_panel.enabled, false)
  const template = read('vnet-template-tab.yaml')
  assert.equal(template['info-tabs'].cluster.enabled, false)
  assert.equal(template['info-tabs'].template.enabled, false)
  assert.equal(template['info-tabs'].info.attributes_panel.enabled, false)
})

test('customer OneKS and data-protection pages hide native chmod and ownership panels', () => {
  for (const file of [
    'oneks-tab.yaml',
    'image-tab.yaml',
    'backup-tab.yaml',
    'backupjobs-tab.yaml',
  ]) {
    const cfg = read(file)
    assert.equal(cfg['info-tabs'].info.permissions_panel.enabled, false, file)
    assert.equal(cfg['info-tabs'].info.ownership_panel.enabled, false, file)
  }
})

test('OneFlow customer service page consumes published definitions instead of raw service authoring', () => {
  const cfg = read('service-tab.yaml')
  assert.equal(cfg.actions.instantiate_dialog, true)
  assert.equal(cfg.actions.create_dialog, false)
  assert.equal(cfg['info-tabs'].template.enabled, false)
  assert.equal(cfg['info-tabs'].info.permissions_panel.enabled, false)
  assert.equal(cfg['info-tabs'].info.ownership_panel.enabled, false)
})

test('self-service support can create tickets and comments', () => {
  const cfg = read('support-tab.yaml')
  assert.equal(cfg.actions.create_dialog, true)
  assert.equal(cfg['info-tabs'].comments.actions.comment, true)
})

test('remaining customer resource pages hide raw provider metadata', () => {
  for (const file of ['file-tab.yaml', 'sec-group-tab.yaml']) {
    const cfg = read(file)
    assert.equal(cfg['info-tabs'].info.permissions_panel.enabled, false, file)
    assert.equal(cfg['info-tabs'].info.ownership_panel.enabled, false, file)
    assert.equal(cfg['info-tabs'].info.attributes_panel.enabled, false, file)
  }
  const group = read('vm-group-tab.yaml')
  assert.equal(group['info-tabs'].info.permissions_panel.enabled, false)
  assert.equal(group['info-tabs'].info.ownership_panel.enabled, false)
  for (const file of ['service-template-tab.yaml', 'vrouter-tab.yaml']) {
    const cfg = read(file)
    assert.equal(cfg.filters.owner, false, file)
    assert.equal(cfg.filters.group, false, file)
    assert.equal(cfg['info-tabs'].template.enabled, false, file)
    assert.equal(cfg['info-tabs'].info.permissions_panel.enabled, false, file)
    assert.equal(cfg['info-tabs'].info.ownership_panel.enabled, false, file)
  }
})

test('self-service quota page is read-only', () => {
  const cfg = read('user-tab.yaml')
  assert.equal(cfg['info-tabs'].quota.enabled, true)
  assert.equal(cfg['info-tabs'].quota.actions.quotas_dialog, false)
  assert.equal(cfg['info-tabs'].info.attributes_panel.enabled, false)
})

test('cloud image creation hides native advanced and arbitrary attribute steps', () => {
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Image/Forms/CreateForm/Steps/index.js'
    ),
    'utf8'
  )
  const container = readFileSync(
    resolve(__dirname, '../../src/modules/containers/Images/Create.js'),
    'utf8'
  )
  assert.match(steps, /view === ["']cloud["'][\s\S]*\? \[General, Datastore\]/)
  assert.match(
    steps,
    /: \[General, Datastore, AdvancedOptions, CustomAttributes\]/
  )
  assert.match(container, /const \{ view \} = useViews\(\)/)
  assert.match(container, /adminGroup,[\s\S]*view,/)
})

test('cloud OneKS create shows only a named compute location while preserving native placement ID', () => {
  const schema = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/OneKs/Forms/CreateOneKsClusterForm/Steps/Cluster/schema.js'
    ),
    'utf8'
  )
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/OneKs/Forms/CreateOneKsClusterForm/Steps/index.js'
    ),
    'utf8'
  )
  const create = readFileSync(
    resolve(__dirname, '../../src/modules/containers/OneKs/Create.js'),
    'utf8'
  )
  assert.match(schema, /CLOUD_CLUSTER_COLUMNS = new Set\(\[["']name["']\]\)/)
  assert.match(
    schema,
    /view === ["']cloud["'] \? ["']Compute location["'] : T\.SelectCluster/
  )
  assert.match(
    schema,
    /model:[\s\S]*view === ["']cloud["'] \? cloudClusterSelectionTable : clusterSelectionTable/
  )
  assert.match(steps, /Cluster\(formProps\)/)
  assert.match(steps, /deployment:[\s\S]*cluster:[\s\S]*id: toId\(clusterId\)/)
  assert.match(create, /const \{ view \} = useViews\(\)/)
  assert.match(create, /clusterId,[\s\S]*view,/)
})

test('cloud network-template instantiate accepts only address and security overrides', () => {
  const cfg = read('vnet-template-tab.yaml')
  assert.equal(cfg['instantiate-tabs'].address.enabled, true)
  assert.equal(cfg['instantiate-tabs'].security.enabled, true)
  assert.equal(cfg['instantiate-tabs'].configuration.enabled, false)
  assert.equal(cfg['instantiate-tabs'].context.enabled, false)
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VnTemplate/Forms/InstantiateForm/Steps/index.js'
    ),
    'utf8'
  )
  const container = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VnTemplates/Instantiate.js'
    ),
    'utf8'
  )
  assert.match(
    steps,
    /CLOUD_INSTANTIATE_CONFIGURATION_TABS = \[["']addresses["'], ["']security["']\]/
  )
  assert.match(
    steps,
    /props\?\.view === ["']cloud["'][\s\S]*CLOUD_INSTANTIATE_CONFIGURATION_TABS/
  )
  assert.match(container, /const \{ view \} = useViews\(\)/)
  assert.match(container, /adminGroup,[\s\S]*view,/)
})

test('cloud VRouter instantiate hides keepalived and implementation NIC controls', () => {
  const basic = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VrTemplate/Forms/InstantiateForm/Steps/BasicConfiguration/informationSchema.js'
    ),
    'utf8'
  )
  const networking = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VrTemplate/Forms/InstantiateForm/Steps/Networking/schema.js'
    ),
    'utf8'
  )
  const core = readFileSync(
    resolve(__dirname, '../../../../src/vrouter/VirtualRouter.cc'),
    'utf8'
  )
  assert.match(
    basic,
    /view === ["']cloud["'] \? \[NAME, DESCRIPTION, INSTANCES\]/
  )
  assert.match(
    networking,
    /view === ["']cloud["'][\s\S]*NETWORK, FORCEIPV4, FORCEIPV6, SECURITY_GROUPS/
  )
  assert.match(core, /keepalived_id = \(oid % 255\) \+ 1/)
  assert.match(
    core,
    /if \(!obj_template->get\("KEEPALIVED_ID", keepalived_id\)\)/
  )
})

test('cloud VM Group keeps VM affinity but blocks physical-host placement edits', () => {
  const roles = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmGroup/Forms/CreateForm/Steps/Roles/index.js'
    ),
    'utf8'
  )
  const steps = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VmGroup/Forms/CreateForm/Steps/index.js'
    ),
    'utf8'
  )
  const container = readFileSync(
    resolve(__dirname, '../../src/modules/containers/VmGroups/Create.js'),
    'utf8'
  )
  assert.match(roles, /view !== ["']cloud["'] && \([\s\S]*<HostAffinityPanel/)
  assert.match(roles, /<RoleVmVmPanel/)
  assert.match(steps, /stepProps\?\.view === ["']cloud["']/)
  assert.match(steps, /sourceRole = sourceRoles\.find/)
  assert.match(steps, /HOST_AFFINED: toList\(sourceRole\?\.HOST_AFFINED\)/)
  assert.match(container, /const \{ view \} = useViews\(\)/)
  assert.match(container, /stepProps=\{\{ \.\.\.data, view \}\}/)
})

test('cloud image and file creation reject arbitrary PATH sources while native admin keeps them', () => {
  const imageView = read('image-tab.yaml')
  const fileView = read('file-tab.yaml')
  assert.equal(imageView.actions.import_dialog, false)
  assert.equal(fileView.actions.import_dialog, false)
  const imageSchema = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Image/Forms/CreateForm/Steps/General/schema.js'
    ),
    'utf8'
  )
  const fileSchema = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Files/Forms/CreateForm/Steps/General/schema.js'
    ),
    'utf8'
  )
  const fileContainer = readFileSync(
    resolve(__dirname, '../../src/modules/containers/Files/Create.js'),
    'utf8'
  )
  assert.match(
    imageSchema,
    /oneOf\(\[IMAGE_LOCATION_TYPES\.UPLOAD, IMAGE_LOCATION_TYPES\.EMPTY\]\)/
  )
  assert.match(imageSchema, /view !== ["']cloud["'] && PATH_FIELD/)
  assert.match(fileSchema, /oneOf\(\[IMAGE_LOCATION_TYPES\.UPLOAD\]\)/)
  assert.match(fileSchema, /view !== ["']cloud["'] && PATH_FIELD/)
  assert.match(fileContainer, /stepProps=\{\{ view \}\}/)
})

test('second-pass VM detail boundary hides provider topology and Marketplace escapes', () => {
  const root = resolve(
    __dirname,
    '../../src/modules/resources/VirtualMachine/Tabs'
  )
  const info = readFileSync(resolve(root, 'Info/index.js'), 'utf8')
  const history = readFileSync(resolve(root, 'History/index.js'), 'utf8')
  const storage = readFileSync(resolve(root, 'Storage/index.js'), 'utf8')
  const network = readFileSync(resolve(root, 'Network/index.js'), 'utf8')
  assert.match(info, /const isCloud = view === ['"]cloud['"]/)
  for (const token of [
    'T.Owner',
    'T.Hypervisor',
    'T.Host',
    'T.Cluster',
    'T.DeployID',
  ])
    assert.match(
      info,
      new RegExp(`!isCloud[^\\n]*.*${token.replace('.', '\\.')}`, 's')
    )
  for (const id of ['hostname', 'datastore', 'vmMad', 'tmMad'])
    assert.match(history, new RegExp(id))
  for (const id of ['target', 'datastore', 'fs', 'tm_mad', 'driver'])
    assert.match(storage, new RegExp(id))
  assert.match(
    network,
    /cloudHiddenColumns = new Set\(\[['"]target['"], ['"]vn_mad['"]\]\)/
  )
})

test('second-pass OneKS network router and service views hide provider backing resources', () => {
  const oneKsInfo = readFileSync(
    resolve(__dirname, '../../src/modules/resources/OneKs/Tabs/Info/index.js'),
    'utf8'
  )
  const nodeGroups = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/OneKs/Tabs/NodeGroups/index.js'
    ),
    'utf8'
  )
  const vnetInfo = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VirtualNetwork/Tabs/Info/index.js'
    ),
    'utf8'
  )
  const vrouterVms = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/VirtualRouter/Tabs/Vms/index.js'
    ),
    'utf8'
  )
  const serviceRoles = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Service/Tabs/Roles/index.js'
    ),
    'utf8'
  )
  assert.match(oneKsInfo, /const isCloud = view === ['"]cloud['"]/)
  assert.match(oneKsInfo, /isCloud[\s\S]*targetCluster\?\.NAME/)
  assert.match(nodeGroups, /CLOUD_HIDDEN_VM_COLUMN_IDS/)
  for (const token of ['T.Driver', 'T.PhysicalDevice', 'T.Bridge', 'T.VlanId'])
    assert.match(
      vnetInfo,
      new RegExp(`!isCloud[^\\n]*.*${token.replace('.', '\\.')}`, 's')
    )
  assert.match(vrouterVms, /CLOUD_HIDDEN_COLUMN_IDS/)
  assert.match(serviceRoles, /!isCloud \|\| id !== ['"]hostname['"]/)
})

test('second-pass image backup file and datastore selectors hide provider storage internals', () => {
  const files = [
    '../../src/modules/resources/Files/Forms/CreateForm/Steps/DatastoresTable/schema.js',
    '../../src/modules/resources/Image/Forms/CloneForm/Steps/DatastoresTable/schema.js',
    '../../src/modules/resources/BackupJobs/Forms/CreateForm/Steps/DatastoreTable/schema.js',
    '../../src/modules/resources/VirtualMachine/Forms/BackupForm/Steps/DatastoresTable/schema.js',
    '../../src/modules/resources/Backups/Forms/RestoreForm/Steps/DatastoresTable/index.js',
  ]
  for (const file of files) {
    const source = readFileSync(resolve(__dirname, file), 'utf8')
    for (const id of ['id', 'type', 'clusters', 'owner', 'group', 'labels'])
      assert.match(source, new RegExp(`['"]${id}['"]`), `${file}: ${id}`)
  }
  const imageInfo = readFileSync(
    resolve(__dirname, '../../src/modules/resources/Image/Tabs/Info/index.js'),
    'utf8'
  )
  const fileInfo = readFileSync(
    resolve(__dirname, '../../src/modules/resources/Files/Tabs/Info/index.js'),
    'utf8'
  )
  const backupInfo = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/resources/Backups/Tabs/Info/index.js'
    ),
    'utf8'
  )
  for (const source of [imageInfo, fileInfo, backupInfo])
    assert.match(source, /!isCloud[\s\S]*DATASTORE_ID/)
})

test('third-pass card and drawer surfaces hide provider metadata in cloud', () => {
  const cardFiles = [
    'VirtualMachine/Card.js',
    'VirtualNetwork/Card.js',
    'VnTemplate/Card.js',
    'Image/Card.js',
    'Files/Card.js',
    'Backups/Card.js',
    'BackupJobs/Card.js',
    'VmGroup/Card.js',
    'VmTemplate/Card.js',
    'VirtualRouter/Card.js',
    'SecurityGroups/Card.js',
    'Service/Card.js',
    'ServiceTemplate/Card.js',
    'OneKs/Card.js',
  ]
  for (const file of cardFiles) {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/resources', file),
      'utf8'
    )
    assert.match(source, /const isCloud = view === ['"]cloud['"]/, file)
    if (/\b(?:UNAME|GNAME)\b/.test(source)) {
      assert.match(
        source,
        /!isCloud && \[(?:T\.)?Owner|!isCloud && \['Owner'/,
        `${file}: owner`
      )
      assert.match(
        source,
        /!isCloud && \[(?:T\.)?Group|!isCloud && \['Group'/,
        `${file}: group`
      )
    }
  }

  const vmCard = readFileSync(
    resolve(__dirname, '../../src/modules/resources/VirtualMachine/Card.js'),
    'utf8'
  )
  assert.match(vmCard, /!isCloud && \[T\.Host, HOSTNAME\]/)

  for (const file of ['Image/Card.js', 'Files/Card.js', 'Backups/Card.js']) {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/resources', file),
      'utf8'
    )
    assert.match(source, /!isCloud && \[T\.Datastore, DATASTORE/)
    assert.match(source, /!isCloud && type && \[type, ['"]default['"]\]/)
  }

  const vnetCard = readFileSync(
    resolve(__dirname, '../../src/modules/resources/VirtualNetwork/Card.js'),
    'utf8'
  )
  assert.match(vnetCard, /!isCloud && \[T\.Cluster, cluster\]/)
  assert.match(vnetCard, /!isCloud && VN_MAD/)
})

test('third-pass list surfaces remove cloud provider columns and VM provider lookup', () => {
  const listFiles = [
    'VirtualMachines/VirtualMachines.js',
    'VirtualNetworks/VirtualNetworks.js',
    'VnTemplates/VnTemplates.js',
    'Images/Images.js',
    'Files/Files.js',
    'Backups/Backups.js',
    'BackupJobs/BackupJobs.js',
    'VmTemplates/VmTemplates.js',
    'VirtualRouters/VirtualRouters.js',
    'SecurityGroups/SecurityGroups.js',
    'VmGroups/VmGroups.js',
    'Services/Services.js',
    'ServiceTemplates/ServiceTemplates.js',
  ]
  for (const file of listFiles) {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/containers', file),
      'utf8'
    )
    assert.match(source, /const isCloud = view === ['"]cloud['"]/, file)
    assert.match(
      source,
      /const tableColumns = useMemo/,
      `${file}: tableColumns`
    )
    assert.match(source, /columns=\{tableColumns\}/, `${file}: list columns`)
  }

  const vmList = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualMachines/VirtualMachines.js'
    ),
    'utf8'
  )
  assert.match(
    vmList,
    /['"]hostname['"], ['"]cluster['"], ['"]owner['"], ['"]group['"]/
  )
  assert.match(vmList, /useGetClustersQuery\([^;]*skip: isCloud/s)

  const oneKsList = readFileSync(
    resolve(__dirname, '../../src/modules/containers/OneKs/OneKs.js'),
    'utf8'
  )
  assert.match(oneKsList, /const isCloud = view === ['"]cloud['"]/)
  assert.match(oneKsList, /const tableColumns = useMemo[\s\S]*isCloud/)
  assert.match(oneKsList, /columns=\{tableColumns\}/)

  assert.equal(read('vm-tab.yaml').filters?.hostname, false)
})

test('third-pass detail shells hide cloud provider headers summaries and Marketplace escape', () => {
  const detailFiles = [
    'VirtualMachines/Details/single.js',
    'VirtualNetworks/Details/single.js',
    'VnTemplates/Details/single.js',
    'Images/Details/single.js',
    'Files/Details/single.js',
    'Backups/Details/single.js',
    'BackupJobs/Details/single.js',
    'OneKs/Details/single.js',
    'VmTemplates/Details/single.js',
    'VirtualRouters/Details/single.js',
    'SecurityGroups/Details/single.js',
    'VmGroups/Details/single.js',
    'Services/Details/single.js',
    'ServiceTemplates/Details/single.js',
  ]
  for (const file of detailFiles) {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/containers', file),
      'utf8'
    )
    assert.match(source, /const isCloud = view === ['"]cloud['"]/, file)
    if (/T\.Owner/.test(source)) assert.match(source, /!isCloud && \[T\.Owner/)
    if (/T\.Group/.test(source)) assert.match(source, /!isCloud && \[T\.Group/)
  }

  const vm = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualMachines/Details/single.js'
    ),
    'utf8'
  )
  assert.match(vm, /!isCloud && \[T\.Host, hostName\]/)
  assert.match(vm, /!isCloud && \[hostName \?\? T\.Unknown, T\.Hostname\]/)
  assert.match(vm, /!isCloud && \[[\s\S]*value: ['"]create-app['"]/)

  const vmAggregated = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualMachines/Details/aggregated.js'
    ),
    'utf8'
  )
  assert.match(vmAggregated, /!isCloud && \[summary\.host, T\.Hostname\]/)

  for (const file of [
    'Images/Details/single.js',
    'Files/Details/single.js',
    'Backups/Details/single.js',
  ]) {
    const source = readFileSync(
      resolve(__dirname, '../../src/modules/containers', file),
      'utf8'
    )
    assert.match(source, /!isCloud && \[T\.Datastore, DATASTORE\]/)
    assert.match(
      source,
      /!isCloud && \[DATASTORE \?\? ['"]-['"], T\.Datastore\]/
    )
  }

  const vnet = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VirtualNetworks/Details/single.js'
    ),
    'utf8'
  )
  const vnetTemplate = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VnTemplates/Details/single.js'
    ),
    'utf8'
  )
  const vmTemplate = readFileSync(
    resolve(
      __dirname,
      '../../src/modules/containers/VmTemplates/Details/single.js'
    ),
    'utf8'
  )
  assert.match(vnet, /!isCloud && \[[\s\S]*T\.Driver/)
  assert.match(vnetTemplate, /!isCloud && \[[\s\S]*T\.Driver/)
  assert.match(vmTemplate, /!isCloud && \[[\s\S]*T\.Hypervisor/)
})
