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
const { Actions, Commands } = require('server/routes/api/dr/routes')
const {
  capabilities,
  domains,
  createDomain,
  recoveryPoints,
  checkpoint,
} = require('server/routes/api/dr/functions')

module.exports = [
  { ...Commands[Actions.CAPABILITIES], action: capabilities },
  { ...Commands[Actions.DOMAINS], action: domains },
  { ...Commands[Actions.DOMAIN_CREATE], action: createDomain },
  { ...Commands[Actions.RECOVERY_POINTS], action: recoveryPoints },
  { ...Commands[Actions.CHECKPOINT], action: checkpoint },
]
