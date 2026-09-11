/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const root = resolve(__dirname, '../../src')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const ui = read('client/apps/sunstone/components/LayerSentry/Dbaas.js')
const routes = read('server/routes/api/layersentry-dbaas/routes.js')
const proxy = read('server/routes/api/layersentry-dbaas/functions.js')
const registry = read('server/routes/api/index.js')
const sunstoneRoutes = read('client/apps/sunstone/routes.js')
const view = read('../etc/sunstone/views/cloud/dbaas-tab.yaml')

test('customer surface is branded LayerSentry and hides provider name', () => {
  assert.match(ui, /LayerSentry DBaaS/)
  assert.doesNotMatch(ui, /OpenEverest/i)
  assert.match(sunstoneRoutes, /LayerSentry DBaaS/)
})

test('DBaaS route is restricted to cloud view configuration', () => {
  assert.match(view, /resource_name:\s*"DBAAS"/)
  assert.match(ui, /view !== 'cloud'/)
})

test('customer cannot type arbitrary qualified version or storage class', () => {
  assert.match(ui, /catalog\.engines/)
  assert.match(ui, /catalog\.storageClasses/)
  assert.match(ui, /Certified engine version/)
  assert.match(ui, /Persistent storage class/)
})

test('credentials are memory-only and automatically cleared', () => {
  assert.match(ui, /setTimeout\(\(\) => \{[\s\S]*setCredentials\(null\)/)
  assert.match(ui, /60000/)
  assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB/i)
})

test('server routes require authenticated FireEdge session', () => {
  const authDeclarations = routes.match(/auth:\s*true/g) ?? []
  assert.ok(authDeclarations.length >= 7)
  assert.match(registry, /'layersentry-dbaas'/)
})

test('proxy reauthorizes selected OneKS cluster before DBaaS access', () => {
  assert.match(proxy, /oneKsConnection/)
  assert.match(proxy, /OneKsActions\.SHOW/)
  assert.match(proxy, /cluster access denied/)
})

test('provider API token and trust material remain server-side files', () => {
  assert.match(proxy, /tokenFile/)
  assert.match(proxy, /caFile/)
  assert.match(proxy, /rejectUnauthorized:\s*true/)
  assert.match(proxy, /minVersion:\s*'TLSv1\.2'/)
  assert.doesNotMatch(ui, /tokenFile|caFile|Authorization:\s*`Bearer/)
})

test('secret-bearing response is explicitly non-cacheable', () => {
  assert.match(proxy, /Cache-Control',\s*'no-store'/)
  assert.match(proxy, /Pragma',\s*'no-cache'/)
  assert.match(ui, /cache:\s*'no-store'/)
})

test('asynchronous and unknown provider state is presented truthfully', () => {
  assert.match(ui, /TRANSITIONAL_PHASES/)
  assert.match(ui, /'Unknown'/)
  assert.match(ui, /activeOperation/)
  assert.match(ui, /authoritative provider state/)
})

test('database recovery uses native backup reference and PITR workflows', () => {
  assert.match(ui, /lastBackupRef/)
  assert.match(ui, /actions\/\$\{mode\}/)
  assert.match(ui, /Point-in-time recovery/)
  assert.match(ui, /database-native backup/)
})
