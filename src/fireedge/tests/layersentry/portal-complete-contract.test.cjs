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
    'Networks',
    'Network Blueprints',
    'Virtual Routers',
    'Firewall Rules',
    'Backup Plans',
    'Recovery Points',
    'Site Recovery / DR',
    'Operations',
    'Support',
    'Settings',
    'Compute Hosts',
    'Compute Clusters',
    'Storage Pools',
    'Backup Storage',
    'Drivers',
    'Zones / Sites',
    'Providers',
    'Users',
    'Teams',
    'Projects',
    'Roles',
    'Limits',
    'Access Rules',
    'Service Templates',
    'Router Templates',
    'Marketplaces',
    'Marketplace Apps',
  ]) {
    assert.match(
      nav,
      new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)
    )
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
  assert.doesNotMatch(
    server,
    /res\.redirect\(`\/\$\{defaultAppName\}\/sunstone`\)/
  )
})

test('non-Kubernetes workspaces have dedicated LayerSentry product surfaces', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  for (const component of [
    'ComputeWorkspace',
    'StorageWorkspace',
    'NetworkWorkspace',
    'ProtectionWorkspace',
    'ManagedServicesWorkspace',
    'ProductionServiceWizard',
    'OperationsWorkspace',
  ]) {
    assert.match(portal, new RegExp(component))
  }
})

test('Kubernetes remains OneKS-backed and gates cluster creation independently', () => {
  const workspace = read(
    'src/client/apps/layersentry/pages/KubernetesWorkspace.js'
  )
  assert.match(workspace, /View qualified OneKS clusters/)
  assert.match(workspace, /CAPABILITY_IDS\.KUBERNETES_CREATE/)
  assert.match(workspace, /isCapabilityEnabled\(/)
  assert.match(workspace, /canCreate \? \(/)
  assert.match(workspace, /legacyPath="\/kubernetes"/)
  assert.doesNotMatch(workspace, /Harbor|Argo CD|OpenEverest/)
})

test('LayerSentry presents the native admin view as Super Admin', () => {
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')
  const navigation = read('src/client/apps/layersentry/navigation.js')
  const portal = read('src/client/apps/layersentry/Portal.js')

  assert.match(shell, /admin: 'Super Admin'/)
  assert.match(navigation, /isPlatformAdminView = \(view\) => view === 'admin'/)
  assert.match(navigation, /label: 'Infrastructure'/)
  assert.match(navigation, /label: 'Access'/)
  assert.match(navigation, /label: 'Platform'/)
  assert.match(portal, /const isAdmin = view === 'admin'/)
})

test('compute summary reports OpenNebula VCPU before CPU share', () => {
  const compute = read('src/client/apps/layersentry/pages/ComputeWorkspace.js')

  assert.match(
    compute,
    /TEMPLATE\?\.VCPU \?\? vm\?\.TEMPLATE\?\.CPU/
  )
  assert.doesNotMatch(
    compute,
    /TEMPLATE\?\.CPU \?\? vm\?\.TEMPLATE\?\.VCPU/
  )
  assert.match(compute, /label="Allocated vCPU"/)
})

test('portal shell is responsive and exposes operations help and settings controls', () => {
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')
  assert.match(shell, /Open navigation/)
  assert.match(shell, /Operations and alerts/)
  assert.match(shell, /aria-label="Support"/)
  assert.match(shell, /aria-label="Settings"/)
  assert.match(shell, /ml: \{ xs: 0, md:/)
})
