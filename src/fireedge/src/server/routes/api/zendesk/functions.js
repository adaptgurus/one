/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                           *
 * Unless required by applicable law or agreed to in writing, software       *
 * distributed under the License is distributed on an "AS IS" BASIS,         *
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 * See the License for the specific language governing permissions and       *
 * limitations under the License.                                            *
 * ------------------------------------------------------------------------- */

const { env } = require('process')
const zendesk = require('node-zendesk')
const { getSunstoneConfig } = require('server/utils/yml')
const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const { getSession } = require('server/routes/api/zendesk/utils')

const { defaultEmptyFunction, defaultSeverities, defaultWebpackMode } = defaults
const { ok, internalServerError, badRequest, unauthorized } = httpCodes

const httpBadRequest = httpResponse(badRequest, '', '')
const MAX_ZENDESK_ERROR_LENGTH = 2048

/**
 * Format create ticket.
 *
 * @param {object} configFormatCreate - config format
 * @param {string} configFormatCreate.subject - subject
 * @param {string} configFormatCreate.body - body
 * @param {string} configFormatCreate.version - one version
 * @param {string} configFormatCreate.severity - ticket severity
 * @param {string[]} configFormatCreate.attachments - attachment tokens
 * @returns {object|undefined} format message create ticket
 */
const formatCreate = ({
  subject = '',
  body = '',
  version = '',
  severity = '',
  attachments = [],
}) => {
  if (!(subject && body && version && severity)) return

  const rtn = {
    request: {
      subject,
      comment: {
        body,
      },
      custom_fields: [
        { id: 391130, value: version }, // version
        { id: 391197, value: severity }, // severity
      ],
      can_be_solved_by_me: false,
      tags: [severity],
    },
  }

  attachments?.length > 0 &&
    (rtn.request.comment.uploads = attachments.filter((att) => att))

  return rtn
}

/**
 * Format comment.
 *
 * @param {object} configFormatComment - config format
 * @param {string} configFormatComment.body - body
 * @param {string} configFormatComment.solved - solved
 * @param {string[]} configFormatComment.attachments - attachments
 * @returns {object|undefined} format comment
 */
const formatComment = ({ body = '', solved = '', attachments = [] }) => {
  if (!body) return

  const rtn = {
    request: {
      comment: {
        html_body: body,
        public: true,
      },
    },
  }

  if (solved) {
    rtn.request.solved = 'true'
  }

  attachments?.length > 0 &&
    (rtn.request.comment.uploads = attachments.filter((att) => att))

  return rtn
}

/**
 * Return only the resource body from node-zendesk methods that return the
 * v4+ `{ response, result }` envelope. `getAll` and upload calls already
 * return the resource body directly, so they pass through unchanged.
 *
 * @param {*} value - node-zendesk result
 * @returns {*} resource body
 */
const unwrapZendeskResult = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.prototype.hasOwnProperty.call(value, 'result')
    ? value.result
    : value

/**
 * Normalize a Zendesk error without exposing stack traces or unbounded data.
 * Supports legacy Buffer-shaped errors and the promise-client Error shape.
 *
 * @param {Error|object} err - Zendesk error
 * @returns {string} safe error message
 */
const parseZendeskError = (err) => {
  if (!err) return 'Zendesk request failed'

  let payload = err.result
  if (Buffer.isBuffer(payload)) payload = payload.toString('utf8')

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = undefined
    }
  }

  if (payload && typeof payload === 'object') {
    const zendeskError = payload.error ?? payload
    const title = zendeskError?.title ? `${zendeskError.title}: ` : ''
    const message = zendeskError?.message ?? zendeskError?.description
    if (message) {
      return `${title}${message}`.slice(0, MAX_ZENDESK_ERROR_LENGTH)
    }
  }

  return String(err.message || 'Zendesk request failed').slice(
    0,
    MAX_ZENDESK_ERROR_LENGTH
  )
}

/**
 * Build node-zendesk v4+ client options. `remoteUri` was the legacy option;
 * `endpointUri` is authoritative in the promise client. Keeping the fallback
 * allows sessions created before an in-place FireEdge upgrade to be reused.
 *
 * @param {object} config - stored Zendesk configuration
 * @returns {object} normalized node-zendesk configuration
 */
const normalizeZendeskConfig = (config = {}) => {
  const { remoteUri, ...rest } = config
  const endpointUri = config.endpointUri || remoteUri

  return {
    ...rest,
    ...(endpointUri ? { endpointUri } : {}),
  }
}

const createZendeskClient = (config) =>
  zendesk.createClient(normalizeZendeskConfig(config))

/**
 * Upload valid attachment files and return Zendesk upload tokens in order.
 * Any failed upload fails the whole request instead of leaving the HTTP route
 * hanging indefinitely.
 *
 * @param {object} zendeskClient - node-zendesk client
 * @param {object[]} attachments - multer attachment descriptors
 * @returns {Promise<string[]>} uploaded Zendesk tokens
 */
const uploadAttachments = async (zendeskClient, attachments = []) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return []
  if (typeof zendeskClient?.attachments?.upload !== 'function') return []

  const validAttachments = attachments.filter(
    (att) => att && att.originalname && att.path
  )
  const tokens = []

  for (const attachment of validAttachments) {
    const result = await zendeskClient.attachments.upload(attachment.path, {
      filename: attachment.originalname,
    })
    const payload = unwrapZendeskResult(result)
    const token = payload?.upload?.token

    if (!token) throw new Error('Zendesk attachment upload returned no token')
    tokens.push(token)
  }

  return tokens
}

const getZendeskSession = (user, password) => {
  const session = getSession(user, password)

  return session && typeof session === 'object' ? session : undefined
}

const setResponse = (response, method, data = '') => {
  response.locals.httpCode = httpResponse(method, data)
}

/**
 * Login on Zendesk.
 *
 * node-zendesk v4 removed callbacks; this route intentionally uses the
 * promise API and stores only the configuration required to recreate a client.
 *
 * @param {object} response - http response
 * @param {Function} next - express stepper
 * @param {object} params - params of http request
 * @param {string} params.user - zendesk user
 * @param {string} params.pass - zendesk pass
 * @param {object} userData - user of http request
 * @param {string} userData.user - username
 * @param {string} userData.password - user password
 */
const login = async (
  response = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {}
) => {
  const sunstoneConfig = getSunstoneConfig()
  const endpointUri = sunstoneConfig.support_url || ''
  const { user, password } = userData
  const { user: zendeskUser, pass } = params

  if (!(endpointUri && zendeskUser && pass && user && password)) {
    response.locals.httpCode = httpBadRequest
    next()

    return
  }

  const session = getZendeskSession(user, password)
  if (!session) {
    setResponse(response, unauthorized)
    next()

    return
  }

  const zendeskData = {
    username: zendeskUser,
    password: pass,
    endpointUri,
    debug: env.NODE_ENV === defaultWebpackMode,
  }

  try {
    const zendeskClient = createZendeskClient(zendeskData)
    const result = unwrapZendeskResult(await zendeskClient.users.auth())

    if (!result?.id) {
      throw new Error('Zendesk authentication returned no user id')
    }

    session.zendesk = {
      ...zendeskData,
      id: result.id,
    }
    setResponse(response, ok, result)
  } catch (error) {
    if (session.zendesk) delete session.zendesk
    setResponse(response, internalServerError, parseZendeskError(error))
  }

  next()
}

/**
 * List Zendesk requests visible to the authenticated end user.
 *
 * @param {object} response - http response
 * @param {Function} next - express stepper
 * @param {object} params - params of http request
 * @param {object} userData - user of http request
 * @param {string} userData.user - username
 * @param {string} userData.password - user password
 */
const list = async (
  response = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {}
) => {
  const { user, password } = userData
  if (!(user && password)) {
    response.locals.httpCode = httpBadRequest
    next()

    return
  }

  const session = getZendeskSession(user, password)
  if (!(session?.zendesk && session.zendesk.id)) {
    setResponse(response, unauthorized)
    next()

    return
  }

  try {
    const zendeskClient = createZendeskClient(session.zendesk)
    const tickets = await zendeskClient.requests.list({
      sort_by: 'id',
      sort_order: 'desc',
    })
    const ticketCount = {
      new: 0,
      open: 0,
      pending: 0,
      hold: 0,
      solved: 0,
      closed: 0,
    }

    ;(Array.isArray(tickets) ? tickets : []).forEach((ticket) => {
      if (
        ticket?.status &&
        Object.prototype.hasOwnProperty.call(ticketCount, ticket.status)
      ) {
        ticketCount[ticket.status] += 1
      }
    })

    setResponse(response, ok, {
      tickets: Array.isArray(tickets) ? tickets : [],
      ...ticketCount,
    })
  } catch (error) {
    setResponse(response, internalServerError, parseZendeskError(error))
  }

  next()
}

/**
 * Get Comments on ticket.
 *
 * @param {object} response - http response
 * @param {Function} next - express stepper
 * @param {object} params - params of http request
 * @param {number} params.id - comment id
 * @param {object} userData - user of http request
 * @param {string} userData.user - username
 * @param {string} userData.password - user password
 */
const comments = async (
  response = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {}
) => {
  const ticketId = Number(params.id)
  const { user, password } = userData

  if (!(Number.isInteger(ticketId) && ticketId > 0 && user && password)) {
    response.locals.httpCode = httpBadRequest
    next()

    return
  }

  const session = getZendeskSession(user, password)
  if (!session?.zendesk) {
    setResponse(response, unauthorized)
    next()

    return
  }

  try {
    const zendeskClient = createZendeskClient(session.zendesk)
    const result = await zendeskClient.requests.listComments(ticketId)
    setResponse(response, ok, result)
  } catch (error) {
    setResponse(response, internalServerError, parseZendeskError(error))
  }

  next()
}

/**
 * Create ticket.
 *
 * @param {object} response - http response
 * @param {Function} next - express stepper
 * @param {object} params - params of http request
 * @param {string} params.subject - subject
 * @param {string} params.body - body
 * @param {string} params.version - version
 * @param {string} params.severity - severity
 * @param {object[]} params.attachments - uploaded files
 * @param {object} userData - user of http request
 * @param {string} userData.user - username
 * @param {string} userData.password - user password
 */
const create = async (
  response = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {}
) => {
  const { subject, body, version, severity, attachments } = params
  const { user, password } = userData
  if (
    !(
      subject &&
      body &&
      version &&
      severity &&
      defaultSeverities.includes(severity) &&
      user &&
      password
    )
  ) {
    response.locals.httpCode = httpBadRequest
    next()

    return
  }

  const session = getZendeskSession(user, password)
  if (!(session?.zendesk && session.zendesk.id)) {
    setResponse(response, unauthorized)
    next()

    return
  }

  try {
    const zendeskClient = createZendeskClient(session.zendesk)
    const uploadedAttachments = await uploadAttachments(
      zendeskClient,
      attachments
    )
    const ticket = formatCreate({
      ...params,
      attachments: uploadedAttachments,
    })
    const result = unwrapZendeskResult(
      await zendeskClient.requests.create(ticket)
    )
    setResponse(response, ok, result)
  } catch (error) {
    setResponse(response, internalServerError, parseZendeskError(error))
  }

  next()
}

/**
 * Update Ticket.
 *
 * @param {object} response - http response
 * @param {Function} next - express stepper
 * @param {object} params - params of http request
 * @param {string} params.id - ticket id
 * @param {string} params.body - ticket body
 * @param {object[]} params.attachments - files
 * @param {string} params.attachments.originalname - original name
 * @param {string} params.attachments.path - path file
 * @param {object} userData - user of http request
 * @param {string} userData.user - username
 * @param {string} userData.password - user password
 */
const update = async (
  response = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {}
) => {
  const ticketId = Number(params.id)
  const { body, attachments } = params
  const { user, password } = userData

  if (
    !(Number.isInteger(ticketId) && ticketId > 0 && body && user && password)
  ) {
    response.locals.httpCode = httpBadRequest
    next()

    return
  }

  const session = getZendeskSession(user, password)
  if (!(session?.zendesk && session.zendesk.id)) {
    setResponse(response, unauthorized)
    next()

    return
  }

  try {
    const zendeskClient = createZendeskClient(session.zendesk)
    const uploadedAttachments = await uploadAttachments(
      zendeskClient,
      attachments
    )
    const ticket = formatComment({
      ...params,
      attachments: uploadedAttachments,
    })
    const result = unwrapZendeskResult(
      await zendeskClient.requests.update(ticketId, ticket)
    )
    setResponse(response, ok, result)
  } catch (error) {
    setResponse(response, internalServerError, parseZendeskError(error))
  }

  next()
}

const functionRoutes = {
  login,
  list,
  comments,
  create,
  update,
}
module.exports = functionRoutes
