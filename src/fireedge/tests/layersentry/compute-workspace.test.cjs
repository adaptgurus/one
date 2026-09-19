/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const source = readFileSync(
  resolve(__dirname, '../../src/client/apps/layersentry/pages/ComputeWorkspace.js'),
  'utf8'
)

test('Compute exposes first-class LayerSentry navigation and gates VM creation', () => {
  assert.match(source, /data-layersentry-compute-actions/)
  assert.match(source, /Create VM/)
  assert.match(source, /CAPABILITY_IDS\.VM_CREATE/)
  assert.match(source, /isCapabilityVisible\(/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_CREATE/)
  assert.match(source, /CAPABILITY_IDS\.BLUEPRINTS/)
  assert.match(source, /CAPABILITY_IDS\.AFFINITY/)
  assert.match(source, /CAPABILITY_IDS\.STORAGE_IMAGES/)
  assert.match(source, /CAPABILITY_IDS\.NETWORK/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_BLUEPRINTS/)
  assert.match(source, /PRODUCT_PATHS\.COMPUTE_AFFINITY/)
  assert.match(source, /PRODUCT_PATHS\.STORAGE_IMAGES/)
  assert.match(source, /PRODUCT_PATHS\.NETWORK/)
})

test('Compute keeps OpenNebula authoritative while unqualified VM mutations stay hidden', () => {
  assert.match(source, /ResourceBridge endpoints={endpoints} legacyPath="\/vm"/)
  assert.match(source, /Read-only authoritative inventory/)
  assert.match(
    source,
    /VM Day-2 controls remain hidden until each mutation path has API, readback, RBAC and recovery evidence/
  )
  assert.match(
    source,
    /Mutating actions appear only after their production path is qualified/
  )
  assert.doesNotMatch(source, /XML-RPC|xmlrpc|\/RPC2/)
})
