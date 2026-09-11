/* SPDX-License-Identifier: Apache-2.0 */
import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import { Box, Button, Paper, ThemeProvider, createTheme } from '@mui/material'

import {
  AppearanceSwitch,
  LayerSentryLogo,
  SelfServiceAppearance,
} from '../../../src/client/apps/sunstone/components/LayerSentry'
import { buildAttentionItems } from '../../../src/client/apps/sunstone/components/LayerSentry/attention'
import { normalizeProtectionRequest } from '../../../src/modules/utils/layersentryProtection'
import {
  getPublishedGpuProfiles,
  resolvePublishedGpuRequest,
} from '../../../src/modules/utils/layersentryGpu'

const publishedGpuTemplate = {
  LAYERSENTRY_GPU_PROFILES: [
    {
      ID: 'l40s-2b',
      LABEL: 'NVIDIA L40S 2B',
      CLASS: '0302',
      VENDOR: '10de',
      DEVICE: '26b9',
      PROFILE: '1146 (NVIDIA L40S-2B)',
      MAX_COUNT: '2',
      SHORT_ADDRESS: '81:00.0',
    },
  ],
}

const protectionEvidence = normalizeProtectionRequest({
  ENABLED: true,
  DC_RETENTION_POINTS: 7,
  DR_ENABLED: true,
  DR_RETENTION_POINTS: 30,
  DR_VLAN_ID: 220,
})
const gpuProfiles = getPublishedGpuProfiles(publishedGpuTemplate)
const gpuEvidence = resolvePublishedGpuRequest(
  { PROFILE_ID: 'l40s-2b', COUNT: 2 },
  publishedGpuTemplate
)
const attentionEvidence = buildAttentionItems({
  vms: [
    {
      resource: { ID: '42', NAME: 'failed-vm' },
      stateName: 'FAILED',
    },
  ],
  backupJobs: [
    {
      ID: '5',
      NAME: 'nightly',
      OUTDATED_VMS: { ID: ['42'] },
    },
  ],
})

window.__LAYERSENTRY_BROWSER_EVIDENCE__ = {
  protectionEvidence,
  gpuProfiles,
  gpuEvidence,
  attentionEvidence,
}

const Harness = () => {
  const [appearance, setAppearance] = useState(true)
  const [mode, setMode] = useState('light')
  const [draft, setDraft] = useState('')
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode])

  return (
    <ThemeProvider theme={theme}>
      <SelfServiceAppearance enabled={appearance}>
        <Box sx={{ p: 2, maxWidth: 760, mx: 'auto' }}>
          <LayerSentryLogo withText />
          <Box sx={{ display: 'flex', gap: 1, my: 2, flexWrap: 'wrap' }}>
            <AppearanceSwitch
              enabled={appearance}
              expanded
              onToggle={() => setAppearance((value) => !value)}
            />
            <button
              id="theme-toggle"
              type="button"
              onClick={() =>
                setMode((value) => (value === 'light' ? 'dark' : 'light'))
              }
            >
              Toggle theme
            </button>
          </Box>
          <input
            id="draft-input"
            aria-label="Draft field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Paper id="ls-paper" variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Button id="mui-primary" variant="contained" color="primary">
              Native action
            </Button>
          </Paper>
          <div id="attention-first">{attentionEvidence[0]?.severity}</div>
          <div id="attention-second">{attentionEvidence[1]?.severity}</div>
          <pre id="protection-json">{JSON.stringify(protectionEvidence)}</pre>
          <pre id="gpu-json">{JSON.stringify(gpuEvidence)}</pre>
        </Box>
      </SelfServiceAppearance>
    </ThemeProvider>
  )
}

ReactDOM.render(<Harness />, document.getElementById('root'))
