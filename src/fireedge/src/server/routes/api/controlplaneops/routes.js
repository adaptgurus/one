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
const { postBody, query, resource } = fromData
const basepath = '/v1/controlplane/operations'

const Actions = {
  LIST: 'controlplaneops.list',
  SUBMIT: 'controlplaneops.submit',
  GET: 'controlplaneops.get',
  APPROVE: 'controlplaneops.approve',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.LIST]: {
      path: basepath,
      httpMethod: GET,
      auth: true,
      params: { limit: { from: query } },
    },
    [Actions.SUBMIT]: {
      path: basepath,
      httpMethod: POST,
      auth: true,
      params: {
        resourceKind: { from: postBody },
        resourceId: { from: postBody },
        action: { from: postBody },
        desiredState: { from: postBody },
        reason: { from: postBody },
        idempotencyKey: { from: postBody },
      },
    },
    [Actions.GET]: {
      path: `${basepath}/:id`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [Actions.APPROVE]: {
      path: `${basepath}/:id/approve`,
      httpMethod: POST,
      auth: true,
      params: {
        id: { from: resource },
        planHash: { from: postBody },
      },
    },
  },
}
