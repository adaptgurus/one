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

const { Actions, Commands } = require('server/routes/api/replicationv2/routes')
const actions = require('server/routes/api/replicationv2/functions')

module.exports = [
  { ...Commands[Actions.CAPABILITIES], action: actions.capabilities },
  { ...Commands[Actions.SESSIONS], action: actions.sessions },
  { ...Commands[Actions.CREATE], action: actions.create },
  { ...Commands[Actions.PREFLIGHT], action: actions.preflight },
  { ...Commands[Actions.HEALTH], action: actions.health },
  { ...Commands[Actions.BACKEND_HEALTH], action: actions.backendHealth },
  { ...Commands[Actions.CHECKPOINTS], action: actions.checkpoints },
  { ...Commands[Actions.CLONE], action: actions.clone },
  { ...Commands[Actions.REBASELINE], action: actions.rebaseline },
  {
    ...Commands[Actions.PUT_PROTECTION_GROUP],
    action: actions.putProtectionGroup,
  },
  {
    ...Commands[Actions.CAPTURE_PROTECTION_GROUP],
    action: actions.captureProtectionGroup,
  },
  {
    ...Commands[Actions.PROTECTION_GROUP_CHECKPOINTS],
    action: actions.protectionGroupCheckpoints,
  },
  {
    ...Commands[Actions.DR_SITES],
    action: actions.drSites,
  },
  {
    ...Commands[Actions.DR_ENVIRONMENT_NETWORKS],
    action: actions.drEnvironmentNetworks,
  },
  {
    ...Commands[Actions.DR_PROVISION_ENVIRONMENT_NETWORKS],
    action: actions.drProvisionEnvironmentNetworks,
  },
  {
    ...Commands[Actions.DR_PAIR_SITE],
    action: actions.drPairSite,
  },
  {
    ...Commands[Actions.DR_MANAGEMENT_BACKUP_POLICIES],
    action: actions.drManagementBackupPolicies,
  },
  {
    ...Commands[Actions.DR_RUN_MANAGEMENT_BACKUP],
    action: actions.drRunManagementBackup,
  },
  {
    ...Commands[Actions.DR_MANAGEMENT_BACKUP_STATUS],
    action: actions.drManagementBackupStatus,
  },
  {
    ...Commands[Actions.DR_VM_CHECKPOINTS],
    action: actions.drVMCheckpoints,
  },
  {
    ...Commands[Actions.DR_PUT_RECOVERY_MAPPING],
    action: actions.drPutRecoveryMapping,
  },
  {
    ...Commands[Actions.DR_GET_RECOVERY_MAPPING],
    action: actions.drGetRecoveryMapping,
  },
]