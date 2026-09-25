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
import PropTypes from 'prop-types'
import { useFormContext } from 'react-hook-form'
import { object } from 'yup'
import { useAuth, VnAPI } from '@FeaturesModule'

export const STEP_ID = 'review'

const ReviewRow = ({ label, value }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 1fr) 2fr' },
      gap: 1,
      py: 0.75,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  >
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={650}>
      {value || '—'}
    </Typography>
  </Box>
)

ReviewRow.propTypes = { label: PropTypes.string, value: PropTypes.node }

const Content = ({ vmTemplate }) => {
  const { watch } = useFormContext()
  const form = watch() ?? {}
  const general = form.general ?? {}
  const access = form.access ?? {}
  const resources = form.resources ?? {}
  const services = form.services ?? {}
  const gpu = services.LAYERSENTRY_GPU_REQUEST ?? {}
  const { user, groups = [] } = useAuth()
  const { data: networks = [] } = VnAPI.useGetVNetworksQuery()
  const projectName = groups.find(({ ID }) => `${ID}` === `${user?.GID}`)?.NAME
  const selectedNetwork = networks.find(
    ({ ID }) => `${ID}` === `${resources.networkId}`
  )
  const advanced = [
    resources.storageIopsEnabled && `Storage ${resources.storageIops} IOPS`,
    resources.networkQosEnabled && `Network ${resources.networkSpeedMbps} Mbps`,
  ].filter(Boolean)

  return (
    <Stack gap={2} sx={{ maxWidth: 900, width: '100%', mx: 'auto' }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Review and create
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Confirm the request below. Secrets and private key material are never
          displayed in this summary.
        </Typography>
      </Box>

      <Box>
        <ReviewRow label="VM name" value={general.name} />
        <ReviewRow
          label="Project"
          value={projectName ?? `Group #${user?.GID ?? 'current'}`}
        />
        <ReviewRow label="Environment" value={general.environment} />
        <ReviewRow label="Workload tier" value={general.workloadTier} />
        <ReviewRow label="Image / blueprint" value={vmTemplate?.NAME} />
        <ReviewRow label="Instances" value={String(general.instances ?? 1)} />
        <ReviewRow label="vCPU" value={String(general.VCPU ?? '—')} />
        <ReviewRow
          label="Memory"
          value={general.MEMORY ? `${general.MEMORY} MiB` : '—'}
        />
        <ReviewRow label="Guest user" value={access.username} />
        <ReviewRow
          label="SSH access"
          value={access.useAccountKey ? 'Account key enabled' : 'Not requested'}
        />
        <ReviewRow
          label="Additional disk"
          value={
            resources.dataDiskEnabled
              ? `${resources.dataDiskSizeGb} GiB`
              : 'None'
          }
        />
        <ReviewRow
          label="Network"
          value={
            selectedNetwork
              ? `${selectedNetwork.NAME} (#${selectedNetwork.ID})`
              : resources.networkId
          }
        />
        <ReviewRow
          label="Network environment"
          value={selectedNetwork?.TEMPLATE?.LAYERSENTRY_ENVIRONMENT}
        />
        <ReviewRow
          label="IP assignment"
          value={
            resources.ipAssignment === 'STATIC'
              ? `Static ${resources.staticIp}`
              : 'Automatic'
          }
        />
        <ReviewRow
          label="Protection"
          value={
            [
              services.backupEnabled &&
                `Backup (${services.restorePoints ?? 7} restore points)`,
              services.drEnabled && 'DR requested',
            ]
              .filter(Boolean)
              .join(', ') || 'None'
          }
        />
        <ReviewRow
          label="GPU"
          value={
            gpu.PROFILE_ID ? `${gpu.PROFILE_ID} × ${gpu.COUNT ?? 1}` : 'None'
          }
        />
      </Box>

      {advanced.length > 0 && (
        <Alert severity="warning">
          Non-default advanced settings:{' '}
          {advanced.map((setting) => (
            <Chip key={setting} size="small" label={setting} sx={{ ml: 1 }} />
          ))}
        </Alert>
      )}
      <Alert severity="info">
        Create submits one typed request. Success is shown only after the native
        provider accepts it; final infrastructure state remains authoritative.
      </Alert>
    </Stack>
  )
}

Content.propTypes = { vmTemplate: PropTypes.object }

/**
 * @param root0
 * @param root0.vmTemplate
 */
const CloudReview = ({ vmTemplate }) => ({
  id: STEP_ID,
  label: 'Review',
  resolver: () => object().default({}),
  content: () => <Content vmTemplate={vmTemplate} />,
})

export default CloudReview
