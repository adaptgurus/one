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
const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const portal = read('src/client/apps/layersentry/Portal.js')
const navigation = read('src/client/apps/layersentry/navigation.js')
const manifest = YAML.parse(read('etc/sunstone/tab-manifest.yaml'))

const sidebarPaths = manifest.flatMap((section) =>
  (section.routes ?? (section.path ? [section] : []))
    .filter(({ sidebar }) => sidebar)
    .map(({ path: routePath }) => routePath)
)

const nativeSurface = (routePath) =>
  portal.includes(`'${routePath}'`) || portal.includes(`"${routePath}"`)

test('all native Sunstone sidebar resources have a LayerSentry surface', () => {
  const intentionallyAbstracted = new Set([
    '/vm-template',
    '/service-template',
    '/datastore',
    '/image',
    '/group',
    '/virtual-data-center',
    '/acl',
  ])
  const missing = sidebarPaths.filter(
    (routePath) =>
      !nativeSurface(routePath) && !intentionallyAbstracted.has(routePath)
  )

  assert.deepEqual(missing, [])
})

test('discoverability includes the formerly hidden OpenNebula surfaces', () => {
  for (const label of [
    'Affinity Groups',
    'Files',
    'Network Blueprints',
    'Virtual Routers',
    'Backup Plans',
    'Recovery Points',
    'Site Recovery / DR',
  ]) {
    assert.match(
      navigation,
      new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  }
})

test('admin-only OpenNebula inventory remains admin-only and discoverable', () => {
  for (const label of [
    'Backup Storage',
    'Drivers',
    'Router Templates',
    'Service Templates',
    'Marketplaces',
    'Marketplace Apps',
  ]) {
    assert.match(
      navigation,
      new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  }
  assert.match(navigation, /isPlatformAdminView/)
})

test('site recovery never presents request metadata as active DR', () => {
  const recovery = read(
    'src/client/apps/layersentry/pages/SiteRecoveryWorkspace.js'
  )
  const protection = read('src/modules/utils/layersentryProtection.js')
  assert.match(recovery, /DR is not configured in this lab/)
  assert.match(recovery, /Ceph RBD mirroring/)
  assert.match(protection, /REQUEST_STATE: 'REQUESTED_NOT_ACTIVE'/)
})
test('customer service catalog exposes DBaaS and APaaS instead of VM Blueprints', () => {
  assert.match(navigation, /label: 'DBaaS'/)
  assert.match(navigation, /label: 'APaaS'/)
  assert.doesNotMatch(navigation, /label: 'VM Blueprints'/)
  assert.match(portal, /PRODUCT_PATHS\.DBAAS/)
  assert.match(portal, /PRODUCT_PATHS\.APAAS/)
  assert.match(portal, /ManagedServicesWorkspace/)
})

test('network blueprint creation remains administrator-only', () => {
  assert.match(
    portal,
    /createTo: isAdmin \? '\/network-template\/create' : undefined/
  )
})
test('backup storage lists only real OpenNebula backup datastores', () => {
  const storage = read(
    'src/client/apps/layersentry/pages/BackupStorageWorkspace.js'
  )
  assert.match(storage, /DATASTORE_TYPES\.BACKUP\.id/)
  assert.match(storage, /Only TYPE=BACKUP_DS is counted/)
  assert.doesNotMatch(storage, /legacyPath="\/datastore"/)
})

test('customer protection and DR avoid provider inventory queries', () => {
  const protection = read(
    'src/client/apps/layersentry/pages/ProtectionWorkspace.js'
  )
  const recovery = read(
    'src/client/apps/layersentry/pages/SiteRecoveryWorkspace.js'
  )
  assert.match(protection, /skip: !isAdmin/)
  assert.match(recovery, /useGetZonesQuery\(undefined, \{ skip: !isAdmin \}\)/)
  assert.match(recovery, /skip: !isAdmin/)
})
test('admin Marketplace Apps and Support expose creation actions', () => {
  assert.match(portal, /PLATFORM_MARKETPLACE_APPS_CREATE/)
  assert.match(portal, /legacyPath: '\/marketplace-app\/create'/)
  assert.match(portal, /createLabel: 'Create Marketplace App'/)
  assert.match(portal, /createTo: '\/support\/create'/)
  assert.match(portal, /createLabel: 'Create Ticket'/)
})
