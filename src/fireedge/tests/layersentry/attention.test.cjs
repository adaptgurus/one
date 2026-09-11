/* SPDX-License-Identifier: Apache-2.0 */
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
let buildAttentionItems
before(async () => {
  const source = readFileSync(resolve(__dirname, '../../src/client/apps/sunstone/components/LayerSentry/attention.js'), 'utf8')
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  buildAttentionItems = module.buildAttentionItems
})

test('failed VM produces an error linked to the native VM detail', () => {
  const [item] = buildAttentionItems({ vms: [{ resource: { ID: 7, NAME: 'api-01' }, stateName: 'LCM_INIT_FAILURE' }] })
  assert.equal(item.severity, 'error')
  assert.equal(item.path, '/vm/7')
})

test('healthy VM produces no false alert', () => {
  assert.deepEqual(buildAttentionItems({ vms: [{ resource: { ID: 7 }, stateName: 'RUNNING' }] }), [])
})

test('requested but not active protection is visible and is not called active', () => {
  const [item] = buildAttentionItems({ vms: [{ resource: { ID: 8, NAME: 'db-01', TEMPLATE: { LAYERSENTRY_PROTECTION: { ENABLED: 'YES', REQUEST_STATE: 'REQUESTED_NOT_ACTIVE' } } }, stateName: 'RUNNING' }] })
  assert.equal(item.severity, 'warning')
  assert.match(item.title, /requested, not active/i)
  assert.doesNotMatch(item.detail, /protection is active/i)
})

test('failed and outdated backup members remain separate conditions', () => {
  const items = buildAttentionItems({ backupJobs: [{ ID: 3, NAME: 'nightly', ERROR_VMS: { ID: ['4'] }, OUTDATED_VMS: { ID: ['5', '6'] } }] })
  assert.equal(items.length, 2)
  assert.equal(items[0].severity, 'error')
  assert.equal(items[1].severity, 'warning')
  assert.equal(items[0].path, '/backupjobs/3')
})

test('OneKS failure and warning map to customer attention without changing state', () => {
  const items = buildAttentionItems({ clusters: [
    { resource: { ID: 9, NAME: 'prod-rke2' }, stateName: 'PROVISIONING_FAILURE' },
    { resource: { ID: 10, NAME: 'qa-rke2' }, stateName: 'WARNING' },
  ] })
  assert.equal(items[0].severity, 'error')
  assert.equal(items[0].path, '/kubernetes/9')
  assert.equal(items[1].severity, 'warning')
})

test('severity ordering puts errors before warnings', () => {
  const items = buildAttentionItems({
    vms: [{ resource: { ID: 1, TEMPLATE: { LAYERSENTRY_PROTECTION: { ENABLED: 'YES', REQUEST_STATE: 'REQUESTED_NOT_ACTIVE' } } }, stateName: 'RUNNING' }],
    backupJobs: [{ ID: 2, ERROR_VMS: { ID: ['1'] } }],
  })
  assert.deepEqual(items.map(({ severity }) => severity), ['error', 'warning'])
})
