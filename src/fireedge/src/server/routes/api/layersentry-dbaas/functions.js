const fs = require('fs')
const https = require('https')
const axios = require('axios')
const { URL } = require('url')
const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const {
  oneKsConnection,
} = require('server/routes/api/oneks/utils')
const {
  Commands: OneKsCommands,
  Actions: OneKsActions,
} = require('server/routes/api/oneks/routes')

const { defaultEmptyFunction } = defaults
const { badRequest, unauthorized, serviceUnavailable } = httpCodes
const configPath = process.env.LAYERSENTRY_DBAAS_CLUSTERS_FILE

const responseCode = (status) =>
  Object.values(httpCodes).find((code) => code?.id === status) ?? serviceUnavailable

const fail = (res, next, code, message) => {
  res.locals.httpCode = httpResponse(code, '', message)
  next()
}

const loadConfig = (clusterId) => {
  if (!configPath) throw new Error('LayerSentry DBaaS cluster configuration is not configured')
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const cluster = parsed?.clusters?.[String(clusterId)]
  if (!cluster) throw new Error('LayerSentry DBaaS is not enabled for this Kubernetes cluster')

  const target = new URL(cluster.url)
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('LayerSentry DBaaS endpoint must be an HTTPS URL without userinfo')
  }
  if (!cluster.tokenFile || !cluster.caFile) {
    throw new Error('LayerSentry DBaaS endpoint is missing server-side trust material')
  }

  return {
    url: target.toString().replace(/\/$/, ''),
    token: fs.readFileSync(cluster.tokenFile, 'utf8').trim(),
    ca: fs.readFileSync(cluster.caFile),
  }
}

const authorizeCluster = (clusterId, userData, onAllowed, onDenied) => {
  const { user, password } = userData ?? {}
  if (!user || !password || !clusterId) return onDenied()
  const command = OneKsCommands[OneKsActions.SHOW]
  oneKsConnection(
    {
      method: command.httpMethod,
      path: command.apiPath,
      user,
      password,
      request: clusterId,
    },
    onAllowed,
    onDenied
  )
}

const proxyRequest = async (res, next, params, method, suffix, body) => {
  let cluster
  try {
    cluster = loadConfig(params.clusterId)
  } catch (error) {
    return fail(res, next, serviceUnavailable, error.message)
  }
  if (cluster.token.length < 32) {
    return fail(res, next, serviceUnavailable, 'LayerSentry DBaaS API credential is invalid')
  }

  try {
    const response = await axios({
      method,
      url: `${cluster.url}/v1/databases${suffix}`,
      data: body,
      timeout: 30000,
      maxContentLength: 4 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      validateStatus: () => true,
      httpsAgent: new https.Agent({
        ca: cluster.ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      }),
      headers: {
        Authorization: `Bearer ${cluster.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })

    res.set('Cache-Control', 'no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    if (params.operation === 'credentials') res.set('Pragma', 'no-cache')
    res.locals.httpCode = httpResponse(responseCode(response.status), response.data)
    return next()
  } catch (_) {
    return fail(
      res,
      next,
      serviceUnavailable,
      'LayerSentry DBaaS service is unavailable'
    )
  }
}

const run = (method, suffixBuilder, includeBody = false) =>
  (
    res = {},
    next = defaultEmptyFunction,
    params = {},
    userData = {}
  ) => {
    if (!params.clusterId) return fail(res, next, badRequest, 'missing cluster id')
    return authorizeCluster(
      params.clusterId,
      userData,
      () => proxyRequest(
        res,
        next,
        params,
        method,
        suffixBuilder(params),
        includeBody ? params.body ?? {} : undefined
      ),
      () => fail(res, next, unauthorized, 'cluster access denied')
    )
  }

const list = run('GET', () => '')
const create = run('POST', () => '', true)
const show = run('GET', ({ name }) => `/${encodeURIComponent(name)}`)
const update = run('PUT', ({ name }) => `/${encodeURIComponent(name)}`, true)
const remove = run('DELETE', ({ name }) => `/${encodeURIComponent(name)}`)
const action = run(
  'POST',
  ({ name, operation }) =>
    `/${encodeURIComponent(name)}/actions/${encodeURIComponent(operation)}`,
  true
)

module.exports = { list, create, show, update, remove, action }
