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

const basepath = '/dr'
const { GET, POST } = httpMethod
const { resource, postBody } = fromData

const CAPABILITIES = 'dr.capabilities'
const DOMAINS = 'dr.domains'
const DOMAIN_CREATE = 'dr.domain.create'
const RECOVERY_POINTS = 'dr.recovery.points'
const CHECKPOINT = 'dr.checkpoint'

const Actions = {
  CAPABILITIES,
  DOMAINS,
  DOMAIN_CREATE,
  RECOVERY_POINTS,
  CHECKPOINT,
}

module.exports = {
  Actions,
  Commands: {
    [CAPABILITIES]: {
      path: `${basepath}/capabilities`,
      httpMethod: GET,
      auth: true,
    },
    [DOMAINS]: {
      path: `${basepath}/protection-domains`,
      httpMethod: GET,
      auth: true,
    },
    [DOMAIN_CREATE]: {
      path: `${basepath}/protection-domains`,
      httpMethod: POST,
      auth: true,
      params: { domain: { from: postBody } },
    },
    [RECOVERY_POINTS]: {
      path: `${basepath}/protection-domains/:id/recovery-points`,
      httpMethod: GET,
      auth: true,
      params: { id: { from: resource } },
    },
    [CHECKPOINT]: {
      path: `${basepath}/protection-domains/:id/checkpoint`,
      httpMethod: POST,
      auth: true,
      params: { id: { from: resource } },
    },
  },
}
