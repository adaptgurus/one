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
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { ControlPlaneAPI } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const OperationsWorkspace = ({ endpoints }) => {
  const [tab, setTab] = useState(0)
  const operationsQuery = ControlPlaneAPI.useGetControlPlaneOperationsQuery(
    { limit: 100 },
    { pollingInterval: tab === 1 ? 5000 : 0, skip: tab !== 1 }
  )
  const operations = Array.isArray(operationsQuery.data?.operations)
    ? operationsQuery.data.operations
    : []
  const [approveOperation, approval] =
    ControlPlaneAPI.useApproveControlPlaneOperationMutation()

  return (
    <PageFrame
      title="Operations"
      description="Health, alerts, events, tasks and audit visibility for resources available to your role."
    >
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="Health & Alerts" />
        <Tab label="Durable Operations" />
        <Tab label="Support" />
        <Tab label="Audit" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/attention" />
        )}
        {tab === 1 && (
          <Box sx={{ p: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 750, mb: 1 }}>
              Durable operations
            </Typography>
            {operationsQuery.isLoading && <LinearProgress />}
            {operationsQuery.isError && (
              <Alert severity="warning">
                The dedicated LayerSentry operation service is unavailable.
                Native infrastructure state remains visible, but no operation
                state is fabricated.
              </Alert>
            )}
            {approval.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Approval was not accepted. Sign in with a freshly verified
                second factor and retry; policy and ownership checks still
                apply.
              </Alert>
            )}
            {!operationsQuery.isLoading &&
              !operationsQuery.isError &&
              operations.length === 0 && (
                <Alert severity="info">
                  No durable operations are recorded for this tenant.
                </Alert>
              )}
            <Box sx={{ display: 'grid', gap: 1 }}>
              {operations.map((operation) => (
                <Box
                  key={operation.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: '2fr 1fr auto auto',
                    },
                    gap: 1,
                    alignItems: 'center',
                    p: 1.5,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                      {operation.action || 'Operation'} ·{' '}
                      {operation.resource?.kind || 'Resource'}{' '}
                      {operation.resource?.id || 'unknown'}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                      {operation.id} · updated{' '}
                      {operation.updated_at
                        ? new Date(operation.updated_at).toLocaleString()
                        : 'time unavailable'}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{ fontSize: 12, color: colors.text.secondary }}
                  >
                    Completed {Number(operation.current_step || 0)} of{' '}
                    {operation.plan?.steps?.length || '—'} steps
                  </Typography>
                  <Chip
                    size="small"
                    label={operation.state || 'UNKNOWN'}
                    color={
                      operation.state === 'SUCCEEDED'
                        ? 'success'
                        : operation.state === 'FAILED' ||
                          operation.state === 'BLOCKED'
                        ? 'error'
                        : 'default'
                    }
                  />
                  {operation.state === 'AWAITING_APPROVAL' &&
                    operation.plan_hash && (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={approval.isLoading}
                        onClick={() =>
                          approveOperation({
                            id: operation.id,
                            planHash: operation.plan_hash,
                          })
                        }
                      >
                        Approve with MFA
                      </Button>
                    )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {tab === 2 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/support" />
        )}
        {tab === 3 && (
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
