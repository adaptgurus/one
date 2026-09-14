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

import { FormWithSchema } from '@ComponentsModule'
import { FIELDS, SCHEMA } from './schema'

export const STEP_ID = 'access'

const Content = () => (
  <Stack gap={3} sx={{ maxWidth: 960, width: '100%', mx: 'auto' }}>
    <Box>
      <Typography variant="h5" fontWeight={700}>
        Guest access
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        Set the Linux login that LayerSentry will inject when this VM first
        boots. Password and SSH key are both optional, but at least one access
        method is recommended.
      </Typography>
    </Box>

    <Stack direction="row" gap={1} flexWrap="wrap">
      <Chip label="KVM" size="small" />
      <Chip label="x86_64" size="small" />
      <Chip label="QCOW2" size="small" />
      <Chip label="VirtIO network" size="small" />
      <Chip label="Automatic hostname" size="small" />
      <Chip label="Grow root filesystem" size="small" />
    </Stack>

    <Alert severity="info">
      Network contextualization, hostname assignment, root-filesystem growth,
      and VirtIO networking are enforced as LayerSentry provisioning defaults.
    </Alert>

    <FormWithSchema
      id={STEP_ID}
      cy="layersentry-vm-access"
      fields={FIELDS}
      saveState
      gridContainerSx={{ width: '100%', margin: 0 }}
    />
  </Stack>
)

const AccessConfiguration = () => ({
  id: STEP_ID,
  label: 'Access',
  resolver: () => SCHEMA,
  optionsValidate: { abortEarly: false },
  content: Content,
})

export default AccessConfiguration
