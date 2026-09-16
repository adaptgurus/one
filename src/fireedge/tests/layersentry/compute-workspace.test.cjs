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

test('Compute keeps OpenNebula authoritative for VM operations', () => {
  assert.match(source, /ResourceBridge endpoints={endpoints} legacyPath="\/vm"/)
  assert.match(source, /power, console, resize, disk, network, snapshot, backup and delete/)
  assert.doesNotMatch(source, /XML-RPC|xmlrpc|\/RPC2/)
})
