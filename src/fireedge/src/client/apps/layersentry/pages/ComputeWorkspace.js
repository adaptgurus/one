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
import { Alert, Box, Button, Typography } from '@mui/material'
import { HardDrive, NetworkAlt, Packages, Plus, Server } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import { VmAPI } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const COMPUTE_QUICK_ACTIONS = [
  {
    label: 'Create VM',
    path: PRODUCT_PATHS.COMPUTE_CREATE,
    icon: Plus,
    primary: true,
    capability: CAPABILITY_IDS.VM_CREATE,
  },
  {
    label: 'VM Blueprints',
    path: PRODUCT_PATHS.COMPUTE_BLUEPRINTS,
    icon: Packages,
  },
  {
    label: 'Affinity Groups',
    path: PRODUCT_PATHS.COMPUTE_AFFINITY,
    icon: Server,
  },
  { label: 'Disk Images', path: PRODUCT_PATHS.STORAGE_IMAGES, icon: HardDrive },
  { label: 'Networks', path: PRODUCT_PATHS.NETWORK, icon: NetworkAlt },
]

const ComputeWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const query = VmAPI.useGetVmsQuery({ extended: true })
  const vms = toArray(query.data)
  const running = vms.filter(({ STATE }) => String(STATE) === '3').length
  const totalCpu = vms.reduce(
    (sum, vm) => sum + Number(vm?.TEMPLATE?.CPU ?? vm?.TEMPLATE?.VCPU ?? 0),
    0
  )
  const totalMemoryMb = vms.reduce(
    (sum, vm) => sum + Number(vm?.TEMPLATE?.MEMORY ?? 0),
    0
  )
  const capabilityModel = getCapabilityModel()
  const canCreateVm = isCapabilityVisible(
    CAPABILITY_IDS.VM_CREATE,
    capabilityModel
  )
  const quickActions = COMPUTE_QUICK_ACTIONS.filter(
    ({ capability }) =>
      !capability || isCapabilityVisible(capability, capabilityModel)
  )

  return (
    <PageFrame
      title="Compute"
      description="View virtual machines through the OpenNebula API. Mutating actions appear only after their production path is qualified."
      actions={
        canCreateVm ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push(PRODUCT_PATHS.COMPUTE_CREATE)}
            sx={{ textTransform: 'none' }}
          >
            Create VM
          </Button>
        ) : null
      }
    >
      {query.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Compute summary could not be loaded. The inventory below contains its
          own API error state so the LayerSentry shell remains usable.
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 1.5,
          mt: 2,
        }}
      >
        <MetricCard
          label="Virtual Machines"
          value={query.isLoading ? '…' : query.isError ? '—' : vms.length}
          icon={Server}
        />
        <MetricCard
          label="Running"
          value={query.isLoading ? '…' : query.isError ? '—' : running}
          detail="OpenNebula ACTIVE state"
          icon={Server}
          accent={colors.status.success}
        />
        <MetricCard
          label="Allocated vCPU"
          value={query.isLoading ? '…' : query.isError ? '—' : totalCpu || '—'}
          detail="Across visible VMs"
          icon={Server}
        />
        <MetricCard
          label="Allocated Memory"
          value={
            query.isLoading || query.isError
              ? query.isLoading
                ? '…'
                : '—'
              : totalMemoryMb
              ? `${Math.round(totalMemoryMb / 1024)} GB`
              : '—'
          }
          detail="Across visible VMs"
          icon={Server}
          accent={colors.brand.accent}
        />
      </Box>

      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Compute actions"
          description="Only qualified actions are shown. Unqualified create and Day-2 operations stay hidden rather than presenting a working-looking control."
        />
        <Box
          data-layersentry-compute-actions
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(5, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {quickActions.map(({ label, path, icon: Icon, primary }) => (
            <Button
              key={path}
              variant={primary ? 'contained' : 'outlined'}
              startIcon={<Icon width={17} height={17} />}
              onClick={() => history.push(path)}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                minHeight: 42,
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Surface>

      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Virtual machines"
          description="Read-only authoritative inventory. OpenNebula remains authoritative for power, console, resize, disk, network, snapshot, backup and delete operations. VM Day-2 controls remain hidden until each mutation path has API, readback, RBAC and recovery evidence."
        />
        <ResourceBridge endpoints={endpoints} legacyPath="/vm" />
      </Surface>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
          Storage safety
        </Typography>
        <Typography
          sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
        >
          Use the Storage workspace only for qualified persistent-disk actions.
          Detach preserves the disk image; permanent deletion remains a separate
          confirmed action.
        </Typography>
      </Surface>
    </PageFrame>
  )
}

ComputeWorkspace.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
ComputeWorkspace.defaultProps = { endpoints: [] }
export default ComputeWorkspace
