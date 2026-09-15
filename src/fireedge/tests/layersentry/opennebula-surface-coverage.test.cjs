/* SPDX-License-Identifier: Apache-2.0 */
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
    (routePath) => !nativeSurface(routePath) && !intentionallyAbstracted.has(routePath)
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
    assert.match(navigation, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
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
    assert.match(navigation, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
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
