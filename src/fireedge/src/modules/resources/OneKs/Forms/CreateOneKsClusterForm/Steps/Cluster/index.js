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
import PropTypes from 'prop-types'
import { FormWithSchema } from '@ComponentsModule'
import { T } from '@ConstantsModule'
import { getFields, getSchema } from './schema'

export const STEP_ID = 'cluster'

const Content = ({ view }) => (
  <FormWithSchema id={STEP_ID} cy={`${STEP_ID}`} fields={getFields(view)} />
)

/**
 * Cluster configuration.
 *
 * @param {object} root0 - Step properties
 * @param {string} root0.view - Active FireEdge view
 * @returns {object} Cluster configuration step
 */
const Cluster = ({ view } = {}) => ({
  id: STEP_ID,
  label: view === 'cloud' ? 'Compute location' : T.SelectCluster,
  resolver: getSchema(view),
  optionsValidate: { abortEarly: false },
  content: () => <Content view={view} />,
})

Cluster.propTypes = {
  families: PropTypes.array,
  view: PropTypes.string,
}

Content.propTypes = {
  view: PropTypes.string,
}

export default Cluster
