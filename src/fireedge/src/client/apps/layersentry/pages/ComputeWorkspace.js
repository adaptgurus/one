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
import { Box, Button, Typography } from '@mui/material'
import { Plus, Server } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import { VmAPI } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

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

  return (
    <PageFrame
      title="Compute"
      description="Create and operate virtual machines without exposing provider host, datastore or placement internals."
      actions={
        <Button
          variant="contained"
          startIcon={<Plus width={17} height={17} />}
          onClick={() => history.push(PRODUCT_PATHS.COMPUTE_CREATE)}
          sx={{ textTransform: 'none' }}
        >
          Create VM
        </Button>
      }
    >
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
          value={query.isLoading ? '…' : vms.length}
          icon={Server}
        />
        <MetricCard
          label="Running"
          value={query.isLoading ? '…' : running}
          detail="OpenNebula ACTIVE state"
          icon={Server}
          accent={colors.status.success}
        />
        <MetricCard
          label="Allocated vCPU"
          value={query.isLoading ? '…' : totalCpu || '—'}
          detail="Across visible VMs"
          icon={Server}
        />
        <MetricCard
          label="Allocated Memory"
          value={
            query.isLoading
              ? '…'
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
          title="Virtual machines"
          description="Power, console, snapshots, resize, networking and disk operations remain backed by OpenNebula authorization."
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
          Use the Storage workspace to create or attach persistent data disks.
          Detach preserves the disk image; permanent deletion is a separate
          confirmed action.
        </Typography>
      </Surface>
    </PageFrame>
  )
}

ComputeWorkspace.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
ComputeWorkspace.defaultProps = { endpoints: [] }
export default ComputeWorkspace
