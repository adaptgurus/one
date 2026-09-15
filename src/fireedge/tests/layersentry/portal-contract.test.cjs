/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const fireedgeRoot = path.join(__dirname, '../..')
const appRoot = path.join(fireedgeRoot, 'src/client/apps/layersentry')
const read = (...parts) =>
  fs.readFileSync(path.join(fireedgeRoot, ...parts), 'utf8')

const walkJs = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkJs(target)

    return entry.isFile() && entry.name.endsWith('.js') ? [target] : []
  })

test('LayerSentry is the default authenticated shell', () => {
  const app = read('src/client/apps/sunstone/_app.js')
  assert.match(app, /<LayerSentryPortal endpoints={endpoints} \/>/)
  assert.match(app, /allowNativeSunstone = view === 'admin'/)
  assert.match(app, /nativeSunstoneRequested\(search\)/)
  assert.match(app, /redirectWhenAuth = externalRedirect \|\| '\/overview'/)
})

test('product routes preserve backend authority through an RBAC bridge', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  const bridge = read('src/client/apps/layersentry/components/ResourceBridge.js')
  for (const productArea of [
    'COMPUTE',
    'KUBERNETES',
    'STORAGE',
    'NETWORK',
    'PROTECTION',
    'SECURITY',
    'OPERATIONS',
    'SUPPORT',
    'SETTINGS',
  ]) {
    assert.match(portal, new RegExp(`PRODUCT_PATHS\\.${productArea}`))
  }
  assert.match(bridge, /flattenEndpoints\(endpoints\)/)
  assert.match(bridge, /endpoint\?\.Component/)
  assert.doesNotMatch(bridge, /XML-RPC|xmlrpc|\/RPC2/)
})

test('native provider base routes return to LayerSentry product routes', () => {
  const portal = read('src/client/apps/layersentry/Portal.js')
  assert.match(portal, /'\/vm': PRODUCT_PATHS\.COMPUTE/)
  assert.match(portal, /'\/virtual-network': PRODUCT_PATHS\.NETWORK/)
  assert.match(portal, /'\/security-group': PRODUCT_PATHS\.SECURITY/)
  assert.match(portal, /'\/backupjobs': PRODUCT_PATHS\.PROTECTION/)
  assert.match(portal, /compatibilityEndpoints/)
})

test('LayerSentry brand colors live only in the theme token source', () => {
  const tokenPath = path.join(appRoot, 'theme/tokens.js')
  const offenders = walkJs(appRoot)
    .filter((file) => file !== tokenPath)
    .flatMap((file) => {
      const matches = fs.readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{6}\b/g)
      return matches ? [{ file: path.relative(appRoot, file), matches }] : []
    })

  assert.deepEqual(offenders, [])
  const tokens = fs.readFileSync(tokenPath, 'utf8')
  assert.match(tokens, /primary: '#2563EB'/)
  assert.match(tokens, /navy: '#0B1F3A'/)
  assert.match(tokens, /background: '#F8FAFC'/)
})

test('customer overview avoids provider storage inventory fetches', () => {
  const overview = read('src/client/apps/layersentry/pages/Overview.js')
  assert.match(
    overview,
    /DatastoreAPI\.useGetDatastoresQuery\(undefined, \{\s*skip: !isAdmin/
  )
  const search = read('src/client/apps/layersentry/pages/Search.js')
  assert.doesNotMatch(search, /HostAPI|ClusterAPI|DatastoreAPI/)
})
