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

const responseForStatus = (status) =>
  Object.values(httpCodes).find(({ id }) => id === status) || serviceUnavailable

/**
 * Return the LayerSentry backup-plan catalog. The authoritative catalog lives
 * in the LayerSentry SQL control plane; FireEdge only proxies authenticated
 * application identity and never invents local policy success.
 */
const list = (
  res = {},
  next = defaultEmptyFunction,
  _params = {},
  userData = {},
  oneConnection
) => {
  platformRequest(
    {
      method: 'GET',
      path: '/v1/protection/backup-plans',
    },
    userData,
    oneConnection
  )
    .then((payload = {}) => {
      res.locals.httpCode = httpResponse(ok, payload)
      next()
    })
    .catch(() => {
      res.locals.httpCode = httpResponse(serviceUnavailable, {
        items: [],
        customAllowed: false,
        editable: false,
        source: 'layersentry-control-plane',
        error:
          'The LayerSentry backup-plan catalog is unavailable or not configured.',
      })
      next()
    })
}


const proxyMutation = (
  res,
  next,
  request,
  userData,
  oneConnection
) => {
  platformRequest(request, userData, oneConnection)
    .then((payload = {}) => {
      res.locals.httpCode = httpResponse(ok, payload)
      next()
    })
    .catch((error) => {
      const upstreamStatus = Number(error?.response?.status)
      const upstreamData = error?.response?.data
      if (
        Number.isInteger(upstreamStatus) &&
        upstreamStatus >= 400 &&
        upstreamStatus <= 599 &&
        upstreamData &&
        typeof upstreamData === 'object'
      ) {
        res.locals.httpCode = httpResponse(
          responseForStatus(upstreamStatus),
          upstreamData
        )
        next()

        return
      }

      res.locals.httpCode = httpResponse(serviceUnavailable, {
        error: 'The LayerSentry backup-plan control plane is unavailable.',
      })
      next()
    })
}

const updateDatastore = (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  oneConnection
) => {
  const planId = String(params.planId ?? '').trim()
  const version = Number(params.version)
  const sourceBackupDatastoreId = Number(params.sourceBackupDatastoreId)

  if (
    !planId ||
    !Number.isInteger(version) ||
    version < 1 ||
    !Number.isInteger(sourceBackupDatastoreId) ||
    sourceBackupDatastoreId < 0
  ) {
    res.locals.httpCode = httpResponse(badRequest, {
      error: 'planId, current version and backup datastore are required.',
    })
    next()

    return
  }

  proxyMutation(
    res,
    next,
    {
      method: 'POST',
      path: '/v1/protection/backup-plans/datastore',
      data: { planId, version, sourceBackupDatastoreId },
    },
    userData,
    oneConnection
  )
}

const clone = (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  oneConnection
) => {
  const sourcePlanId = String(params.sourcePlanId ?? '').trim()
  const name = String(params.name ?? '').trim()
  const requestId = String(params.requestId ?? '').trim()
  const sourceBackupDatastoreId = Number(params.sourceBackupDatastoreId)

  if (
    !sourcePlanId ||
    !name ||
    name.length > 191 ||
    requestId.length < 8 ||
    !Number.isInteger(sourceBackupDatastoreId) ||
    sourceBackupDatastoreId < 0
  ) {
    res.locals.httpCode = httpResponse(badRequest, {
      error:
        'sourcePlanId, clone name, requestId and backup datastore are required.',
    })
    next()

    return
  }

  proxyMutation(
    res,
    next,
    {
      method: 'POST',
      path: '/v1/protection/backup-plans/clone',
      data: { sourcePlanId, name, sourceBackupDatastoreId, requestId },
    },
    userData,
    oneConnection
  )
}

module.exports = { list, updateDatastore, clone }
