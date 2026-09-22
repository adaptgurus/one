/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/modules/utils/parser/vmTemplateFilter.js'
  ),
  'utf8'
)

const match = source.match(
  /const filterSingleSection = \([\s\S]*?\n\}\n\n\/\*\*\n \* Execute any needed action/
)

if (!match) {
  throw new Error('filterSingleSection source block not found')
}

const functionSource = match[0]
  .replace(
    /^const filterSingleSection =/,
    'globalThis.filterSingleSection ='
  )
  .replace(
    /\n\n\/\*\*\n \* Execute any needed action[\s\S]*$/,
    ''
  )

const context = {
  _: {
    isEmpty: (value) =>
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0),
  },
}
vm.runInNewContext(functionSource, context)

test('instantiate filter tolerates an omitted OsCpu modification map', () => {
  const result = {}
  assert.doesNotThrow(() =>
    context.filterSingleSection(
      { extra: {} },
      { extra: {} },
      'OsCpu',
      result,
      'OS'
    )
  )
  assert.deepEqual(result, {})
})

test('instantiate filter tolerates an entirely omitted extra object', () => {
  const result = {}
  assert.doesNotThrow(() =>
    context.filterSingleSection(
      {},
      {},
      'OsCpu',
      result,
      'OS'
    )
  )
  assert.deepEqual(result, {})
})

test('instantiate filter still applies a touched OS child safely', () => {
  const result = { OS: { ARCH: 'x86_64', BOOT: 'disk0' } }
  context.filterSingleSection(
    { extra: { OS: { ARCH: 'x86_64', BOOT: 'disk1' } } },
    { extra: { OsCpu: { OS: { BOOT: true } } } },
    'OsCpu',
    result,
    'OS'
  )
  assert.equal(result.OS.BOOT, 'disk1')
  assert.equal(result.OS.ARCH, 'x86_64')
})
