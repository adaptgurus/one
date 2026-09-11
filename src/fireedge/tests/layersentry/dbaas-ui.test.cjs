/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
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

test('credentials are memory-only, masked by default and automatically cleared', () => {
  assert.match(ui, /setTimeout\(\(\) => \{[\s\S]*setCredentials\(null\)/)
  assert.match(ui, /60000/)
  assert.match(ui, /type=\{showPassword \? 'text' : 'password'\}/)
  assert.match(ui, /Reveal password/)
  assert.match(ui, /Copy password/)
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
  assert.match(proxy, /request:\s*clusterId/)
  assert.match(proxy, /loadConfig\(params\.clusterId\)/)
  assert.match(proxy, /cluster access denied/)
})

test('user authorized for OneKS A cannot proxy DBaaS traffic to OneKS B', async () => {
  const modulePath = resolve(
    root,
    'server/routes/api/layersentry-dbaas/functions.js'
  )
  const originalLoad = Module._load
  const authorizationRequests = []
  let upstreamCalls = 0

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'axios') {
      return async () => {
        upstreamCalls += 1

        return { status: 200, data: {} }
      }
    }
    if (request === 'https') {
      return { Agent: class Agent {} }
    }
    if (request === 'server/utils/constants') {
      return {
        defaults: { defaultEmptyFunction: () => {} },
        httpCodes: {
          badRequest: { id: 400 },
          unauthorized: { id: 401 },
          serviceUnavailable: { id: 503 },
        },
      }
    }
    if (request === 'server/utils/server') {
      return {
        httpResponse: (code, data, message) => ({
          status: code.id,
          data,
          message,
        }),
      }
    }
    if (request === 'server/routes/api/oneks/routes') {
      return {
        Commands: { SHOW: { httpMethod: 'POST', apiPath: '/oneks/show' } },
        Actions: { SHOW: 'SHOW' },
      }
    }
    if (request === 'server/routes/api/oneks/utils') {
      return {
        oneKsConnection: ({ request: requestedCluster }, onAllowed, onDenied) => {
          authorizationRequests.push(requestedCluster)

          return requestedCluster === 'cluster-a' ? onAllowed() : onDenied()
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  let handlers
  try {
    delete require.cache[require.resolve(modulePath)]
    handlers = require(modulePath)
  } finally {
    Module._load = originalLoad
  }

  const res = { locals: {}, set: () => {} }
  let nextCalls = 0
  await Promise.resolve(
    handlers.list(
      res,
      () => {
        nextCalls += 1
      },
      { clusterId: 'cluster-b' },
      { user: 'user-a', password: 'session-secret' }
    )
  )

  assert.deepEqual(authorizationRequests, ['cluster-b'])
  assert.equal(upstreamCalls, 0)
  assert.equal(res.locals.httpCode.status, 401)
  assert.equal(res.locals.httpCode.message, 'cluster access denied')
  assert.equal(nextCalls, 1)
  delete require.cache[require.resolve(modulePath)]
})

test('proxy permits only the public DBaaS action contract', () => {
  assert.match(
    proxy,
    /new Set\(\['backup', 'restore', 'pitr', 'credentials'\]\)/
  )
  assert.match(proxy, /unsupported database action/)
})

test('invalid server-side DBaaS configuration fails closed without path leakage', () => {
  assert.match(proxy, /LayerSentry DBaaS is unavailable for this Kubernetes cluster/)
  assert.doesNotMatch(proxy, /fail\(res, next, serviceUnavailable, error\.message\)/)
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
  assert.match(ui, /active\?\.message/)
  assert.match(ui, /authoritative provider state/)
})

test('customer status shows topology, monitoring and recovery evidence', () => {
  assert.match(ui, /Topology \/ replicas/)
  assert.match(ui, /status\.monitoring/)
  assert.match(ui, /monitoring\.healthy/)
  assert.match(ui, /lastBackupRef/)
  assert.match(ui, /lastRecoveryRef/)
})

test('qualified update supports scale, grow, upgrade and protection configuration', () => {
  assert.match(ui, /minimumReplicas/)
  assert.match(ui, /Number\(storage\) < database\.spec\.storageGiB/)
  assert.match(ui, /versions\.includes\(version\)/)
  assert.match(ui, /setProtectionGroupRef/)
  assert.match(ui, /protectionGroupRef:\s*protectionGroupRef\.trim\(\)/)
  assert.match(ui, /deletionProtection/)
})

test('database recovery uses native backup reference and PITR workflows', () => {
  assert.match(ui, /lastBackupRef/)
  assert.match(ui, /actions\/\$\{mode\}/)
  assert.match(ui, /Point-in-time recovery/)
  assert.match(ui, /database-native backup/)
})
