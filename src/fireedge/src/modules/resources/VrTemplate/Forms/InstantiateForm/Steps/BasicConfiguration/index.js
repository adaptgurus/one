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
import {
  getSchema,
  getFields,
} from '@modules/resources/VrTemplate/Forms/InstantiateForm/Steps/BasicConfiguration/informationSchema'
import { T } from '@ConstantsModule'

export const STEP_ID = 'general'

const Content = ({ view }) => (
  <FormWithSchema
    key={STEP_ID}
    cy={STEP_ID}
    fields={getFields(view)}
    saveState={true}
    id={STEP_ID}
  />
)

/**
 * Basic configuration about VR Template.
 *
 * @param {object} root0 - Step properties
 * @param {string} root0.view - Active FireEdge view
 * @returns {object} Basic configuration step
 */
const BasicConfiguration = ({ view } = {}) => ({
  id: STEP_ID,
  label: T.Configuration,
  resolver: getSchema(view),
  optionsValidate: { abortEarly: false },
  content: () => <Content view={view} />,
})

Content.propTypes = { view: PropTypes.string }

BasicConfiguration.propTypes = { view: PropTypes.string }

export default BasicConfiguration
