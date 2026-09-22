/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('DBaaS and APaaS replace customer VM Blueprints navigation', () => {
  const navigation = read('src/client/apps/layersentry/navigation.js')
  const compute = read('src/client/apps/layersentry/pages/ComputeWorkspace.js')
  const portal = read('src/client/apps/layersentry/Portal.js')

  assert.match(navigation, /DBAAS: '\/dbaas'/)
  assert.match(navigation, /APAAS: '\/apaas'/)
  assert.match(navigation, /label: 'DBaaS'/)
  assert.match(navigation, /label: 'APaaS'/)
  assert.doesNotMatch(navigation, /label: 'VM Blueprints'/)
  assert.doesNotMatch(compute, /label: 'VM Blueprints'/)
  assert.match(portal, /ManagedServicesWorkspace mode="dbaas"/)
  assert.match(portal, /ManagedServicesWorkspace mode="apaas"/)
})

test('managed service catalog exposes all 27 authoritative families', () => {
  const catalog = require('../../src/server/routes/api/serviceblueprints/catalog')
  assert.equal(catalog.CATALOG.length, 27)

  const ids = catalog.CATALOG.map(({ id }) => id)
  assert.equal(new Set(ids).size, 27)

  for (const id of [
    'postgresql',
    'mysql-family',
    'mariadb',
    'mongodb-community',
    'percona-mongodb',
    'redis',
    'valkey',
    'kafka',
    'tomcat',
    'superset',
    'keycloak',
    'opensearch',
    'prometheus',
    'grafana',
    'alloy',
  ]) {
    assert.ok(ids.includes(id), 'missing service family ' + id)
  }
})

test('catalog cards launch application-specific production wizard', () => {
  const workspace = read(
    'src/client/apps/layersentry/pages/ManagedServicesWorkspace.js'
  )
  const wizard = read(
    'src/client/apps/layersentry/pages/ProductionServiceWizard.js'
  )

  assert.match(workspace, /FALLBACK_BLUEPRINTS/)
  assert.match(workspace, /Configure & Install/)
  assert.match(workspace, /blueprint=/)
  assert.match(workspace, /mode: PropTypes\.oneOf\(\['dbaas', 'apaas'\]\)/)
  assert.match(wizard, /new URLSearchParams\(location\.search\)/)
  assert.match(wizard, /requestedBlueprint/)
  assert.match(wizard, /createDraft\(requestedBlueprint\)/)
})

test('header shows current role and supports safe view/account switching', () => {
  const shell = read(
    'src/client/apps/layersentry/components/PortalShell.js'
  )

  assert.match(shell, /admin: 'Super Admin'/)
  assert.match(shell, /data-layersentry-current-role/)
  assert.match(shell, /data-layersentry-role-switcher/)
  assert.match(shell, /changeView\(nextView\)/)
  assert.match(shell, /availableViews/)
  assert.match(shell, /data-layersentry-switch-account/)
  assert.match(shell, /logout\(\)/)
})

test('VM inventory includes storage and live utilization without fabricating missing metrics', () => {
  const bridge = read(
    'src/client/apps/layersentry/components/ResourceBridge.js'
  )

  assert.match(bridge, /Attached storage/)
  assert.match(bridge, /Current utilization/)
  assert.match(bridge, /MONITORING\?\.CPU/)
  assert.match(bridge, /MONITORING\?\.MEMORY/)
  assert.match(bridge, /MONITORING\?\.DISK_SIZE/)
  assert.match(bridge, /guest usage unavailable/)
  assert.match(bridge, /label="CPU"/)
  assert.match(bridge, /label="RAM"/)
  assert.match(bridge, /label="Disk use"/)
})

test('Super Admin VM editor keeps resize and details behind separate gates', () => {
  const compute = read('src/client/apps/layersentry/pages/ComputeWorkspace.js')
  const caps = read('src/client/apps/layersentry/capabilities.js')

  assert.match(caps, /VM_RESIZE: 'VM_RESIZE'/)
  assert.match(caps, /VM_UPDATE_CONFIG: 'VM_UPDATE_CONFIG'/)
  assert.match(compute, /data-layersentry-vm-admin-editor/)
  assert.match(compute, /CAPABILITY_IDS\.VM_RESIZE/)
  assert.match(compute, /CAPABILITY_IDS\.VM_UPDATE_CONFIG/)
  assert.match(compute, /VmAPI\.useResizeMutation/)
  assert.match(compute, /VmAPI\.useRenameVmMutation/)
  assert.match(compute, /VmAPI\.useUpdateUserTemplateMutation/)
  assert.match(compute, /Current vCPU/)
  assert.match(compute, /Attached storage/)
})

test('Drivers use live LayerSentry compute and storage inventory instead of failing OneForm list', () => {
  const bridge = read(
    'src/client/apps/layersentry/components/ResourceBridge.js'
  )

  assert.match(bridge, /const DriverInventory = \(\) =>/)
  assert.match(bridge, /HostAPI\.useGetHostsQuery\(\)/)
  assert.match(bridge, /DatastoreAPI\.useGetDatastoresQuery\(\)/)
  assert.match(bridge, /LayerSentry driver/)
  assert.doesNotMatch(bridge, /DriverAPI\.useGetDriversQuery/)
})

test('LayerSentry customer UI does not expose OpenNebula branding', () => {
  const app = path.join(root, 'src/client/apps/layersentry')
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target)
    }
  }
  visit(app)

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const customerSource = source.split('\n').slice(16).join('\n')
    assert.doesNotMatch(
      customerSource,
      /OpenNebula/,
      'backend brand leaked in ' + path.relative(root, file)
    )
  }
})
