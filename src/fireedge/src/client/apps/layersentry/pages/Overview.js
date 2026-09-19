/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may    *
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
import { Box, Typography } from '@mui/material'
import {
  Archive,
  HardDrive,
  NetworkAlt,
  Plus,
  Packages,
  Server,
  XrayView,
} from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import {
  BackupJobAPI,
  DatastoreAPI,
  OneKsAPI,
  ServiceAPI,
  VmAPI,
  VnAPI,
  useViews,
} from '@FeaturesModule'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
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

const Overview = ({ endpoints }) => {
  const history = useHistory()
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const capabilityModel = getCapabilityModel(endpoints)

  const canViewCompute = isCapabilityVisible(
    CAPABILITY_IDS.COMPUTE,
    capabilityModel
  )
  const canCreateVm = isCapabilityEnabled(
    CAPABILITY_IDS.VM_CREATE,
    capabilityModel
  )
  const canViewKubernetes = isCapabilityVisible(
    CAPABILITY_IDS.KUBERNETES,
    capabilityModel
  )
  const canCreateKubernetes = isCapabilityEnabled(
    CAPABILITY_IDS.KUBERNETES_CREATE,
    capabilityModel
  )
  const canViewNetwork = isCapabilityVisible(
    CAPABILITY_IDS.NETWORK,
    capabilityModel
  )
  const canViewApplications = isCapabilityVisible(
    CAPABILITY_IDS.APPLICATIONS_ONEFLOW,
    capabilityModel
  )
  const canDeployApplication = isCapabilityEnabled(
    CAPABILITY_IDS.APPLICATIONS_DEPLOY,
    capabilityModel
  )
  const canViewProtection = isCapabilityVisible(
    CAPABILITY_IDS.BACKUP_RECOVERY,
    capabilityModel
  )
  const canViewStorage = isCapabilityVisible(
    CAPABILITY_IDS.STORAGE,
    capabilityModel
  )
  const canViewAdminStorage =
    isAdmin &&
    isCapabilityVisible(CAPABILITY_IDS.INFRA_STORAGE, capabilityModel)
  const canViewFirewallRules = isCapabilityVisible(
    CAPABILITY_IDS.FIREWALL_RULES,
    capabilityModel
  )

  const vms = VmAPI.useGetVmsQuery(
    { extended: false },
    { skip: !canViewCompute }
  )
  const kubernetes = OneKsAPI.useGetOneKsClustersQuery(undefined, {
    skip: !canViewKubernetes,
  })
  const networks = VnAPI.useGetVNetworksQuery(undefined, {
    skip: !canViewNetwork,
  })
  const applications = ServiceAPI.useGetServicesQuery(undefined, {
    skip: !canViewApplications,
  })
  const backups = BackupJobAPI.useGetBackupJobsQuery(undefined, {
    skip: !canViewProtection,
  })
  const storage = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: !canViewAdminStorage,
  })

  const storageMetric = isAdmin
    ? canViewAdminStorage && {
        label: 'Storage Pools',
        value: count(storage),
        detail: 'Platform storage pools',
        icon: HardDrive,
        accent: colors.storage,
      }
    : canViewStorage && {
        label: 'Storage',
        value: 'View',
        detail: 'Open storage and attached disks',
        icon: HardDrive,
        accent: colors.storage,
      }

  const metrics = [
    canViewCompute && {
      label: 'Virtual Machines',
      value: count(vms),
      detail: 'Compute instances visible to this role',
      icon: Server,
    },
    canViewKubernetes && {
      label: 'Kubernetes',
      value: count(kubernetes),
      detail: 'Managed clusters',
      icon: XrayView,
      accent: colors.kubernetes,
    },
    canViewNetwork && {
      label: 'Networks',
      value: count(networks),
      detail: 'Networks available to this project',
      icon: NetworkAlt,
      accent: colors.network,
    },
    canViewProtection && {
      label: 'Backup Plans',
      value: count(backups),
      detail: 'Protection jobs',
      icon: Archive,
      accent: colors.status.warning,
    },
    canViewApplications && {
      label: 'Applications',
      value: count(applications),
      detail: 'OneFlow deployments',
      icon: Packages,
      accent: colors.brand.accent,
    },
    storageMetric,
  ].filter(Boolean)

  const attentionItems = [
    canViewCompute && [
      'Compute',
      vms,
      'Virtual machines are reachable through the Compute workspace.',
    ],
    canViewKubernetes && [
      'Kubernetes',
      kubernetes,
      'Cluster lifecycle is managed by OneKS.',
    ],
    canViewProtection && [
      'Protection',
      backups,
      'Backup status is available in Protection.',
    ],
  ].filter(Boolean)

  const quickActions = [
    {
      label: 'Create a virtual machine',
      path: PRODUCT_PATHS.COMPUTE_CREATE,
      available: canCreateVm,
    },
    {
      label: 'Create Kubernetes cluster',
      path: PRODUCT_PATHS.KUBERNETES_CREATE,
      available: canCreateKubernetes,
    },
    {
      label: 'Deploy application',
      path: PRODUCT_PATHS.APPLICATIONS_DEPLOY,
      available: canDeployApplication,
    },
    {
      label: 'Open storage',
      path: PRODUCT_PATHS.STORAGE,
      available: canViewStorage,
    },
    {
      label: 'Manage firewall rules',
      path: PRODUCT_PATHS.SECURITY,
      available: canViewFirewallRules,
    },
    {
      label: 'Check protection',
      path: PRODUCT_PATHS.PROTECTION,
      available: canViewProtection,
    },
  ].filter(({ available }) => available)

  return (
    <PageFrame
      title="Overview"
      description="Your cloud resources, health and recent operating context in one place."
      actions={
        canCreateVm ? (
          <PrimaryButton
            startIcon={<Plus width={18} height={18} />}
            onClick={() => history.push(PRODUCT_PATHS.COMPUTE_CREATE)}
          >
            Create VM
          </PrimaryButton>
        ) : undefined
      }
    >
      {metrics.length > 0 ? (
        <Box
          data-layersentry-overview-metrics
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2,1fr)',
              xl: 'repeat(6,1fr)',
            },
            gap: 2,
            mt: 3,
          }}
        >
          {metrics.map(({ label, ...metric }) => (
            <MetricCard key={label} label={label} {...metric} />
          ))}
        </Box>
      ) : (
        <Surface data-layersentry-overview-empty-metrics sx={{ mt: 3, p: 2.5 }}>
          <Typography sx={{ fontSize: 13, color: colors.text.secondary }}>
            No resource summaries are currently available for this deployment.
          </Typography>
        </Surface>
      )}

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
          <Box
            data-layersentry-overview-attention
            sx={{ display: 'grid', gap: 1.25 }}
          >
            {attentionItems.length > 0 ? (
              attentionItems.map(([label, query, healthyText]) => (
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
              ))
            ) : (
              <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
                No qualified services are currently reporting status here.
              </Typography>
            )}
          </Box>
        </Surface>

        <Surface sx={{ p: 2.5 }}>
          <SectionHeader
            title="Quick actions"
            description="Common tasks without provider terminology."
          />
          <Box
            data-layersentry-overview-actions
            sx={{ display: 'grid', gap: 1 }}
          >
            {quickActions.length > 0 ? (
              quickActions.map(({ label, path }) => (
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
              ))
            ) : (
              <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
                No actions are currently available for this deployment.
              </Typography>
            )}
          </Box>
        </Surface>
      </Box>
    </PageFrame>
  )
}

Overview.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
Overview.defaultProps = { endpoints: [] }

export default Overview
