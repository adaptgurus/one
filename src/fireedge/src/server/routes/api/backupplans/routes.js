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

const basepath = '/v1/backup-plans'
const BACKUP_PLANS_LIST = 'backupplans.list'
const BACKUP_PLANS_DATASTORE = 'backupplans.datastore'
const BACKUP_PLANS_CLONE = 'backupplans.clone'

const Actions = {
  BACKUP_PLANS_LIST,
  BACKUP_PLANS_DATASTORE,
  BACKUP_PLANS_CLONE,
}

module.exports = {
  Actions,
  Commands: {
    [BACKUP_PLANS_LIST]: {
      path: basepath,
      httpMethod: GET,
      auth: true,
      params: {},
    },
    [BACKUP_PLANS_DATASTORE]: {
      path: `${basepath}/datastore`,
      httpMethod: POST,
      auth: true,
      params: {
        planId: { from: postBody },
        version: { from: postBody },
        sourceBackupDatastoreId: { from: postBody },
      },
    },
    [BACKUP_PLANS_CLONE]: {
      path: `${basepath}/clone`,
      httpMethod: POST,
      auth: true,
      params: {
        sourcePlanId: { from: postBody },
        name: { from: postBody },
        sourceBackupDatastoreId: { from: postBody },
        requestId: { from: postBody },
      },
    },
  },
}
