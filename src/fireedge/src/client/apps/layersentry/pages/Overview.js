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
import { Box, Typography } from '@mui/material'
import {
  Archive,
  HardDrive,
  NetworkAlt,
  Plus,
  Server,
  XrayView,
} from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import {
  BackupJobAPI,
  DatastoreAPI,
  OneKsAPI,
  VmAPI,
  VnAPI,
  useViews,
} from '@FeaturesModule'
import { colors } from 'client/apps/layersentry/theme/tokens'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  MetricCard,
  PageFrame,
  PrimaryButton,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'

const count = (query) => {
  if (query.isLoading || query.isFetching) return '…'
  if (query.isError) return '—'

  return Array.isArray(query.data) ? query.data.length : 0
}

const Overview = () => {
  const history = useHistory()
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const vms = VmAPI.useGetVmsQuery({ extended: false })
  const kubernetes = OneKsAPI.useGetOneKsClustersQuery()
  const networks = VnAPI.useGetVNetworksQuery()
  const backups = BackupJobAPI.useGetBackupJobsQuery()
  const storage = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: !isAdmin,
  })

  return (
    <PageFrame
      title="Overview"
      description="Your cloud resources, health and recent operating context in one place."
      actions={
        <PrimaryButton
          startIcon={<Plus width={18} height={18} />}
          onClick={() => history.push(PRODUCT_PATHS.COMPUTE_CREATE)}
        >
          Create VM
        </PrimaryButton>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2,1fr)',
            xl: 'repeat(5,1fr)',
          },
          gap: 2,
          mt: 3,
        }}
      >
        <MetricCard
          label="Virtual Machines"
          value={count(vms)}
          detail="Compute instances visible to this role"
          icon={Server}
        />
        <MetricCard
          label="Kubernetes"
          value={count(kubernetes)}
          detail="Managed clusters"
          icon={XrayView}
          accent={colors.kubernetes}
        />
        <MetricCard
          label="Networks"
          value={count(networks)}
          detail="Networks available to this project"
          icon={NetworkAlt}
          accent={colors.network}
        />
        <MetricCard
          label="Backup Plans"
          value={count(backups)}
          detail="Protection jobs"
          icon={Archive}
          accent={colors.status.warning}
        />
        <MetricCard
          label={isAdmin ? 'Storage Pools' : 'Storage'}
          value={isAdmin ? count(storage) : 'View'}
          detail={
            isAdmin
              ? 'Platform storage pools'
              : 'Open storage and attached disks'
          }
          icon={HardDrive}
          accent={colors.storage}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.35fr 0.65fr' },
          gap: 2,
          mt: 2,
        }}
      >
        <Surface sx={{ p: 2.5 }}>
          <SectionHeader
            title="What needs attention"
            description="Live resource queries; provider internals remain hidden for customer roles."
          />
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            {[
              [
                'Compute',
                vms,
                'Virtual machines are reachable through the Compute workspace.',
              ],
              [
                'Kubernetes',
                kubernetes,
                'Cluster lifecycle is managed by OneKS.',
              ],
              [
                'Protection',
                backups,
                'Backup status is available in Protection.',
              ],
            ].map(([label, query, healthyText]) => (
              <Box
                key={label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  py: 1.25,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: colors.text.primary,
                    }}
                  >
                    {label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: colors.text.secondary,
                      mt: 0.25,
                    }}
                  >
                    {query.isError
                      ? 'Some data could not be loaded. Open the workspace for details.'
                      : healthyText}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: query.isError
                      ? colors.status.warning
                      : colors.status.success,
                  }}
                >
                  {query.isError
                    ? 'Check'
                    : query.isFetching
                    ? 'Refreshing'
                    : 'Available'}
                </Typography>
              </Box>
            ))}
          </Box>
        </Surface>

        <Surface sx={{ p: 2.5 }}>
          <SectionHeader
            title="Quick actions"
            description="Common tasks without provider terminology."
          />
          <Box sx={{ display: 'grid', gap: 1 }}>
            {[
              ['Create a virtual machine', PRODUCT_PATHS.COMPUTE_CREATE],
              ['Create Kubernetes cluster', PRODUCT_PATHS.KUBERNETES_CREATE],
              ['Open storage', PRODUCT_PATHS.STORAGE],
              ['Manage firewall rules', PRODUCT_PATHS.SECURITY],
              ['Check protection', PRODUCT_PATHS.PROTECTION],
            ].map(([label, path]) => (
              <PrimaryButton
                key={path}
                variant="outlined"
                onClick={() => history.push(path)}
                sx={{
                  justifyContent: 'flex-start',
                  backgroundColor: colors.surface,
                  color: colors.text.primary,
                  border: `1px solid ${colors.border}`,
                  '&:hover': { backgroundColor: colors.surfaceAlt },
                }}
              >
                {label}
              </PrimaryButton>
            ))}
          </Box>
        </Surface>
      </Box>
    </PageFrame>
  )
}

export default Overview
