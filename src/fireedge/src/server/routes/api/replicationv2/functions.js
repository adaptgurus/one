const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const {
  platformRequest,
} = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, serviceUnavailable } = httpCodes

const respond = (res, next, promise, success = ok) =>
  promise
    .then((payload = {}) => {
      res.locals.httpCode = httpResponse(success, payload)
      next()
    })
    .catch((error) => {
      const status = Number(error?.response?.status)
      const data = error?.response?.data
      if (
        status >= 400 &&
        status <= 599 &&
        data &&
        typeof data === 'object'
      ) {
        const code =
          Object.values(httpCodes).find(({ id }) => id === status) ||
          serviceUnavailable
        res.locals.httpCode = httpResponse(code, data)
      } else {
        res.locals.httpCode = httpResponse(serviceUnavailable, {
          error: 'LayerSentry replication control plane is unavailable.',
        })
      }
      next()
    })

const capabilities = (
  res = {},
  next = defaultEmptyFunction,
  _p = {},
  userData = {},
  oneConnection
) =>
  respond(
    res,
    next,
    platformRequest(
      { method: 'GET', path: '/v1/replication/capabilities' },
      userData,
      oneConnection
    )
  )

const sessions = (
  res = {},
  next = defaultEmptyFunction,
  _p = {},
  userData = {},
  oneConnection
) =>
  respond(
    res,
    next,
    platformRequest(
      { method: 'GET', path: '/v1/replication/sessions' },
      userData,
      oneConnection
    )
  )

const create = (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  oneConnection
) => {
  if (!params.request || typeof params.request !== 'object') {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Replication session request is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'POST',
        path: '/v1/replication/sessions',
        data: params.request,
      },
      userData,
      oneConnection
    )
  )
}

const preflight = (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  oneConnection
) => {
  if (!params.request || typeof params.request !== 'object') {
    res.locals.httpCode = httpResponse(badRequest, {
      ready: false,
      error: 'Replication preflight request is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'POST',
        path: '/v1/replication/preflight',
        data: params.request,
      },
      userData,
      oneConnection
    )
  )
}

const sessionGet = (suffix) => (
  res = {},
  next = defaultEmptyFunction,
  { sessionId } = {},
  userData = {},
  oneConnection
) => {
  if (!sessionId) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'sessionId is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'GET',
        path:
          '/v1/replication/sessions/' +
          encodeURIComponent(sessionId) +
          suffix,
      },
      userData,
      oneConnection
    )
  )
}

const health = sessionGet('/health')
const backendHealth = sessionGet('/backend-health')
const checkpoints = sessionGet('/checkpoints')

const clone = (
  res = {},
  next = defaultEmptyFunction,
  { sessionId, checkpointId, name } = {},
  userData = {},
  oneConnection
) => {
  if (!sessionId || !checkpointId) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'sessionId and checkpointId are required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'POST',
        path:
          '/v1/replication/sessions/' +
          encodeURIComponent(sessionId) +
          '/checkpoints/' +
          encodeURIComponent(checkpointId) +
          '/clone',
        data: { name: name || '' },
      },
      userData,
      oneConnection
    )
  )
}

const rebaseline = (
  res = {},
  next = defaultEmptyFunction,
  { sessionId } = {},
  userData = {},
  oneConnection
) => {
  if (!sessionId) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'sessionId is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'POST',
        path:
          '/v1/replication/sessions/' +
          encodeURIComponent(sessionId) +
          '/rebaseline',
      },
      userData,
      oneConnection
    )
  )
}

const putProtectionGroup = (
  res = {},
  next = defaultEmptyFunction,
  { group } = {},
  userData = {},
  oneConnection
) => {
  if (!group || typeof group !== 'object') {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Protection group request is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      { method: 'POST', path: '/v1/replication/protection-groups', data: group },
      userData,
      oneConnection
    )
  )
}

const captureProtectionGroup = (
  res = {},
  next = defaultEmptyFunction,
  { groupId } = {},
  userData = {},
  oneConnection
) => {
  if (!groupId) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'groupId is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'POST',
        path:
          '/v1/replication/protection-groups/' +
          encodeURIComponent(groupId) +
          '/capture',
      },
      userData,
      oneConnection
    )
  )
}

const protectionGroupCheckpoints = (
  res = {},
  next = defaultEmptyFunction,
  { groupId } = {},
  userData = {},
  oneConnection
) => {
  if (!groupId) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'groupId is required.',
    })
    next()
    return
  }
  respond(
    res,
    next,
    platformRequest(
      {
        method: 'GET',
        path:
          '/v1/replication/protection-groups/' +
          encodeURIComponent(groupId) +
          '/checkpoints',
      },
      userData,
      oneConnection
    )
  )
}

module.exports = {
  capabilities,
  sessions,
  create,
  preflight,
  health,
  backendHealth,
  checkpoints,
  clone,
  rebaseline,
  putProtectionGroup,
  captureProtectionGroup,
  protectionGroupCheckpoints,
}
