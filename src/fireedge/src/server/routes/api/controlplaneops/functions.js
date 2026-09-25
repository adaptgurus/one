const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const {
  getControlplaneConfig,
  platformRequest,
} = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, accepted, badRequest, serviceUnavailable } = httpCodes

const allowedActions = new Set([
  'CREATE',
  'CLONE',
  'FULL_CLONE',
  'RENAME',
  'START',
  'POWEROFF',
  'POWEROFF_HARD',
  'HOLD',
  'RELEASE',
  'SUSPEND',
  'STOP',
  'UNDEPLOY',
  'REBOOT',
  'REBOOT_HARD',
  'SNAPSHOT_CREATE',
  'SNAPSHOT_DELETE',
  'SNAPSHOT_REVERT',
  'RESIZE',
  'ATTACH_DISK',
  'DETACH_DISK',
  'ATTACH_NIC',
  'DETACH_NIC',
  'GROW_DISK',
  'RECONCILE',
])

const validID = (value) =>
  /^[a-zA-Z0-9](?:[a-zA-Z0-9_.:-]{0,189}[a-zA-Z0-9])?$/.test(
    String(value || '')
  )
const validOperationID = (value) =>
  /^[a-zA-Z0-9](?:[a-zA-Z0-9_.-]{6,189}[a-zA-Z0-9])?$/.test(
    String(value || '')
  )
const validIdempotencyKey = (value) =>
  /^[\x21-\x7e]{8,128}$/.test(String(value || ''))
const plainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const proxyError = (res, next, error) => {
  const status = Number(error?.response?.status)
  const data = error?.response?.data
  if (
    Number.isInteger(status) &&
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
      error: 'LayerSentry durable operation service is unavailable.',
    })
  }
  next()
}

const call = (res, next, request, userData, oneConnection, responseCode = ok) => {
  let config
  try {
    config = getControlplaneConfig()
  } catch (error) {
    proxyError(res, next, error)
    return
  }
  platformRequest(request, userData, oneConnection, config)
    .then((data) => {
      res.locals.httpCode = httpResponse(responseCode, data)
      next()
    })
    .catch((error) => proxyError(res, next, error))
}

const submit = (
  res = {},
  next = defaultEmptyFunction,
  {
    resourceKind,
    resourceId,
    action,
    desiredState = {},
    reason = '',
    idempotencyKey,
  } = {},
  userData = {},
  oneConnection
) => {
  const normalizedAction = String(action || '').trim().toUpperCase()
  const normalizedReason = String(reason || '').trim()
  if (
    resourceKind !== 'VirtualMachine' ||
    !validID(resourceId) ||
    !allowedActions.has(normalizedAction) ||
    !plainObject(desiredState) ||
    JSON.stringify(desiredState).length > 65536 ||
    normalizedReason.length > 512 ||
    !validIdempotencyKey(idempotencyKey)
  ) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid durable virtual-machine operation request.',
    })
    next()
    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: '/v1/intents',
      idempotencyKey,
      data: {
        resource_kind: resourceKind,
        resource_id: String(resourceId),
        action: normalizedAction,
        desired_state: desiredState,
        reason: normalizedReason,
      },
    },
    userData,
    oneConnection,
    accepted
  )
}

const get = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validOperationID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid LayerSentry operation identity.',
    })
    next()
    return
  }
  call(
    res,
    next,
    { method: 'GET', path: `/v1/operations/${encodeURIComponent(id)}` },
    userData,
    oneConnection
  )
}

module.exports = { get, submit }
