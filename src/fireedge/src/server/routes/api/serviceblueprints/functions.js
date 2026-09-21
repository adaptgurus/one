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
  getCatalog,
  findBlueprint,
} = require('server/routes/api/serviceblueprints/catalog')
const {
  validateDesiredState,
} = require('server/routes/api/serviceblueprints/validation')
const {
  platformRequest,
} = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, badRequest, conflict, serviceUnavailable } = httpCodes

const blocked = (code, message, extra = {}) => ({
  deployable: false,
  blockers: [{ code, message }],
  ...extra,
})

/**
 * Return the authenticated runtime catalog.
 *
 * Catalog presence never implies deployment eligibility. Each item carries
 * explicit qualification and execution-backend gates.
 *
 * @param {object} res - HTTP response
 * @param {Function} next - Express stepper
 */
const list = (res = {}, next = defaultEmptyFunction) => {
  res.locals.httpCode = httpResponse(ok, {
    items: getCatalog(),
    source: 'fireedge-runtime-catalog',
    failClosed: true,
  })
  next()
}

/**
 * Perform the first authoritative tuple gate.
 *
 * This endpoint intentionally does not attempt product/OS compatibility or
 * infrastructure reservation until an exact tuple has been promoted by the
 * qualification pipeline.
 *
 * @param {object} res - HTTP response
 * @param {Function} next - Express stepper
 * @param {object} params - Requested service tuple
 */
const preflight = (
  res = {},
  next = defaultEmptyFunction,
  params = {},
  userData = {},
  oneConnection
) => {
  const {
    blueprintId,
    version,
    edition,
    topology,
    desiredState,
    platformDesiredState,
  } = params

  if (!blueprintId || !version || !topology) {
    res.locals.httpCode = httpResponse(
      badRequest,
      blocked(
        'SERVICE_BLUEPRINT_REQUEST_INVALID',
        'blueprintId, version and topology are required.'
      )
    )
    next()

    return
  }

  const desiredStateErrors = validateDesiredState(desiredState)
  if (desiredStateErrors.length > 0) {
    res.locals.httpCode = httpResponse(
      badRequest,
      blocked(
        'SERVICE_BLUEPRINT_DESIRED_STATE_INVALID',
        'The requested desired state failed authoritative validation.',
        { validationErrors: desiredStateErrors }
      )
    )
    next()

    return
  }

  const blueprint = findBlueprint(blueprintId)
  if (!blueprint) {
    res.locals.httpCode = httpResponse(
      badRequest,
      blocked(
        'SERVICE_BLUEPRINT_UNKNOWN',
        'The requested production-service family is not published.'
      )
    )
    next()

    return
  }

  if (!blueprint.versions.includes(version)) {
    res.locals.httpCode = httpResponse(
      conflict,
      blocked(
        'SERVICE_BLUEPRINT_VERSION_NOT_PUBLISHED',
        'The requested version is not published by the runtime catalog.',
        { blueprintId, version, edition, topology }
      )
    )
    next()

    return
  }

  if (
    !platformDesiredState ||
    typeof platformDesiredState !== 'object' ||
    Array.isArray(platformDesiredState)
  ) {
    res.locals.httpCode = httpResponse(
      badRequest,
      blocked(
        'SERVICE_BLUEPRINT_PLATFORM_DESIRED_STATE_REQUIRED',
        'A normalized durable desired state is required.'
      )
    )
    next()

    return
  }

  // The durable LayerSentry backend is the sole production-tuple authority.
  // FireEdge performs fast request validation but never promotes or selects an
  // OS/image tuple from a browser-visible/static registry.
  platformRequest(
    {
      method: 'POST',
      path: '/v1/vm-services/preflight',
      data: {
        desired_state: platformDesiredState,
      },
    },
    userData,
    oneConnection
  )
    .then((platformState = {}) => {
      const deployable = platformState.deployable === true
      res.locals.httpCode = httpResponse(
        deployable ? ok : serviceUnavailable,
        platformState
      )
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
        res.locals.httpCode = httpResponse(upstreamStatus, upstreamData)
        next()

        return
      }

      res.locals.httpCode = httpResponse(
        serviceUnavailable,
        blocked(
          'SERVICE_BLUEPRINT_CONTROL_PLANE_UNAVAILABLE',
          'The LayerSentry VM-service control plane is unavailable or not configured.'
        )
      )
      next()
    })
}

/**
 * Keep deployment hard-disabled until the exact-tuple preflight, operation
 * journal, OpenNebula/OneFlow execution and guest configuration adapters are
 * qualified together.
 *
 * @param {object} res - HTTP response
 * @param {Function} next - Express stepper
 * @param {object} params - Requested service tuple
 */
const deploy = (res = {}, next = defaultEmptyFunction, params = {}) => {
  const { blueprintId, version, edition, topology } = params

  res.locals.httpCode = httpResponse(
    serviceUnavailable,
    blocked(
      'SERVICE_BLUEPRINT_DEPLOYMENT_DISABLED',
      'Production-service deployment is fail-closed until the exact tuple and execution backend are qualified.',
      { blueprintId, version, edition, topology }
    )
  )
  next()
}

module.exports = {
  list,
  preflight,
  deploy,
}
