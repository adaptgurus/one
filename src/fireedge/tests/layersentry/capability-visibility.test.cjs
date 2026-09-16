/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const read = (...parts) =>
  fs.readFileSync(path.join(fireedgeRoot, ...parts), 'utf8')

test('specialist capabilities fail closed on the full production gate chain', () => {
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
})

test('navigation gates optional and unqualified production capabilities', () => {
  const navigation = read('src/client/apps/layersentry/navigation.js')

  for (const capability of [
    'KUBERNETES',
    'APPLICATIONS_ONEFLOW',
    'BACKUP_RECOVERY',
    'SITE_RECOVERY_DR',
    'BACKUP_STORAGE',
    'PROVIDERS_ONEFORM',
  ]) {
    assert.match(navigation, new RegExp(`CAPABILITY_IDS\\.${capability}`))
  }

  assert.match(navigation, /isCapabilityVisible\(capability, capabilityModel\)/)
  assert.match(navigation, /getNavigation = \(view, capabilityModel = \{\}\)/)
})

test('direct URLs are contained by the same capability policy', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')
  const shell = read('src/client/apps/layersentry/components/PortalShell.js')

  for (const route of [
    '/protection/site-recovery',
    '/compute/create',
    '/vm-group/create',
    '/kubernetes',
    '/applications',
    '/infrastructure/backup-storage',
    '/infrastructure/storage/create',
    '/infrastructure/providers',
    '/support/create',
  ]) {
    assert.match(capabilities, new RegExp(route.replaceAll('/', '\\/')))
  }

  assert.match(shell, /getCapabilityForPath\(location\.pathname\)/)
  assert.match(shell, /isCapabilityVisible\(pathCapability, capabilityModel\)/)
  assert.match(shell, /Capability unavailable/)
  assert.match(shell, /data-layersentry-capability-unavailable/)
})

test('interactive and mutating actions cannot bypass qualification', () => {
  const capabilities = read('src/client/apps/layersentry/capabilities.js')
  const area = read('src/client/apps/layersentry/pages/AreaPage.js')
  const compute = read('src/client/apps/layersentry/pages/ComputeWorkspace.js')

  assert.match(capabilities, /SUPPORT_TICKETING/)
  assert.match(capabilities, /STORAGE_ONBOARDING/)
  assert.match(capabilities, /VM_CREATE/)
  assert.match(capabilities, /AFFINITY_CREATE/)
  assert.match(area, /getCapabilityForPath\(createTo\)/)
  assert.match(area, /isCapabilityVisible\(createCapability, getCapabilityModel\(\)\)/)
  assert.match(area, /canCreate \? \(/)
  assert.match(compute, /isCapabilityVisible\(\s*CAPABILITY_IDS\.VM_CREATE/)
  assert.match(compute, /canCreateVm \? \(/)
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
