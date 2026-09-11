/* LayerSentry self-service protection request. SPDX-License-Identifier: Apache-2.0 */
import { Alert, Box } from '@mui/material'
import { RefreshDouble as ProtectionIcon } from 'iconoir-react'
import { useEffect } from 'react'

import { FormWithSchema } from '@ComponentsModule'
import { useGeneralApi } from '@FeaturesModule'
import {
  STEP_ID as EXTRA_ID,
  TabType,
} from '@modules/resources/VmTemplate/Forms/CreateForm/Steps/ExtraConfiguration'
import { FIELDS } from './schema'

const Protection = () => {
  const { setFieldPath } = useGeneralApi()

  useEffect(() => {
    setFieldPath('extra.LayerSentryProtection')
  }, [])

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        These values are saved as a requested protection plan. They do not
        activate DR, reserve an IP/VLAN, or prove that a recovery point exists.
        The effective policy appears only after the protection backend validates
        and activates it.
      </Alert>
      <FormWithSchema
        id={EXTRA_ID}
        cy="extra-protection"
        saveState={true}
        fields={FIELDS}
        legend="Backup and disaster recovery request"
      />
    </Box>
  )
}

/** @type {TabType} */
export default {
  id: 'protection',
  name: 'Backup & DR',
  icon: ProtectionIcon,
  Content: Protection,
  getError: (error) => !!error?.LAYERSENTRY_PROTECTION,
}
