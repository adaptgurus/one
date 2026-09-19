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
  assert.match(source, /READ_ONLY_SAFE/)
  assert.match(source, /mutation-safe read-only presentation/)
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

  assert.match(capabilities, /CAPABILITY_ENDPOINT_REQUIREMENTS/)
  assert.match(capabilities, /flattenEndpointPaths/)
  assert.match(capabilities, /endpointAuthorized/)
  assert.match(
    capabilities,
    /capability\?\.authorization === true && endpointAuthorized/
  )
  assert.match(capabilities, /'\/dashboard'/)
  assert.match(capabilities, /pathname === path/)
  assert.doesNotMatch(capabilities, /pathname\.startsWith/)
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
  const applications = read(
    'src/client/apps/layersentry/pages/ApplicationsWorkspace.js'
  )
  const storage = read('src/client/apps/layersentry/pages/StorageWorkspace.js')
  const network = read('src/client/apps/layersentry/pages/NetworkWorkspace.js')
  const kubernetes = read(
    'src/client/apps/layersentry/pages/KubernetesWorkspace.js'
  )
  const protection = read(
    'src/client/apps/layersentry/pages/ProtectionWorkspace.js'
  )

  for (const capability of [
    'VM_CREATE',
    'AFFINITY_CREATE',
    'KUBERNETES_CREATE',
    'APPLICATIONS_DEPLOY',
    'STORAGE_ONBOARDING',
    'STORAGE_DISK_ATTACH',
    'STORAGE_DISK_RESIZE',
    'STORAGE_DISK_DETACH',
    'STORAGE_IMAGE_DELETE',
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
  assert.match(
    area,
    /isCapabilityEnabled\(createCapability, getCapabilityModel\(endpoints\)\)/
  )
  assert.match(area, /\[createCapability, createTo, endpoints\]/)
  assert.match(compute, /isCapabilityEnabled\(\s*CAPABILITY_IDS\.VM_CREATE/)
  assert.match(applications, /CAPABILITY_IDS\.APPLICATIONS_DEPLOY/)
  assert.match(applications, /isCapabilityEnabled\(/)
  assert.match(applications, /canDeploy \? \(/)
  assert.match(storage, /CAPABILITY_IDS\.STORAGE_DISK_ATTACH/)
  assert.match(storage, /CAPABILITY_IDS\.STORAGE_DISK_RESIZE/)
  assert.match(storage, /CAPABILITY_IDS\.STORAGE_DISK_DETACH/)
  assert.match(storage, /CAPABILITY_IDS\.STORAGE_IMAGE_DELETE/)
  assert.match(network, /CAPABILITY_IDS\.NETWORK_CREATE/)
  assert.match(network, /canCreate \? \(/)
  assert.match(kubernetes, /CAPABILITY_IDS\.KUBERNETES_CREATE/)
  assert.match(kubernetes, /canCreate \? \(/)
  assert.match(protection, /CAPABILITY_IDS\.BACKUP_RECOVERY_CREATE/)
  assert.match(protection, /CAPABILITY_IDS\.BACKUP_STORAGE/)
  assert.doesNotMatch(area, /!createCapability \|\|/)
})

test('native detail routes are not implicitly authorized by inventory capability', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')

  assert.match(capabilities, /\['\/vm', CAPABILITY_IDS\.COMPUTE\]/)
  assert.doesNotMatch(capabilities, /'\/vm\/:/)
  assert.doesNotMatch(capabilities, /startsWith/)
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

test('deployment configuration prequalifies only proven read-only core inventories', () => {
  const config = read('etc/sunstone/sunstone-server.conf')

  assert.match(config, /Empty or omitted means fail closed/)
  for (const capability of ['COMPUTE', 'BLUEPRINTS', 'AFFINITY']) {
    assert.match(config, new RegExp('^  ' + capability + ':

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
, 'm'))
  }
  assert.equal((config.match(/readOnly: true/g) ?? []).length, 3)

  for (const forbidden of [
    'VM_CREATE:',
    'AFFINITY_CREATE:',
    'KUBERNETES:',
    'APPLICATIONS_ONEFLOW:',
    'STORAGE_ONBOARDING:',
    'SITE_RECOVERY_DR:',
  ]) {
    assert.doesNotMatch(config, new RegExp(forbidden))
  }
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
