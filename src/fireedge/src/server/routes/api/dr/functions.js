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
const fs = require('fs')
const { request: axios } = require('axios')
const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const { getSunstoneConfig } = require('server/utils/yml')
const { writeInLogger } = require('server/utils/logger')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, forbidden, serviceUnavailable, internalServerError } =
  httpCodes

const tokenFile = () => {
  const cfg = getSunstoneConfig()
  const file = String(cfg.layersentry_dr_gateway_token_file ?? '').trim()

  if (!file)
    throw new Error('LayerSentry DR gateway token file is not configured')
  const stat = fs.statSync(file)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error(
      'LayerSentry DR gateway token file must be a protected regular file'
    )
  }

  const token = fs.readFileSync(file, 'utf8').trim()
  if (token.length < 32)
    throw new Error('LayerSentry DR gateway token is invalid')

  return token
}

const drConfig = () => {
  const cfg = getSunstoneConfig()
  const baseURL = String(cfg.layersentry_dr_api ?? '')
    .trim()
    .replace(/\/+$/, '')
  const parsed = new URL(baseURL)
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)

  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    (!loopback && parsed.protocol !== 'https:')
  ) {
    throw new Error('LayerSentry DR API must use HTTPS outside loopback')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'LayerSentry DR API URL must not contain credentials, query or fragment'
    )
  }

  return { baseURL, token: tokenFile() }
}

const proxy = async ({ method = 'GET', path = '/', data, userData = {} }) => {
  const { user, id } = userData
  if (!user || id === undefined || id === null) {
    const err = new Error('Authenticated LayerSentry user identity is required')
    err.status = 403
    throw err
  }
  if (user !== 'oneadmin') {
    const err = new Error(
      'Protection Domain management currently requires oneadmin'
    )
    err.status = 403
    throw err
  }

  const { baseURL, token } = drConfig()
  const response = await axios({
    method,
    baseURL,
    url: path,
    data,
    timeout: 15000,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      'Content-Type': 'application/json',
      'X-LayerSentry-Gateway-Token': token,
      'X-LayerSentry-User': user,
      'X-LayerSentry-UID': String(id),
      'X-LayerSentry-Oneadmin': 'true',
    },
  })

  if (response.status < 200 || response.status >= 300) {
    const err = new Error(
      response.data?.error ||
        response.data?.message ||
        'LayerSentry DR API request failed'
    )
    err.status = response.status
    throw err
  }

  return response.data
}

const action =
  (request) =>
  async (res = {}, next = defaultEmptyFunction, params = {}, userData = {}) => {
    try {
      const data = await request(params, userData)
      res.locals.httpCode = httpResponse(ok, data)
    } catch (error) {
      writeInLogger(error)
      const status = Number(error?.status)
      const code =
        status === 400
          ? badRequest
          : status === 403
          ? forbidden
          : status === 503
          ? serviceUnavailable
          : internalServerError
      res.locals.httpCode = httpResponse(
        code,
        error?.message || 'LayerSentry DR API request failed'
      )
    }
    next()
  }

const capabilities = action((_, userData) =>
  proxy({ path: '/v1/dr/capabilities', userData })
)
const sites = action((_, userData) =>
  proxy({ path: '/v1/dr/sites', userData })
)
const createSite = action(({ site }, userData) =>
  proxy({
    method: 'POST',
    path: '/v1/dr/sites',
    data: site,
    userData,
  })
)
const domains = action((_, userData) =>
  proxy({ path: '/v1/dr/protection-groups', userData })
)
const createDomain = action(({ domain }, userData) =>
  proxy({
    method: 'POST',
    path: '/v1/dr/protection-groups',
    data: domain,
    userData,
  })
)
const recoveryPoints = action(({ id }, userData) =>
  proxy({
    path: `/v1/dr/protection-groups/${encodeURIComponent(id)}/recovery-points`,
    userData,
  })
)
const checkpoint = action(({ id }, userData) =>
  proxy({
    method: 'POST',
    path: `/v1/dr/protection-groups/${encodeURIComponent(id)}/backup-now`,
    userData,
  })
)

module.exports = {
  capabilities,
  sites,
  createSite,
  domains,
  createDomain,
  recoveryPoints,
  checkpoint,
}
