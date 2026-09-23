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
/* eslint-disable jsdoc/require-jsdoc, prettier/prettier, padding-line-between-statements */

const { httpMethod, from: fromData } = require('../../../utils/constants/defaults')
const { GET, POST } = httpMethod
const { postBody } = fromData

const basepath = '/v1/replication-v2'
const Actions = {
  CAPABILITIES: 'replicationv2.capabilities',
  SESSIONS: 'replicationv2.sessions',
  CREATE: 'replicationv2.create',
  PREFLIGHT: 'replicationv2.preflight',
  HEALTH: 'replicationv2.health',
  BACKEND_HEALTH: 'replicationv2.backendHealth',
  CHECKPOINTS: 'replicationv2.checkpoints',
  CLONE: 'replicationv2.clone',
  REBASELINE: 'replicationv2.rebaseline',
  PUT_PROTECTION_GROUP: 'replicationv2.putProtectionGroup',
  CAPTURE_PROTECTION_GROUP: 'replicationv2.captureProtectionGroup',
  PROTECTION_GROUP_CHECKPOINTS: 'replicationv2.protectionGroupCheckpoints',
}

module.exports = {
  Actions,
  Commands: {
    [Actions.CAPABILITIES]: {
      path: basepath + '/capabilities',
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [Actions.SESSIONS]: {
      path: basepath + '/sessions',
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [Actions.CREATE]: {
      path: basepath + '/sessions',
      httpMethod: POST,
      auth: true,
      params: { request: { from: postBody } },
    },
    [Actions.PREFLIGHT]: {
      path: basepath + '/preflight',
      httpMethod: POST,
      auth: true,
      params: { request: { from: postBody } },
    },
    [Actions.HEALTH]: {
      path: basepath + '/health',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.BACKEND_HEALTH]: {
      path: basepath + '/backend-health',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.CHECKPOINTS]: {
      path: basepath + '/checkpoints',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.CLONE]: {
      path: basepath + '/clone',
      httpMethod: POST,
      auth: true,
      params: {
        sessionId: { from: postBody },
        checkpointId: { from: postBody },
        name: { from: postBody },
      },
    },
    [Actions.REBASELINE]: {
      path: basepath + '/rebaseline',
      httpMethod: POST,
      auth: true,
      params: { sessionId: { from: postBody } },
    },
    [Actions.PUT_PROTECTION_GROUP]: {
      path: basepath + '/protection-groups',
      httpMethod: POST,
      auth: true,
      params: { group: { from: postBody } },
    },
    [Actions.CAPTURE_PROTECTION_GROUP]: {
      path: basepath + '/protection-groups/capture',
      httpMethod: POST,
      auth: true,
      params: { groupId: { from: postBody } },
    },
    [Actions.PROTECTION_GROUP_CHECKPOINTS]: {
      path: basepath + '/protection-groups/checkpoints',
      httpMethod: POST,
      auth: true,
      params: { groupId: { from: postBody } },
    },
  },
}
