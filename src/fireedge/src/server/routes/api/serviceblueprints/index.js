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
  Actions,
  Commands,
} = require('server/routes/api/serviceblueprints/routes')
const {
  list,
  preflight,
  deploy,
} = require('server/routes/api/serviceblueprints/functions')

const {
  SERVICE_BLUEPRINTS_LIST,
  SERVICE_BLUEPRINTS_PREFLIGHT,
  SERVICE_BLUEPRINTS_DEPLOY,
} = Actions

module.exports = [
  {
    ...Commands[SERVICE_BLUEPRINTS_LIST],
    action: list,
  },
  {
    ...Commands[SERVICE_BLUEPRINTS_PREFLIGHT],
    action: preflight,
  },
  {
    ...Commands[SERVICE_BLUEPRINTS_DEPLOY],
    action: deploy,
  },
]
