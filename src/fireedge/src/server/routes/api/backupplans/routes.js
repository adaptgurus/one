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

const { httpMethod } = require('../../../utils/constants/defaults')

const { GET } = httpMethod

const basepath = '/v1/backup-plans'
const BACKUP_PLANS_LIST = 'backupplans.list'

const Actions = { BACKUP_PLANS_LIST }

module.exports = {
  Actions,
  Commands: {
    [BACKUP_PLANS_LIST]: {
      path: basepath,
      httpMethod: GET,
      auth: true,
      params: {},
    },
  },
}
