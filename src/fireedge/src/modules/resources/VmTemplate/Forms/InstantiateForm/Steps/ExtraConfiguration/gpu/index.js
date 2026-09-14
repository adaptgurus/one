/* LayerSentry self-service GPU request. SPDX-License-Identifier: Apache-2.0 */
import { Alert, Box } from '@mui/material'
import { Cpu as GpuIcon } from 'iconoir-react'
import PropTypes from 'prop-types'
import { useEffect, useMemo } from 'react'

import { FormWithSchema } from '@ComponentsModule'
import { useGeneralApi } from '@FeaturesModule'
import { getPublishedGpuProfiles } from '@UtilsModule'
import { STEP_ID as EXTRA_ID } from '@modules/resources/VmTemplate/Forms/CreateForm/Steps/ExtraConfiguration'
import { FIELDS } from './schema'

const Gpu = ({ vmTemplate }) => {
  const { setFieldPath } = useGeneralApi()
  const profiles = useMemo(
    () => getPublishedGpuProfiles(vmTemplate?.TEMPLATE),
    [vmTemplate]
  )

  useEffect(() => {
    setFieldPath('extra.LayerSentryGpu')
  }, [])

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Select only a provider-published GPU profile. OpenNebula schedules a
        compatible GPU; physical Host names and PCI addresses are intentionally
        not exposed to self-service users.
      </Alert>
      <FormWithSchema
        id={EXTRA_ID}
        cy="extra-gpu"
        saveState={true}
        fields={FIELDS(profiles)}
        legend="GPU acceleration"
      />
    </Box>
  )
}

Gpu.propTypes = { vmTemplate: PropTypes.object }

/** Native extra-configuration tab descriptor. */
export default {
  id: 'gpu',
  name: 'GPU',
  icon: GpuIcon,
  Content: Gpu,
  isVisible: ({ vmTemplate }) =>
    getPublishedGpuProfiles(vmTemplate?.TEMPLATE).length > 0,
  getError: (error) => !!error?.LAYERSENTRY_GPU_REQUEST,
}
