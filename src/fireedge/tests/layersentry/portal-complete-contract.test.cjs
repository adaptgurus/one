/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('LayerSentry is a first-class FireEdge application with its own URL bundle', () => {
  const defaults = read('src/server/utils/constants/defaults.js')
  const constants = read('src/modules/constants/index.js')
  const client = read('src/client/layersentry.js')
  const rootApp = read('src/client/apps/layersentry/Root.js')
  const serverApp = read('src/server/routes/entrypoints/App.js')

  assert.match(defaults, /appNameLayerSentry = 'layersentry'/)
  assert.match(constants, /layersentry: 'layersentry'/)
  assert.match(client, /client\/apps\/layersentry\/Root/)
  assert.match(rootApp, /basename=\{`\$\{APP_URL\}\/\$\{APP_NAME\}`\}/)
  assert.match(serverApp, /Object\.values\(defaultApps\)/)
})

test('storage workspace preserves detach and delete as separate operations', () => {
  const storage = read('src/client/apps/layersentry/pages/StorageWorkspace.js')
  assert.match(storage, /PERSISTENT: 'YES'/)
  assert.match(storage, /useDetachDiskMutation/)
  assert.match(storage, /useRemoveImageMutation/)
  assert.match(storage, /The disk image is not deleted/)
  assert.match(storage, /Delete permanently/)
  assert.match(storage, /Permanent deletion cannot be undone/)
})

test('product navigation covers customer and administrator workspaces', () => {
  const nav = read('src/client/apps/layersentry/navigation.js')
  for (const label of [
    'Overview',
    'Compute',
    'Kubernetes',
    'Applications',
    'Storage',
    'Network',
    'Protection',
    'Security',
    'Operations',
    'Support',
    'Settings',
    'Compute Hosts',
    'Compute Clusters',
    'Storage Pools',
    'Zones / Sites',
    'Providers',
    'Users',
    'Teams',
    'Projects',
    'Roles',
    'Limits',
    'Access Rules',
  ]) {
    assert.match(nav, new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
})

test('creation pages expose consistent guided workflow stages', () => {
  const page = read('src/client/apps/layersentry/pages/CreatePage.js')
  const portal = read('src/client/apps/layersentry/Portal.js')
  assert.match(page, /data-layersentry-workflow-steps/)
  assert.match(portal, /Operating System/)
  assert.match(portal, /Control Plane/)
  assert.match(portal, /Retention/)
  assert.match(portal, /Protocol & Port/)
})

test('bare FireEdge redirects to LayerSentry and native Sunstone is not the default', () => {
  const server = read('src/server/index.js')
  assert.match(server, /res\.redirect\(`\/\$\{defaultAppName\}\/layersentry`\)/)
  assert.doesNotMatch(server, /res\.redirect\(`\/\$\{defaultAppName\}\/sunstone`\)/)
})

test('non-Kubernetes workspaces have dedicated LayerSentry product surfaces', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  for (const component of [
    'ComputeWorkspace',
    'StorageWorkspace',
    'NetworkWorkspace',
    'ProtectionWorkspace',
    'ApplicationsWorkspace',
    'OperationsWorkspace',
  ]) {
    assert.match(portal, new RegExp(component))
  }
})

test('Kubernetes custom UX is deferred while OneKS lifecycle remains bridged', () => {
  const workspace = read('src/client/apps/layersentry/pages/KubernetesWorkspace.js')
  assert.match(workspace, /existing OneKS lifecycle/)
  assert.match(workspace, /legacyPath="\/kubernetes"/)
  assert.doesNotMatch(workspace, /Harbor|Argo CD|OpenEverest/)
})

test('portal shell is responsive and exposes operations help and settings controls', () => {
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')
  assert.match(shell, /Open navigation/)
  assert.match(shell, /Operations and alerts/)
  assert.match(shell, /aria-label="Support"/)
  assert.match(shell, /aria-label="Settings"/)
  assert.match(shell, /ml: \{ xs: 0, md:/)
})
