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
/* eslint-disable jsdoc/require-jsdoc */
import PropTypes from 'prop-types'
import { Alert, Box, Tab, Tabs, Typography } from '@mui/material'
import { useState } from 'react'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const OperationsWorkspace = ({ endpoints }) => {
  const [tab, setTab] = useState(0)

  return (
    <PageFrame
      title="Operations"
      description="Health, alerts, events, tasks and audit visibility for resources available to your role."
    >
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="Health & Alerts" />
        <Tab label="Support" />
        <Tab label="Audit" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/attention" />
        )}
        {tab === 1 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/support" />
        )}
        {tab === 2 && (
          <Box sx={{ p: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 750, mb: 1 }}>
              Audit trail
            </Typography>
            <Alert severity="info">
              Resource events remain authoritative in LayerSentry and OneKS. A
              global audit API is not exposed by the current FireEdge backend,
              so LayerSentry does not invent audit records. Resource-specific
              event tabs remain available from their detail pages.
            </Alert>
            <Typography
              sx={{ mt: 2, fontSize: 12, color: colors.text.secondary }}
            >
              Audit entries will include actor, operation, resource, timestamp,
              result and reference ID when the backend global audit endpoint is
              added.
            </Typography>
          </Box>
        )}
      </Surface>
    </PageFrame>
  )
}

OperationsWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
OperationsWorkspace.defaultProps = { endpoints: [] }
export default OperationsWorkspace
