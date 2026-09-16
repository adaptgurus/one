/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8')

test('bootstrap self-heals stale local remote fallback state', () => {
  const source = read('src/client/bootstrap.js')
  assert.match(source, /serverConfigValid/)
  assert.match(source, /localStorage\.removeItem\(FORCE_LOCAL_FALLBACK\)/)
  assert.match(source, /localStorage\.removeItem\(USING_FALLBACK\)/)
})

test('bootstrap awaits client import and detects a silent empty root', () => {
  const source = read('src/client/bootstrap.js')
  assert.match(source, /await withTimeout\(\s*loadClient\(\)/s)
  assert.match(source, /FireEdge client did not mount into #root/)
  assert.match(source, /CLIENT_BOOT_TIMEOUT_MS/)
})

test('entry HTML and federation entrypoints cannot be served stale', () => {
  const app = read('src/server/routes/entrypoints/App.js')
  const server = read('src/server/index.js')
  assert.match(app, /bundle\.\$\{appName\}\.js\?v=\$\{Date\.now\(\)\}/)
  assert.match(app, /no-store, no-cache, must-revalidate/)
  assert.match(server, /bundle\\\.\(sunstone\|layersentry\)\\\.js\$/)
  assert.match(server, /remoteEntry\\\.js\$/)
  assert.match(server, /no-store, no-cache, must-revalidate/)
})
