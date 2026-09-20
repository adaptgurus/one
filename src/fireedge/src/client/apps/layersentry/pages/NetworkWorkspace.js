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
import { Plus } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { VnAPI } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const ENVIRONMENTS = [
  { name: 'Production', prefix: 'prod' },
  { name: 'UAT', prefix: 'uat' },
  { name: 'Development', prefix: 'dev' },
  { name: 'Stage', prefix: 'stage' },
]
const TIERS = ['web', 'app', 'db']

const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
    ? value
    : [value]

const NetworkInventory = () => {
  const query = VnAPI.useGetVNetworksQuery()
  const networks = toArray(query.data)

  if (query.isLoading || query.isFetching) return <LinearProgress />

  if (query.isError) {
    return (
      <Alert severity="error">
        Could not load networks from the OpenNebula API.
      </Alert>
    )
  }

  if (networks.length === 0) {
    return (
      <Alert severity="info">No workload networks are visible to this account.</Alert>
    )
  }

  return (
    <Box data-layersentry-readonly-network-inventory sx={{ display: 'grid', gap: 1 }}>
      {networks.map((network) => {
        const ranges = toArray(network?.AR_POOL?.AR)
        const allocatedLeases = ranges.reduce(
          (total, range) => total + toArray(range?.LEASES?.LEASE).length,
          0
        )

        return (
          <Box
            key={network.ID ?? network.NAME}
            sx={{
              p: 1.5,
              border: `1px solid ${colors.border}`,
              borderRadius: 1.5,
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
              {network.NAME ?? `Network ${network.ID}`}
            </Typography>
            <Typography sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}>
              #{network.ID} · {ranges.length} address range
              {ranges.length === 1 ? '' : 's'} · {allocatedLeases} allocated lease
              {allocatedLeases === 1 ? '' : 's'}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

const NetworkWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const capabilityModel = getCapabilityModel(endpoints)
  const canCreate = isCapabilityEnabled(
    CAPABILITY_IDS.NETWORK_CREATE,
    capabilityModel
  )
  const canViewFirewall = isCapabilityVisible(
    CAPABILITY_IDS.FIREWALL_RULES,
    capabilityModel
  )
  const canViewBlueprints = isCapabilityVisible(
    CAPABILITY_IDS.NETWORK_TEMPLATES,
    capabilityModel
  )
  const canViewRouters = isCapabilityVisible(
    CAPABILITY_IDS.VIRTUAL_ROUTERS,
    capabilityModel
  )

  const tabs = useMemo(
    () =>
      [
        { label: 'Networks', kind: 'inventory' },
        canViewFirewall && {
          label: 'Firewall Rules',
          kind: 'bridge',
          legacyPath: '/security-group',
        },
        canViewBlueprints && {
          label: 'Network Blueprints',
          kind: 'bridge',
          legacyPath: '/network-template',
        },
        canViewRouters && {
          label: 'Virtual Routers',
          kind: 'bridge',
          legacyPath: '/vrouter',
        },
      ].filter(Boolean),
    [canViewBlueprints, canViewFirewall, canViewRouters]
  )
  const safeTab = Math.min(tab, Math.max(0, tabs.length - 1))
  const activeTab = tabs[safeTab]

  return (
    <PageFrame
      title="Network"
      description="Browse workload networks while mutation-heavy firewall, blueprint and router surfaces remain separately qualified."
      actions={
        canCreate ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push('/network/create')}
            sx={{ textTransform: 'none' }}
          >
            Create network
          </Button>
        ) : null
      }
    >
      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Environment network pattern"
          description="Use separate Web, App and Database networks for each environment. Isolation is enforced by the selected backend network and firewall policy, not by the display name."
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 1.5,
          }}
        >
          {ENVIRONMENTS.map(({ name, prefix }) => (
            <Box
              key={prefix}
              sx={{
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750, mb: 1 }}>
                {name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {TIERS.map((tier) => (
                  <Chip
                    key={tier}
                    size="small"
                    label={`${prefix}_${tier}_network`}
                    sx={{ fontSize: 11, backgroundColor: colors.surfaceAlt }}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Surface>

      <Tabs
        value={safeTab}
        onChange={(_, value) => setTab(value)}
        sx={{ mt: 2 }}
      >
        {tabs.map(({ label }) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {activeTab?.kind === 'inventory' ? (
          <NetworkInventory />
        ) : (
          activeTab?.legacyPath && (
            <ResourceBridge
              endpoints={endpoints}
              legacyPath={activeTab.legacyPath}
            />
          )
        )}
      </Surface>
    </PageFrame>
  )
}

NetworkWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
NetworkWorkspace.defaultProps = { endpoints: [] }
export default NetworkWorkspace
