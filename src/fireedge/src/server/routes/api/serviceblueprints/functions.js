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
 */
const list = (
  res = {},
  next = defaultEmptyFunction
) => {
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
 */
const preflight = (
  res = {},
  next = defaultEmptyFunction,
  params = {}
) => {
  const { blueprintId, version, edition, topology } = params
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

  if (!blueprint.productionSelectable || !blueprint.executionBackendQualified) {
    res.locals.httpCode = httpResponse(
      conflict,
      blocked(
        'SERVICE_BLUEPRINT_TUPLE_NOT_PROMOTED',
        'The requested tuple is not production-qualified for deployment.',
        {
          blueprintId,
          version,
          edition,
          topology,
          qualification: blueprint.qualification,
          productionSelectable: blueprint.productionSelectable,
          executionBackendQualified: blueprint.executionBackendQualified,
        }
      )
    )
    next()

    return
  }

  // Defensive default. Promotion logic must replace this branch with exact
  // immutable tuple resolution before any infrastructure mutation is enabled.
  res.locals.httpCode = httpResponse(
    serviceUnavailable,
    blocked(
      'SERVICE_BLUEPRINT_EXECUTION_NOT_WIRED',
      'No qualified execution adapter is available for this tuple.'
    )
  )
  next()
}

/**
 * Deployment remains hard-disabled until exact-tuple preflight, operation
 * journaling, OpenNebula/OneFlow execution and guest configuration adapters
 * are qualified together.
 */
const deploy = (
  res = {},
  next = defaultEmptyFunction,
  params = {}
) => {
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
