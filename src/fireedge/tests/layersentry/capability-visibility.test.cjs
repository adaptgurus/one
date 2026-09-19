/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const read = (...parts) =>
  fs.readFileSync(path.join(fireedgeRoot, ...parts), 'utf8')

test('capabilities fail closed on the full production gate chain', () => {
  const source = read('src/client/apps/layersentry/capabilities.js')

  for (const gate of [
    'enabled',
    'implementation',
    'backend',
    'configuration',
    'health',
    'authorization',
    'compatibility',
    'qualification',
    'dataSafety',
  ]) {
    assert.match(source, new RegExp(`capability\\.${gate}`))
  }

  assert.match(source, /HIDDEN_NOT_INSTALLED/)
  assert.match(source, /HIDDEN_NOT_CONFIGURED/)
  assert.match(source, /HIDDEN_NOT_AUTHORIZED/)
  assert.match(source, /HIDDEN_NOT_QUALIFIED/)
  assert.match(source, /HIDDEN_INCOMPATIBLE/)
  assert.match(source, /isCapabilityEnabled/)
})

test('all backend-backed normal navigation entries carry a capability', () => {
  const navigation = read('src/client/apps/layersentry/navigation.js')

  for (const capability of [
    'COMPUTE',
    'BLUEPRINTS',
    'AFFINITY',
    'KUBERNETES',
    'APPLICATIONS_ONEFLOW',
    'STORAGE',
    'STORAGE_IMAGES',
    'STORAGE_FILES',
    'NETWORK',
    'NETWORK_TEMPLATES',
    'VIRTUAL_ROUTERS',
    'FIREWALL_RULES',
    'BACKUP_RECOVERY',
    'SITE_RECOVERY_DR',
    'OPERATIONS',
    'INFRA_HOSTS',
    'INFRA_CLUSTERS',
    'INFRA_STORAGE',
    'BACKUP_STORAGE',
    'INFRA_DRIVERS',
    'INFRA_ZONES',
    'PROVIDERS_ONEFORM',
    'ACCESS_USERS',
    'ACCESS_TEAMS',
    'ACCESS_PROJECTS',
    'ACCESS_ROLES',
    'ACCESS_LIMITS',
    'ACCESS_RULES',
    'PLATFORM_IMAGES',
    'PLATFORM_TEMPLATES',
    'PLATFORM_ROUTER_TEMPLATES',
    'MARKETPLACES',
    'MARKETPLACE_APPS',
  ]) {
    assert.match(navigation, new RegExp(`CAPABILITY_IDS\\.${capability}`))
  }

  assert.match(navigation, /always === true/)
  assert.match(navigation, /Boolean\(capability\)/)
  assert.match(navigation, /isCapabilityVisible\(capability, capabilityModel\)/)
  assert.doesNotMatch(navigation, /!capability \|\| isCapabilityVisible/)
})

test('direct URLs use the same fail-closed capability policy', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')

  for (const route of [
    '/compute',
    '/compute/create',
    '/compute/blueprints',
    '/compute/affinity',
    '/kubernetes',
    '/applications',
    '/storage',
    '/network',
    '/security',
    '/protection/site-recovery',
    '/infrastructure/hosts',
    '/infrastructure/storage/create',
    '/infrastructure/providers',
    '/access/users',
    '/platform/images',
    '/platform/marketplace-apps/create',
    '/support/create',
  ]) {
    assert.match(capabilities, new RegExp(route.replaceAll('/', '\\/')))
  }

  assert.match(capabilities, /if \(!capabilityId\) return false/)
  assert.match(capabilities, /MUTATING_CAPABILITIES\.has\(capabilityId\)/)
  assert.match(shell, /isCapabilityPathAvailable\(/)
  assert.match(shell, /Capability unavailable/)
  assert.match(shell, /data-layersentry-capability-unavailable/)
})

test('mutation routes and actions require enabled qualification, not read-only visibility', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')
  const area = read('src/client/apps/layersentry/pages/AreaPage.js')
  const compute = read('src/client/apps/layersentry/pages/ComputeWorkspace.js')

  for (const capability of [
    'VM_CREATE',
    'AFFINITY_CREATE',
    'KUBERNETES_CREATE',
    'APPLICATIONS_DEPLOY',
    'STORAGE_ONBOARDING',
    'NETWORK_CREATE',
    'FIREWALL_RULES_CREATE',
    'BACKUP_RECOVERY_CREATE',
    'BACKUP_STORAGE_CREATE',
    'PROVIDERS_ONEFORM_CREATE',
    'SUPPORT_TICKETING',
  ]) {
    assert.match(capabilities, new RegExp(`CAPABILITY_IDS\\.${capability}`))
  }

  assert.match(area, /Boolean\(createCapability\)/)
  assert.match(area, /isCapabilityEnabled\(createCapability, getCapabilityModel\(\)\)/)
  assert.match(compute, /isCapabilityEnabled\(\s*CAPABILITY_IDS\.VM_CREATE/)
  assert.doesNotMatch(area, /!createCapability \|\|/)
})

test('known blank core inventories bypass route-dependent embedded pages', () => {
  const bridge = read('src/client/apps/layersentry/components/ResourceBridge.js')

  assert.match(bridge, /VmAPI\.useGetVmsQuery/)
  assert.match(bridge, /VmTemplateAPI\.useGetTemplatesQuery/)
  assert.match(bridge, /VmGroupAPI\.useGetVMGroupsQuery/)
  assert.match(bridge, /'\/vm': VmInventory/)
  assert.match(bridge, /'\/vm-template': VmTemplateInventory/)
  assert.match(bridge, /'\/vm-group': VmGroupInventory/)
  assert.match(bridge, /data-layersentry-native-inventory/)
  assert.match(bridge, /Could not load inventory/)
})

test('deployment configuration defaults LayerSentry capabilities to fail closed', () => {
  const config = read('etc/sunstone/sunstone-server.conf')

  assert.match(config, /layersentry_capabilities: \{\}/)
  assert.match(config, /Empty or omitted means fail closed/)
})

test('external hypervisor migration remains absent from normal navigation', () => {
  const navigation = read('src/client/apps/layersentry/navigation.js')

  for (const forbidden of [
    'VMware Migration',
    'Hyper-V Migration',
    'Import VMware',
    'Import Hyper-V',
    'Convert VM',
  ]) {
    assert.doesNotMatch(navigation, new RegExp(forbidden, 'i'))
  }
})

test('search does not advertise hidden kubernetes capability', () => {
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')

  assert.match(shell, /placeholder="Search VMs, storage, networks\.\.\."/)
  assert.doesNotMatch(shell, /placeholder="[^"]*Kubernetes/)
})
