/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const source = readFileSync(
  resolve(__dirname, '../../src/client/apps/layersentry/pages/ComputeWorkspace.js'),
  'utf8'
)

test('Compute workspace always exposes first-class LayerSentry actions', () => {
  assert.match(source, /data-layersentry-compute-actions/)
  assert.match(source, /Create VM/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_CREATE/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_BLUEPRINTS/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_AFFINITY/)
  assert.match(source, /PRODUCT_PATHS\.STORAGE_IMAGES/)
  assert.match(source, /PRODUCT_PATHS\.NETWORK/)
})

test('Compute inventory cannot collapse to the native full-page VM container', () => {
  assert.match(source, /data-layersentry-vm-inventory/)
  assert.match(source, /VmAPI\.useGetVmsQuery\(\{ extended: true \}\)/)
  assert.match(source, /DetailsDrawer/)
  assert.match(source, /getResourceView\(VirtualMachine\.RID\)/)
  assert.match(source, /No virtual machines are visible/)
  assert.match(source, /OpenNebula could not load the virtual machine inventory/)
})
test('Compute keeps OpenNebula authoritative for VM lifecycle actions', () => {
  assert.match(source, /native authorized VM lifecycle/)
  assert.doesNotMatch(source, /ResourceBridge/)
  assert.doesNotMatch(source, /XML-RPC|xmlrpc|\/RPC2/)
  assert.doesNotMatch(source, /fetch\(/)
})
