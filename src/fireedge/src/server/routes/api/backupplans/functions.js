/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 * ------------------------------------------------------------------------- */

const { defaults, httpCodes } = require('server/utils/constants')
const { httpResponse } = require('server/utils/server')
const {
  platformRequest,
} = require('server/routes/api/serviceblueprints/platform')

const { defaultEmptyFunction } = defaults
const { ok, serviceUnavailable } = httpCodes

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

module.exports = { list }
