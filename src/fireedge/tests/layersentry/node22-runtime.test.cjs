/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const upcast = require('../../src/server/utils/upcast')
const pkg = JSON.parse(
  fs.readFileSync(path.join(fireedgeRoot, 'package.json'), 'utf8')
)
const xmlrpc = fs.readFileSync(
  path.join(
    fireedgeRoot,
    'src/server/routes/entrypoints/Api/xmlrpc.js'
  ),
  'utf8'
)

test('Node 22 runtime path avoids the legacy upcast esm loader', () => {
  assert.equal(pkg.engines?.node, '>=22')
  assert.equal(pkg.dependencies?.upcast, undefined)
  assert.match(xmlrpc, /require\('server\/utils\/upcast'\)/)
  assert.doesNotMatch(xmlrpc, /require\('upcast'\)/)
})

test('local XML-RPC caster preserves required upcast semantics', () => {
  assert.equal(upcast.type(null), 'null')
  assert.equal(upcast.type([]), 'array')
  assert.equal(upcast.type(42), 'number')

  assert.equal(upcast.to('42', 'number'), 42)
  assert.equal(upcast.to('not-a-number', 'number'), 0)
  assert.equal(upcast.to('false', 'boolean'), false)
  assert.equal(upcast.to('true', 'boolean'), true)
  assert.deepEqual(upcast.to('ab', 'array'), ['a', 'b'])
  assert.deepEqual(upcast.to('false', 'array'), [false])
  assert.equal(upcast.to(['4', '2'], 'number'), 42)
  assert.equal(upcast.to(['a', 'b'], 'string'), 'ab')
  assert.equal(upcast.to(null, 'string'), '')
  assert.equal(upcast.to(undefined, 'number'), 0)
  assert.equal(upcast.to('value', 'unknown'), 'value')
})

test('local XML-RPC caster rejects a non-string target type', () => {
  assert.throws(
    () => upcast.to('1', undefined),
    /type is expected to be a string/
  )
})
