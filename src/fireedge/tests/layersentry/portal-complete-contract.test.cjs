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
  const backupPlan = read(
    'src/client/apps/layersentry/pages/BackupPlanCreateWizard.js'
  )
  assert.match(page, /data-layersentry-workflow-steps/)
  assert.match(portal, /Operating System/)
  assert.match(
    portal,
    /PRODUCT_PATHS\.KUBERNETES_CREATE[\s\S]*Redirect to=\{PRODUCT_PATHS\.KUBERNETES\}/
  )
  assert.match(backupPlan, /Retention/)
  assert.match(portal, /Protocol & Port/)
})

test('bare FireEdge redirects to LayerSentry and native Sunstone is not the default', () => {
  const server = read('src/server/index.js')
  const entrypoint = read('src/server/routes/entrypoints/App.js')
  const bootstrap = read('src/client/bootstrap.js')
  const appRoot = read('src/client/apps/layersentry/AppRoot.js')
  assert.match(server, /res\.redirect\(`\/\$\{defaultAppName\}\/layersentry`\)/)
  assert.doesNotMatch(
    server,
    /res\.redirect\(`\/\$\{defaultAppName\}\/sunstone`\)/
  )
  assert.match(entrypoint, /requestedAppName \|\| 'layersentry'/)
  assert.match(entrypoint, /<div id="root"><\/div>/)
  assert.doesNotMatch(entrypoint, /<div id="root"\s*\/>/)
  assert.match(bootstrap, /requestedApp === 'sunstone'/)
  assert.match(bootstrap, /import\('client\/layersentry'\)/)
  assert.match(appRoot, /safeProductRedirect/)
  assert.match(appRoot, /includes\('undefined'\)/)
})

test('shared modules cannot inherit a host-only locale that blanks LayerSentry', () => {
  const dashboard = read('src/modules/containers/Dashboard/General.js')
  const bootstrap = read('src/client/bootstrap.js')

  assert.match(dashboard, /new Intl\.NumberFormat\('en'\)/)
  assert.doesNotMatch(dashboard, /new Intl\.NumberFormat\(\)/)
  assert.match(bootstrap, /Intl\.getCanonicalLocales\(requested\)/)
  assert.match(bootstrap, /Object\.defineProperty\(navigator, 'language'/)
  assert.match(bootstrap, /normalizeBrowserLocale\(\)/)
})

test('normal Settings never links to a provider-native portal', () => {
  const settings = read('src/client/apps/layersentry/pages/Settings.js')

  assert.doesNotMatch(settings, /\/sunstone|Open native interface/)
  assert.match(settings, /Password & TOTP/)
  assert.match(settings, /Identity Providers/)
  assert.match(settings, /Time & Locale/)
  assert.match(settings, /Display timezone/)
  assert.match(settings, /LAYERSENTRY_TIMEZONE_KEY/)
  const timezone = read('src/client/apps/layersentry/timezone.js')
  assert.match(timezone, /Asia\/Kolkata/)
  assert.match(timezone, /Intl\.DateTimeFormat/)
  assert.match(settings, /Proxy & Notifications/)
  assert.match(settings, /data-layersentry-native-console-hidden/)
})

test('shipped capability profile exposes qualified core read inventories', () => {
  const config = read('etc/sunstone/sunstone-server.conf')

  for (const capability of [
    'COMPUTE',
    'STORAGE',
    'NETWORK',
    'BACKUP_RECOVERY',
    'OPERATIONS',
    'INFRA_HOSTS',
    'INFRA_CLUSTERS',
    'INFRA_STORAGE',
    'INFRA_ZONES',
    'ACCESS_PROJECTS',
    'ACCESS_LIMITS',
    'ACCESS_RULES',
  ]) {
    assert.match(config, new RegExp(`^  ${capability}:`, 'm'))
  }
  assert.match(config, /BACKUP_RECOVERY:[\s\S]*?dataSafety: true/)
  assert.doesNotMatch(config, /^ {2}SITE_RECOVERY_DR:/m)
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

test('Kubernetes uses the typed KubeOne portal and never falls back to OneKS', () => {
  const workspace = read(
    'src/client/apps/layersentry/pages/KubernetesWorkspace.js'
  )
  const portal = read('src/client/apps/layersentry/Portal.js')
  const proxy = read('src/server/routes/api/kubeoneportal/functions.js')
  assert.match(workspace, /KubeOnePortalAPI\.useGetKubeOneClustersQuery/)
  assert.match(workspace, /Create namespace/)
  assert.match(workspace, /Download kubeconfig/)
  assert.match(workspace, /GPU \/ vGPU profile/)
  assert.match(workspace, /Worker reconciliation:/)
  assert.match(proxy, /\/v1\/kubernetes\/clusters/)
  assert.match(proxy, /worker-reconciliation/)
  assert.doesNotMatch(workspace, /OneKS|legacyPath/)
  assert.doesNotMatch(portal, /legacyPath: '\/kubernetes\/create'/)
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

  assert.match(compute, /TEMPLATE\?\.VCPU \?\? vm\?\.TEMPLATE\?\.CPU/)
  assert.doesNotMatch(compute, /TEMPLATE\?\.CPU \?\? vm\?\.TEMPLATE\?\.VCPU/)
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
