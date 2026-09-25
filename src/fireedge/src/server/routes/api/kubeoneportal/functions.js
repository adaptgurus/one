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
const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const {
  platformRequest,
} = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, serviceUnavailable } = httpCodes

const validClusterID = (value) =>
  /^[a-zA-Z0-9]([a-zA-Z0-9_.-]{0,126}[a-zA-Z0-9])?$/.test(String(value || ''))
const validApplicationID = (value) =>
  /^[a-z0-9]([-a-z0-9_.]*[a-z0-9])?$/.test(String(value || ''))

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
      error: 'KubeOne management service is unavailable.',
    })
  }
  next()
}

const call = (res, next, request, userData, oneConnection) =>
  platformRequest(request, userData, oneConnection)
    .then((data) => {
      res.locals.httpCode = httpResponse(ok, data)
      next()
    })
    .catch((error) => proxyError(res, next, error))

/**
 * @param res
 * @param next
 * @param _params
 * @param userData
 * @param oneConnection
 */
const list = (
  res = {},
  next = defaultEmptyFunction,
  _params = {},
  userData = {},
  oneConnection
) =>
  call(
    res,
    next,
    { method: 'GET', path: '/v1/kubernetes/clusters' },
    userData,
    oneConnection
  )

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const namespaces = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/namespaces`,
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param root0.name
 * @param userData
 * @param oneConnection
 */
const createNamespace = (
  res = {},
  next = defaultEmptyFunction,
  { id, name } = {},
  userData = {},
  oneConnection
) => {
  if (
    !validClusterID(id) ||
    !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(String(name || '')) ||
    String(name).length > 63
  ) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster or namespace identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/namespaces`,
      data: { name },
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const kubeconfig = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/kubeconfig`,
    },
    userData,
    oneConnection
  )
}

/**
 * Provision a registered server-owned KubeOne cluster plan.
 *
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const provision = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/provision`,
      data: {},
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const provisionStatus = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/provision`,
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const controlPlaneReconciliation = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(
        id
      )}/control-plane-reconciliation`,
      data: {},
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const controlPlaneReconciliationStatus = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(
        id
      )}/control-plane-reconciliation`,
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const workerReconciliation = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(
        id
      )}/worker-reconciliation`,
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const reconcileWorkers = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(
        id
      )}/worker-reconciliation`,
      data: {},
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param userData
 * @param oneConnection
 */
const applications = (
  res = {},
  next = defaultEmptyFunction,
  { id } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'GET',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(id)}/applications`,
    },
    userData,
    oneConnection
  )
}

/**
 * @param res
 * @param next
 * @param root0
 * @param root0.id
 * @param root0.app
 * @param userData
 * @param oneConnection
 */
const installApplication = (
  res = {},
  next = defaultEmptyFunction,
  { id, app } = {},
  userData = {},
  oneConnection
) => {
  if (!validClusterID(id) || !validApplicationID(app)) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'Invalid cluster or application identity.',
    })
    next()

    return
  }
  call(
    res,
    next,
    {
      method: 'POST',
      path: `/v1/kubernetes/clusters/${encodeURIComponent(
        id
      )}/applications/${encodeURIComponent(app)}`,
      data: {},
    },
    userData,
    oneConnection
  )
}

module.exports = {
  list,
  namespaces,
  createNamespace,
  kubeconfig,
  provision,
  provisionStatus,
  controlPlaneReconciliation,
  controlPlaneReconciliationStatus,
  workerReconciliation,
  reconcileWorkers,
  applications,
  installApplication,
}
