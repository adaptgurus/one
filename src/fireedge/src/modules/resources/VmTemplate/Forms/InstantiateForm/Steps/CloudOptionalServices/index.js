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
import { Alert, Stack, Typography } from '@mui/material'
import PropTypes from 'prop-types'

import { FormWithSchema } from '@ComponentsModule'
import { SCHEMA, SECTIONS } from './schema'

export const STEP_ID = 'services'

const Content = ({ vmTemplate }) => (
  <Stack gap={3} sx={{ maxWidth: 1040, width: '100%', mx: 'auto' }}>
    <div>
      <Typography variant="h5" fontWeight={700}>
        Protection and optional services
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        Request only the services this VM needs. LayerSentry keeps provider
        hardware, retention internals and DR network implementation hidden.
      </Typography>
    </div>

    {SECTIONS(vmTemplate).map(({ id, legend, fields }) => (
      <FormWithSchema
        key={id}
        id={STEP_ID}
        cy={`layersentry-${id}`}
        fields={fields}
        legend={legend}
        saveState
        gridContainerSx={{ width: '100%', margin: 0 }}
      />
    ))}

    <Alert severity="info">
      Backup and DR are request-based until the protection backend validates the
      policy and reports it active. GPU choices are limited to
      provider-published profiles.
    </Alert>
  </Stack>
)

Content.propTypes = { vmTemplate: PropTypes.object }

/**
 * @param {object} root0 - Step properties
 * @param {object} root0.vmTemplate - Source VM template
 * @returns {object} LayerSentry optional-service step
 */
const CloudOptionalServices = ({ vmTemplate }) => ({
  id: STEP_ID,
  label: 'Protection',
  resolver: () => SCHEMA(vmTemplate),
  optionsValidate: { abortEarly: false },
  content: () => <Content vmTemplate={vmTemplate} />,
})

export default CloudOptionalServices
