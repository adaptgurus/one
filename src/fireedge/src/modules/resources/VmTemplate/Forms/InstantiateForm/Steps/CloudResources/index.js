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
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import PropTypes from 'prop-types'
import { useEffect, useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'

import { FormWithSchema } from '@ComponentsModule'
import { SCHEMA, SECTIONS } from './schema'

export const STEP_ID = 'resources'

const Content = ({ vmTemplate }) => {
  const { setValue, watch } = useFormContext()
  const values = watch(STEP_ID) ?? {}
  const advanced = Boolean(values.advancedOptions)
  const previousAdvanced = useRef(advanced)
  const [confirmReset, setConfirmReset] = useState(false)
  const storageIops = Number(values.storageIops ?? 5000)
  const networkSpeedMbps = Number(values.networkSpeedMbps ?? 500)
  const retainedAdvanced = Boolean(
    values.storageIopsEnabled ||
      values.networkQosEnabled ||
      storageIops !== 5000 ||
      networkSpeedMbps !== 500
  )

  useEffect(() => {
    if (previousAdvanced.current && !advanced && retainedAdvanced) {
      setConfirmReset(true)
    }
    previousAdvanced.current = advanced
  }, [advanced, retainedAdvanced])

  const resetAdvanced = () => {
    setValue(`${STEP_ID}.storageIopsEnabled`, false, { shouldDirty: true })
    setValue(`${STEP_ID}.storageIops`, 5000, { shouldDirty: true })
    setValue(`${STEP_ID}.networkQosEnabled`, false, { shouldDirty: true })
    setValue(`${STEP_ID}.networkSpeedMbps`, 500, { shouldDirty: true })
    setConfirmReset(false)
  }

  const keepAdvanced = () => {
    setConfirmReset(false)
  }

  return (
    <Stack gap={3} sx={{ maxWidth: 1040, width: '100%', mx: 'auto' }}>
      <div>
        <Typography variant="h5" fontWeight={700}>
          Storage and network
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          LayerSentry keeps device drivers, bus, filesystem, placement and
          provider network details under platform control.
        </Typography>
      </div>

      <Alert severity="info">
        The operating-system disk comes from the selected image and is managed
        automatically. Add only the extra data disk you need.
      </Alert>

      {SECTIONS(vmTemplate)
        .filter(({ advanced: advancedSection }) =>
          advancedSection ? advanced : true
        )
        .map(({ id, legend, fields }) => (
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

      {!advanced && retainedAdvanced && (
        <Alert severity="warning">
          Advanced storage or network settings are retained and will appear in
          the request. Enable Advanced options to review or change them.
        </Alert>
      )}

      <Alert severity="info">
        SR-IOV, PCI passthrough and other network implementation details are
        inherited from the selected provider network. Network QoS is off unless
        you explicitly enable a speed limit.
      </Alert>
      <Dialog open={confirmReset} disableEscapeKeyDown>
        <DialogTitle>Keep advanced settings?</DialogTitle>
        <DialogContent>
          You entered non-default storage or network tuning. Choose whether to
          keep it in this VM request or reset it to safe defaults.
        </DialogContent>
        <DialogActions>
          <Button onClick={resetAdvanced}>Reset to defaults</Button>
          <Button variant="contained" onClick={keepAdvanced}>
            Keep advanced settings
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

Content.propTypes = {
  vmTemplate: PropTypes.object,
}

/**
 * @param root0
 * @param root0.vmTemplate
 */
/**
 * @param {object} root0 - Step properties
 * @param {object} root0.vmTemplate - Source VM template
 * @returns {object} LayerSentry resource step
 */
const CloudResources = ({ vmTemplate }) => ({
  id: STEP_ID,
  label: 'Resources',
  resolver: () => SCHEMA(vmTemplate),
  optionsValidate: { abortEarly: false },
  content: () => <Content vmTemplate={vmTemplate} />,
})

export default CloudResources
