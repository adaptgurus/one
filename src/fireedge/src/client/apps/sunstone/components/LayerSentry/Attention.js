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
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Typography,
} from '@mui/material'
import { useMemo } from 'react'
import { Link as RouterLink, Redirect } from 'react-router-dom'

import { BackupJobAPI, OneKsAPI, VmAPI, useViews } from '@FeaturesModule'
import { getVirtualMachineState, getVirtualOneKsState } from '@ModelsModule'
import { buildAttentionItems } from './attention'

const severityColor = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

const unwrapOneKs = (resource) => resource?.DOCUMENT ?? resource ?? {}

/**
 * Read-only customer attention center backed by existing native APIs.
 *
 * @returns {object} React element
 */
const Attention = () => {
  const { view } = useViews()
  const vmQuery = VmAPI.useGetVmsQuery({ extended: true })
  const backupQuery = BackupJobAPI.useGetBackupJobsQuery()
  const oneKsQuery = OneKsAPI.useGetOneKsClustersQuery()

  const items = useMemo(
    () =>
      buildAttentionItems({
        vms: (vmQuery.data ?? []).map((resource) => ({
          resource,
          stateName: getVirtualMachineState(resource)?.name,
        })),
        backupJobs: backupQuery.data ?? [],
        clusters: (oneKsQuery.data ?? []).map((entry) => {
          const resource = unwrapOneKs(entry)

          return {
            resource,
            stateName: getVirtualOneKsState(resource)?.name,
          }
        }),
      }),
    [vmQuery.data, backupQuery.data, oneKsQuery.data]
  )

  if (view !== 'cloud') return <Redirect to="/dashboard" />

  const isLoading =
    vmQuery.isLoading || backupQuery.isLoading || oneKsQuery.isLoading
  const queryFailures = [
    vmQuery.isError && 'virtual machines',
    backupQuery.isError && 'backup jobs',
    oneKsQuery.isError && 'Kubernetes clusters',
  ].filter(Boolean)

  const refresh = () => {
    vmQuery.refetch?.()
    backupQuery.refetch?.()
    oneKsQuery.refetch?.()
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1180, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', sm: 'row' },
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Alerts & attention
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Current conditions observed from your OpenNebula and OneKS
            resources.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={refresh} disabled={isLoading}>
          Refresh
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        This page is read-only. Opening or reading an item does not acknowledge,
        recover, retry, or change the underlying resource. Email/webhook delivery
        is not connected by this page.
      </Alert>

      {queryFailures.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not load {queryFailures.join(', ')}. The list below may be
          incomplete.
        </Alert>
      )}

      {isLoading && !items.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress aria-label="Loading attention items" />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6">No current native alerts</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            No failed VM state, backup-job error/outdated member, OneKS
            warning/failure, or requested-but-not-active LayerSentry protection
            plan was observed.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {items.map((item) => (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr auto' },
                gap: 1.5,
                alignItems: 'center',
              }}
            >
              <Chip
                size="small"
                color={severityColor[item.severity] ?? 'default'}
                label={item.severity.toUpperCase()}
              />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {item.kind}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.detail}
                </Typography>
              </Box>
              <Button component={RouterLink} to={item.path} size="small">
                Review
              </Button>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  )
}

export default Attention
