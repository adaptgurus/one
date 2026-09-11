/* SPDX-License-Identifier: Apache-2.0 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/server/routes/api/zendesk/functions.js'
  ),
  'utf8'
)

const makeHarness = ({ client, supportUrl, session } = {}) => {
  const createdConfigs = []
  const activeSession = session ?? { tokens: true }
  const httpResponse = (code, data = '', error = '') => ({ code, data, error })
  const zendeskClient =
    client ??
    {
      users: { auth: async () => ({ result: { id: 7, name: 'Customer' } }) },
      requests: {
        list: async () => [],
        listComments: async () => [],
        create: async (ticket) => ({ result: ticket }),
        update: async (_id, ticket) => ({ result: ticket }),
      },
      attachments: {
        upload: async (_file, options) => ({
          upload: { token: `token-${options.filename}` },
        }),
      },
    }

  const sandbox = {
    module: { exports: {} },
    exports: {},
    Buffer,
    console,
    process: { env: { NODE_ENV: 'test' } },
    require: (request) => {
      switch (request) {
        case 'process':
          return { env: { NODE_ENV: 'test' } }
        case 'node-zendesk':
          return {
            createClient: (config) => {
              createdConfigs.push(config)
              return zendeskClient
            },
          }
        case 'server/utils/yml':
          return {
            getSunstoneConfig: () => ({
              support_url:
                supportUrl ?? 'https://customer.zendesk.com/api/v2',
            }),
          }
        case 'server/utils/constants':
          return {
            defaults: {
              defaultEmptyFunction: () => undefined,
              defaultSeverities: ['low', 'normal', 'high', 'urgent'],
              defaultWebpackMode: 'development',
            },
            httpCodes: {
              ok: 200,
              internalServerError: 500,
              badRequest: 400,
              unauthorized: 401,
            },
          }
        case 'server/utils/server':
          return { httpResponse }
        case 'server/routes/api/zendesk/utils':
          return { getSession: () => activeSession }
        default:
          throw new Error(`Unexpected require from Zendesk test: ${request}`)
      }
    },
  }

  vm.runInNewContext(source, sandbox, {
    filename: 'src/server/routes/api/zendesk/functions.js',
  })

  return {
    routes: sandbox.module.exports,
    session: activeSession,
    createdConfigs,
    httpResponse,
  }
}

const response = () => ({ locals: {} })
const userData = { user: 'one-user', password: 'one-session-token' }

const callRoute = async (route, params, data = userData) => {
  const res = response()
  let nextCalls = 0
  await route(res, () => {
    nextCalls += 1
  }, params, data)

  return { res, nextCalls }
}

test('Zendesk login uses the promise API and persists the authenticated user id', async () => {
  const harness = makeHarness()
  const { res, nextCalls } = await callRoute(harness.routes.login, {
    user: 'end-user@example.test',
    pass: 'secret',
  })

  assert.equal(nextCalls, 1)
  assert.equal(res.locals.httpCode.code, 200)
  assert.equal(res.locals.httpCode.data.id, 7)
  assert.equal(harness.session.zendesk.id, 7)
  assert.equal(
    harness.createdConfigs[0].endpointUri,
    'https://customer.zendesk.com/api/v2'
  )
  assert.equal(harness.createdConfigs[0].username, 'end-user@example.test')
  assert.equal(harness.createdConfigs[0].password, 'secret')
})

test('Zendesk login failure clears stale support state and finishes once', async () => {
  const session = { zendesk: { id: 99 } }
  const harness = makeHarness({
    session,
    client: {
      users: { auth: async () => Promise.reject(new Error('bad credentials')) },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.login, {
    user: 'end-user@example.test',
    pass: 'wrong',
  })

  assert.equal(nextCalls, 1)
  assert.equal(res.locals.httpCode.code, 500)
  assert.match(res.locals.httpCode.data, /bad credentials/)
  assert.equal(session.zendesk, undefined)
})

test('Zendesk list uses requests.list with sorting and counts known states only', async () => {
  let listOptions
  const harness = makeHarness({
    session: { zendesk: { id: 7, endpointUri: 'https://example/api/v2' } },
    client: {
      requests: {
        list: async (options) => {
          listOptions = options
          return [
            { id: 1, status: 'open' },
            { id: 2, status: 'open' },
            { id: 3, status: 'solved' },
            { id: 4, status: 'future-state' },
          ]
        },
      },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.list, {})

  assert.equal(nextCalls, 1)
  // listOptions is created inside a vm.Context. Compare scalar contract fields
  // instead of object prototypes from different JavaScript realms.
  assert.equal(listOptions.sort_by, 'id')
  assert.equal(listOptions.sort_order, 'desc')
  assert.equal(res.locals.httpCode.code, 200)
  assert.equal(res.locals.httpCode.data.open, 2)
  assert.equal(res.locals.httpCode.data.solved, 1)
  assert.equal(res.locals.httpCode.data['future-state'], undefined)
  assert.equal(res.locals.httpCode.data.tickets.length, 4)
})

test('Zendesk comments converts a numeric route id and returns promise data', async () => {
  let requestedId
  const harness = makeHarness({
    session: { zendesk: { id: 7, endpointUri: 'https://example/api/v2' } },
    client: {
      requests: {
        listComments: async (id) => {
          requestedId = id
          return [{ id: 11, body: 'hello' }]
        },
      },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.comments, { id: '42' })

  assert.equal(nextCalls, 1)
  assert.equal(requestedId, 42)
  assert.equal(res.locals.httpCode.code, 200)
  assert.equal(res.locals.httpCode.data[0].id, 11)
})

test('Zendesk create uploads valid files in order and sends their tokens', async () => {
  const uploads = []
  let createdTicket
  const harness = makeHarness({
    session: { zendesk: { id: 7, endpointUri: 'https://example/api/v2' } },
    client: {
      attachments: {
        upload: async (file, options) => {
          uploads.push([file, options.filename])
          return { upload: { token: `token-${options.filename}` } }
        },
      },
      requests: {
        create: async (ticket) => {
          createdTicket = ticket
          return { response: { status: 201 }, result: { id: 50 } }
        },
      },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.create, {
    subject: 'Need help',
    body: 'VM is unavailable',
    version: '7.4.1',
    severity: 'high',
    attachments: [
      { path: '/tmp/a.log', originalname: 'a.log' },
      { path: '/tmp/b.log', originalname: 'b.log' },
      { path: '', originalname: 'ignored.log' },
    ],
  })

  assert.equal(nextCalls, 1)
  assert.deepEqual(uploads, [
    ['/tmp/a.log', 'a.log'],
    ['/tmp/b.log', 'b.log'],
  ])
  // Ticket objects originate in the vm.Context. Copy to this realm before a
  // structural assertion so the test checks data, not cross-realm prototypes.
  assert.deepEqual(
    Array.from(createdTicket.request.comment.uploads),
    ['token-a.log', 'token-b.log']
  )
  assert.equal(res.locals.httpCode.code, 200)
  assert.equal(res.locals.httpCode.data.id, 50)
})

test('Zendesk attachment failure returns 500 instead of hanging the route', async () => {
  const harness = makeHarness({
    session: { zendesk: { id: 7, endpointUri: 'https://example/api/v2' } },
    client: {
      attachments: {
        upload: async () => {
          throw new Error('upload rejected')
        },
      },
      requests: {
        create: async () => {
          throw new Error('create must not run after upload failure')
        },
      },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.create, {
    subject: 'Need help',
    body: 'VM is unavailable',
    version: '7.4.1',
    severity: 'high',
    attachments: [{ path: '/tmp/a.log', originalname: 'a.log' }],
  })

  assert.equal(nextCalls, 1)
  assert.equal(res.locals.httpCode.code, 500)
  assert.match(res.locals.httpCode.data, /upload rejected/)
})

test('Zendesk update unwraps v6 response envelopes', async () => {
  let updateId
  let updateTicket
  const harness = makeHarness({
    session: { zendesk: { id: 7, endpointUri: 'https://example/api/v2' } },
    client: {
      requests: {
        update: async (id, ticket) => {
          updateId = id
          updateTicket = ticket
          return { response: { status: 200 }, result: { id } }
        },
      },
      attachments: { upload: async () => ({ upload: { token: 'unused' } }) },
    },
  })
  const { res, nextCalls } = await callRoute(harness.routes.update, {
    id: '51',
    body: 'Resolved',
    solved: 'true',
  })

  assert.equal(nextCalls, 1)
  assert.equal(updateId, 51)
  assert.equal(updateTicket.request.comment.html_body, 'Resolved')
  assert.equal(updateTicket.request.solved, 'true')
  assert.equal(res.locals.httpCode.data.id, 51)
})

test('Zendesk routes deny an OpenNebula session without Zendesk authentication', async () => {
  const harness = makeHarness({ session: { tokens: true } })
  const { res, nextCalls } = await callRoute(harness.routes.list, {})

  assert.equal(nextCalls, 1)
  assert.equal(res.locals.httpCode.code, 401)
  assert.equal(harness.createdConfigs.length, 0)
})
