/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const nodeUrl = require('node:url')

const source = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/server/routes/websockets/guacamoleProxy.js'
  ),
  'utf8'
)

const makeHarness = ({ getZone } = {}) => {
  let proxyOptions
  let generatedPaths = 0

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    require: (request) => {
      switch (request) {
        case 'url':
          return { parse: nodeUrl.parse }
        case 'http-proxy-middleware':
          return {
            createProxyMiddleware: (options) => {
              proxyOptions = options
              const proxy = () => undefined
              proxy.upgrade = () => undefined
              return proxy
            },
          }
        case 'server/utils/yml':
          return { getFireedgeConfig: () => ({ port: 2616 }) }
        case 'server/utils/server':
          return {
            genPathResources: () => {
              generatedPaths += 1
            },
          }
        case 'server/routes/entrypoints/Api/middlewares':
          return {
            getZone:
              getZone ??
              ((zone) => ({
                id: zone,
                fireedge: 'https://zone-fireedge.example.test:2616',
              })),
          }
        case 'server/utils/constants/defaults':
          return {
            endpointExternalGuacamole: '/fireedge/external-guacamole',
            defaultPort: 2616,
            defaultProtocol: 'http',
          }
        default:
          throw new Error(`Unexpected require from Guacamole proxy test: ${request}`)
      }
    },
  }

  vm.runInNewContext(source, sandbox, {
    filename: 'src/server/routes/websockets/guacamoleProxy.js',
  })

  return {
    proxy: sandbox.module.exports,
    get options() {
      return proxyOptions
    },
    get generatedPaths() {
      return generatedPaths
    },
  }
}

test('Guacamole proxy uses the modern one-object API and preserves websocket upgrade', () => {
  const harness = makeHarness()

  assert.equal(harness.generatedPaths, 1)
  assert.equal(typeof harness.proxy, 'function')
  assert.equal(typeof harness.proxy.upgrade, 'function')
  assert.equal(harness.options.pathFilter, '/fireedge/external-guacamole')
  assert.equal(harness.options.target, 'http://localhost:2616')
  assert.equal(harness.options.changeOrigin, true)
  assert.equal(harness.options.ws, true)
  assert.equal(harness.options.secure, false)
  assert.equal(typeof harness.options.router, 'function')
  assert.equal(typeof harness.options.pathRewrite, 'function')
  assert.equal(typeof harness.options.on.proxyReq, 'function')
  assert.equal(typeof harness.options.on.proxyReqWs, 'function')
})

test('Guacamole proxy rewrites only the external console segment', () => {
  const harness = makeHarness()
  assert.equal(
    harness.options.pathRewrite(
      '/fireedge/external-guacamole/websocket-tunnel?token=abc'
    ),
    '/fireedge/guacamole/websocket-tunnel?token=abc'
  )
})

test('Guacamole proxy router only uses authoritative zone data', () => {
  const harness = makeHarness()

  assert.equal(
    harness.options.router({
      url: '/fireedge/external-guacamole?zone=2',
    }),
    'https://zone-fireedge.example.test:2616'
  )
  assert.equal(
    harness.options.router({
      url: '/fireedge/external-guacamole',
      headers: { host: 'attacker.example.test' },
    }),
    ''
  )
})

test('Guacamole proxy falls back to the zone RPC hostname without trusting its port', () => {
  const harness = makeHarness({
    getZone: () => ({ rpc: 'https://zone-rpc.example.test:2633/RPC2' }),
  })

  assert.equal(
    harness.options.router({
      url: '/fireedge/external-guacamole?zone=3',
    }),
    'http://zone-rpc.example.test:2616'
  )
})

test('Guacamole proxy forwards only websocket negotiation headers and trusted Origin', () => {
  const harness = makeHarness()
  const written = {}
  const proxyReq = {
    setHeader: (name, value) => {
      written[name] = value
    },
  }
  const req = {
    url: '/fireedge/external-guacamole?zone=2',
    headers: {
      'sec-websocket-key': 'abc123',
      'Sec-WebSocket-Protocol': 'guacamole',
      authorization: 'must-not-be-copied-by-this-hook',
    },
  }

  harness.options.on.proxyReqWs(proxyReq, req)

  assert.equal(written['sec-websocket-key'], 'abc123')
  assert.equal(written['Sec-WebSocket-Protocol'], 'guacamole')
  assert.equal(written.authorization, undefined)
  assert.equal(written.Origin, 'https://zone-fireedge.example.test:2616')
})