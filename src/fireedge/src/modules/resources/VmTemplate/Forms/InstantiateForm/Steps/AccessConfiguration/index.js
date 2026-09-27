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
import { Alert, Box, Chip, Stack, Typography } from '@mui/material'
import PropTypes from 'prop-types'

import { FormWithSchema } from '@ComponentsModule'
import { getLayerSentryGuestOsFamily } from '@UtilsModule'
import { FIELDS, SCHEMA } from './schema'

export const STEP_ID = 'access'

const Content = ({ vmTemplate }) => {
  const windows = getLayerSentryGuestOsFamily(vmTemplate) === 'WINDOWS'

  return (
    <Stack gap={3} sx={{ maxWidth: 960, width: '100%', mx: 'auto' }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Guest access
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {windows
            ? 'Configure the Windows Administrator account for first boot. Linux-only SSH controls are hidden.'
            : 'Configure root access for first boot using an account SSH key, an additional public key, or a qualified root password.'}
        </Typography>
      </Box>

      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label="KVM" size="small" />
        <Chip label="x86_64" size="small" />
        <Chip label={windows ? 'Windows' : 'Linux'} size="small" />
        <Chip label="VirtIO network" size="small" />
        <Chip label="Automatic hostname" size="small" />
        <Chip label="Grow root filesystem" size="small" />
      </Stack>

      <Alert severity="info">
        Network contextualization, hostname assignment, disk growth, and VirtIO
        networking are enforced as LayerSentry provisioning defaults. Secrets
        are never displayed in Review.
      </Alert>

      <FormWithSchema
        id={STEP_ID}
        cy="layersentry-vm-access"
        fields={FIELDS(vmTemplate)}
        saveState
        gridContainerSx={{ width: '100%', margin: 0 }}
      />
    </Stack>
  )
}

Content.propTypes = { vmTemplate: PropTypes.object }

/**
 * Build the OS-specific customer access step.
 *
 * @param {object} root0 - Step inputs
 * @param {object} root0.vmTemplate - Authoritative source VM template
 * @returns {object} Form-step definition
 */
const AccessConfiguration = ({ vmTemplate }) => ({
  id: STEP_ID,
  label: 'Access',
  resolver: () => SCHEMA(vmTemplate),
  optionsValidate: { abortEarly: false },
  content: () => <Content vmTemplate={vmTemplate} />,
})

AccessConfiguration.propTypes = { vmTemplate: PropTypes.object }

export default AccessConfiguration
