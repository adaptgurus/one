/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems
 * Licensed under the Apache License, Version 2.0.
 * ------------------------------------------------------------------------- */

const {
  httpMethod,
  from: fromData,
} = require('../../../utils/constants/defaults')

const { GET, POST } = httpMethod
const { postBody } = fromData

const basepath = '/v1/service-blueprints'

const SERVICE_BLUEPRINTS_LIST = 'serviceblueprints.list'
const SERVICE_BLUEPRINTS_PREFLIGHT = 'serviceblueprints.preflight'
const SERVICE_BLUEPRINTS_DEPLOY = 'serviceblueprints.deploy'

const Actions = {
  SERVICE_BLUEPRINTS_LIST,
  SERVICE_BLUEPRINTS_PREFLIGHT,
  SERVICE_BLUEPRINTS_DEPLOY,
}

module.exports = {
  Actions,
  Commands: {
    [SERVICE_BLUEPRINTS_LIST]: {
      path: basepath,
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [SERVICE_BLUEPRINTS_PREFLIGHT]: {
      path: `${basepath}/preflight`,
      httpMethod: POST,
      auth: true,
      params: {
        blueprintId: { from: postBody },
        version: { from: postBody },
        edition: { from: postBody },
        topology: { from: postBody },
      },
    },
    [SERVICE_BLUEPRINTS_DEPLOY]: {
      path: `${basepath}/deploy`,
      httpMethod: POST,
      auth: true,
      params: {
        blueprintId: { from: postBody },
        version: { from: postBody },
        edition: { from: postBody },
        topology: { from: postBody },
        desiredState: { from: postBody },
      },
    },
  },
}
