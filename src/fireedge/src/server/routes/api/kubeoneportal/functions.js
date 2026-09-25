const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const { platformRequest } = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, serviceUnavailable } = httpCodes

const validClusterID = (value) => /^[a-zA-Z0-9]([a-zA-Z0-9_.-]{0,126}[a-zA-Z0-9])?$/.test(String(value || ''))

const proxyError = (res, next, error) => {
  const status = Number(error?.response?.status)
  const data = error?.response?.data
  if (Number.isInteger(status) && status >= 400 && status <= 599 && data && typeof data === 'object') {
    const code = Object.values(httpCodes).find(({ id }) => id === status) || serviceUnavailable
    res.locals.httpCode = httpResponse(code, data)
  } else {
    res.locals.httpCode = httpResponse(serviceUnavailable, { error: 'KubeOne management service is unavailable.' })
  }
  next()
}

const call = (res, next, request, userData, oneConnection) =>
  platformRequest(request, userData, oneConnection)
    .then((data) => { res.locals.httpCode = httpResponse(ok, data); next() })
    .catch((error) => proxyError(res, next, error))

const list = (res = {}, next = defaultEmptyFunction, _params = {}, userData = {}, oneConnection) =>
  call(res, next, { method: 'GET', path: '/v1/kubernetes/clusters' }, userData, oneConnection)

const namespaces = (res = {}, next = defaultEmptyFunction, { id } = {}, userData = {}, oneConnection) => {
  if (!validClusterID(id)) { res.locals.httpCode = httpResponse(badRequest, { error: 'Invalid cluster identity.' }); next(); return }
  call(res, next, { method: 'GET', path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/namespaces` }, userData, oneConnection)
}

const createNamespace = (res = {}, next = defaultEmptyFunction, { id, name } = {}, userData = {}, oneConnection) => {
  if (!validClusterID(id) || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(String(name || '')) || String(name).length > 63) {
    res.locals.httpCode = httpResponse(badRequest, { error: 'Invalid cluster or namespace identity.' }); next(); return
  }
  call(res, next, { method: 'POST', path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/namespaces`, data: { name } }, userData, oneConnection)
}

const kubeconfig = (res = {}, next = defaultEmptyFunction, { id } = {}, userData = {}, oneConnection) => {
  if (!validClusterID(id)) { res.locals.httpCode = httpResponse(badRequest, { error: 'Invalid cluster identity.' }); next(); return }
  call(res, next, { method: 'GET', path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/kubeconfig` }, userData, oneConnection)
}

module.exports = { list, namespaces, createNamespace, kubeconfig }
