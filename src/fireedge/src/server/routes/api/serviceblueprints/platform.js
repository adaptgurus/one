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

const { readFileSync } = require('fs')
const https = require('https')
const { request: axios } = require('axios')

const { getFireedgeConfig } = require('server/utils/yml')
const { Actions: userActions } = require('server/utils/constants/commands/user')

const { USER_INFO } = userActions

const DEFAULT_PLATFORM_URL = 'http://127.0.0.1:9444'
const DEFAULT_PLATFORM_TIMEOUT_MS = 10_000
const GATEWAY_TOKEN_HEADER = 'X-LayerSentry-Gateway-Token'
const GATEWAY_USER_HEADER = 'X-LayerSentry-User'
const GATEWAY_UID_HEADER = 'X-LayerSentry-UID'
const GATEWAY_ADMIN_HEADER = 'X-LayerSentry-Oneadmin'

const validIdentity = (value) => {
  const text = String(value ?? '').trim()

  return Boolean(text) && text.length <= 128 && !/[\r\n\0]/.test(text)
}

/**
 * Validate the private LayerSentry control-plane URL.
 *
 * Plain HTTP is permitted only for a loopback address. Any non-loopback
 * deployment must use HTTPS so the gateway token and authenticated identity
 * cannot traverse the network in clear text.
 *
 * @param {string} value - configured platform URL
 * @returns {URL} validated URL
 */
const validatePlatformUrl = (value) => {
  let url
  try {
    url = new URL(String(value || DEFAULT_PLATFORM_URL))
  } catch {
    throw new Error('LayerSentry platform URL is invalid.')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('LayerSentry platform URL must use http:// or https://.')
  }

  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error(
      'LayerSentry platform URL must use HTTPS unless it is loopback-only.'
    )
  }

  if (url.username || url.password) {
    throw new Error('LayerSentry platform URL must not embed credentials.')
  }

  return url
}

/**
 * Read and validate the server-only platform connection settings.
 *
 * @returns {object} validated platform connection settings
 */
const getPlatformConfig = () => {
  const appConfig = getFireedgeConfig()
  const baseURL = validatePlatformUrl(
    appConfig.layersentry_platform_url || DEFAULT_PLATFORM_URL
  )
    .toString()
    .replace(/\/$/, '')
  const gatewayToken = String(
    appConfig.layersentry_platform_gateway_token || ''
  ).trim()

  if (gatewayToken.length < 32) {
    throw new Error(
      'LayerSentry platform gateway token is not configured or is too short.'
    )
  }

  const configuredTimeout = Number(appConfig.layersentry_platform_timeout_ms)
  const timeout =
    Number.isInteger(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_PLATFORM_TIMEOUT_MS

  let httpsAgent
  const caFile = String(appConfig.layersentry_platform_ca_file || '').trim()
  if (caFile) {
    httpsAgent = new https.Agent({
      ca: readFileSync(caFile),
      rejectUnauthorized: true,
    })
  }

  return {
    baseURL,
    gatewayToken,
    timeout,
    httpsAgent,
  }
}

/**
 * Resolve the authenticated OpenNebula actor from the session credentials.
 *
 * OpenNebula UID is used as the durable LayerSentry tenant key. The username is
 * informative only and may be renamed without changing tenancy.
 *
 * @param {object} userData - authenticated FireEdge user data
 * @param {Function} oneConnection - OpenNebula XML-RPC connection factory
 * @returns {Promise<object>} authenticated actor
 */
const resolvePlatformActor = (userData = {}, oneConnection) =>
  new Promise((resolve, reject) => {
    const { user, password } = userData
    if (
      !validIdentity(user) ||
      !password ||
      typeof oneConnection !== 'function'
    ) {
      reject(new Error('Authenticated OpenNebula session is required.'))

      return
    }

    let connect
    try {
      connect = oneConnection(user, password)
    } catch {
      reject(new Error('OpenNebula identity lookup could not be started.'))

      return
    }

    if (typeof connect !== 'function') {
      reject(new Error('OpenNebula identity lookup is unavailable.'))

      return
    }

    connect({
      action: USER_INFO,
      parameters: [-1, false],
      callback: (error, value) => {
        if (error) {
          reject(new Error('OpenNebula identity lookup failed.'))

          return
        }

        const identity = value?.USER || value || {}
        const uid = String(identity.ID ?? '').trim()
        const username = String(identity.NAME ?? user).trim()

        if (!validIdentity(uid) || !validIdentity(username)) {
          reject(new Error('OpenNebula identity response is invalid.'))

          return
        }

        resolve({
          user: username,
          uid,
          oneadmin: uid === '0',
        })
      },
    })
  })

/**
 * Build the private control-plane request without exposing gateway material to
 * the browser route response.
 *
 * @param {object} options - request options
 * @param {object} actor - resolved OpenNebula actor
 * @param {object} config - validated platform configuration
 * @returns {object} Axios request options
 */
const buildPlatformRequest = (
  { method = 'GET', path = '/', data, idempotencyKey } = {},
  actor = {},
  config = getPlatformConfig()
) => {
  if (!validIdentity(actor.user) || !validIdentity(actor.uid)) {
    throw new Error('LayerSentry platform actor is invalid.')
  }

  const headers = {
    [GATEWAY_TOKEN_HEADER]: config.gatewayToken,
    [GATEWAY_USER_HEADER]: actor.user,
    [GATEWAY_UID_HEADER]: actor.uid,
    [GATEWAY_ADMIN_HEADER]: actor.oneadmin ? 'true' : 'false',
    'Content-Type': 'application/json',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const request = {
    method,
    baseURL: config.baseURL,
    url: path,
    timeout: config.timeout,
    headers,
    validateStatus: (status) => status >= 200 && status < 300,
  }

  if (data !== undefined) request.data = data
  if (config.httpsAgent) request.httpsAgent = config.httpsAgent

  return request
}

/**
 * Call the private LayerSentry control plane as the authenticated OpenNebula
 * actor.
 *
 * @param {object} request - platform request descriptor
 * @param {object} userData - authenticated FireEdge user data
 * @param {Function} oneConnection - OpenNebula XML-RPC connection factory
 * @returns {Promise<object>} response body
 */
const platformRequest = async (
  request,
  userData,
  oneConnection,
  config = getPlatformConfig()
) => {
  const actor = await resolvePlatformActor(userData, oneConnection)
  const response = await axios(buildPlatformRequest(request, actor, config))

  return response.data
}

/**
 * Fetch VM-service capability state from the private LayerSentry control plane.
 *
 * @param {object} userData - authenticated FireEdge user data
 * @param {Function} oneConnection - OpenNebula XML-RPC connection factory
 * @returns {Promise<object>} capability response body
 */
const platformCapabilities = (userData, oneConnection) =>
  platformRequest(
    {
      method: 'GET',
      path: '/v1/vm-services/capabilities',
    },
    userData,
    oneConnection
  )

module.exports = {
  DEFAULT_PLATFORM_URL,
  GATEWAY_TOKEN_HEADER,
  GATEWAY_USER_HEADER,
  GATEWAY_UID_HEADER,
  GATEWAY_ADMIN_HEADER,
  buildPlatformRequest,
  getPlatformConfig,
  platformCapabilities,
  platformRequest,
  resolvePlatformActor,
  validatePlatformUrl,
}
