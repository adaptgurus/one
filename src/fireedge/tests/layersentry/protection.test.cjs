/* SPDX-License-Identifier: Apache-2.0 */
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
let normalizeProtectionRequest
before(async () => {
  const source = readFileSync(resolve(__dirname, '../../src/modules/utils/layersentryProtection.js'), 'utf8')
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  normalizeProtectionRequest = module.normalizeProtectionRequest
})

test('disabled request is explicit and never looks active', () => {
  assert.deepEqual(normalizeProtectionRequest({ ENABLED: false }), {
    ENABLED: 'NO', POLICY_VERSION: '1', REQUEST_STATE: 'NOT_REQUESTED', SOURCE: 'SELF_SERVICE_CREATE',
  })
})

test('enabled DC-only request defaults to a bounded requested policy', () => {
  assert.deepEqual(normalizeProtectionRequest({ ENABLED: true }), {
    ENABLED: 'YES', POLICY_VERSION: '1', REQUEST_STATE: 'REQUESTED_NOT_ACTIVE', SOURCE: 'SELF_SERVICE_CREATE',
    DC_RETENTION_MODE: 'COUNT', COPY_INTERVAL_MINUTES: '60', DC_RETENTION_POINTS: '7', DR_ENABLED: 'NO',
  })
})

test('DC and DR keep-all do not invent point counts', () => {
  const value = normalizeProtectionRequest({ ENABLED: true, DC_RETENTION_MODE: 'ALL', DR_ENABLED: true, DR_RETENTION_MODE: 'ALL' })
  assert.equal(value.DC_RETENTION_MODE, 'ALL')
  assert.equal(value.DC_RETENTION_POINTS, undefined)
  assert.equal(value.DR_RETENTION_MODE, 'ALL')
  assert.equal(value.DR_RETENTION_POINTS, undefined)
})

test('DR count, site, VLAN and address plan are serialized without activation', () => {
  const value = normalizeProtectionRequest({
    ENABLED: true, DC_RETENTION_POINTS: 10, COPY_INTERVAL_MINUTES: 30,
    DR_ENABLED: true, DR_RETENTION_POINTS: 45, DR_SITE: 'dr-west',
    DR_NETWORK: 'recovery-vnet', DR_VLAN_ID: 220, DR_IP_MODE: 'CHANGE',
    DR_IPV4: '10.20.30.40', DR_IPV6: '2001:db8::40', DR_PREFIX_OR_MASK: '/64',
    DR_GATEWAY: '2001:db8::1', DR_DNS: '10.20.0.53,10.20.0.54', DR_TEST_NETWORK: 'dr-isolated',
  })
  assert.equal(value.REQUEST_STATE, 'REQUESTED_NOT_ACTIVE')
  assert.equal(value.DC_RETENTION_POINTS, '10')
  assert.equal(value.DR_RETENTION_POINTS, '45')
  assert.equal(value.DR_VLAN_ID, '220')
  assert.equal(value.DR_IP_MODE, 'CHANGE')
  assert.equal(value.DR_IPV4, '10.20.30.40')
  assert.equal(value.DR_IPV6, '2001:db8::40')
})

test('numeric inputs are bounded and invalid VLAN is omitted', () => {
  const value = normalizeProtectionRequest({ ENABLED: true, DC_RETENTION_POINTS: 0, COPY_INTERVAL_MINUTES: 1, DR_ENABLED: true, DR_RETENTION_POINTS: 5000, DR_VLAN_ID: 9999 })
  assert.equal(value.DC_RETENTION_POINTS, '7')
  assert.equal(value.COPY_INTERVAL_MINUTES, '60')
  assert.equal(value.DR_RETENTION_POINTS, '30')
  assert.equal(value.DR_VLAN_ID, undefined)
})

test('control characters and oversized values are cleaned', () => {
  const value = normalizeProtectionRequest({ ENABLED: true, DR_ENABLED: true, DR_SITE: 'dr\nsite\u0000', DR_DNS: 'x'.repeat(800) })
  assert.equal(value.DR_SITE.includes('\n'), false)
  assert.equal(value.DR_SITE.includes('\u0000'), false)
  assert.equal(value.DR_DNS.length, 512)
})

test('non-object input is ignored', () => {
  assert.equal(normalizeProtectionRequest(), undefined)
  assert.equal(normalizeProtectionRequest('YES'), undefined)
  assert.equal(normalizeProtectionRequest([]), undefined)
})
