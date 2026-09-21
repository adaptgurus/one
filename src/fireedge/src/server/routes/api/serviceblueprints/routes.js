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
        desiredState: { from: postBody },
        platformDesiredState: { from: postBody },
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
        platformDesiredState: { from: postBody },
      },
    },
  },
}
