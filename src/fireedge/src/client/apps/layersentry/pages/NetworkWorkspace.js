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
import { Box, Button, Chip, Tab, Tabs, Typography } from '@mui/material'
import { Plus } from 'iconoir-react'
import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
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

const NetworkWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const canCreate = isCapabilityEnabled(
    CAPABILITY_IDS.NETWORK_CREATE,
    getCapabilityModel(endpoints)
  )

  return (
    <PageFrame
      title="Network"
      description="Browse workload networks and firewall policy while OpenNebula remains the network authority."
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

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="Networks" />
        <Tab label="Firewall Rules" />
        <Tab label="Network Blueprints" />
        <Tab label="Virtual Routers" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/virtual-network" />
        )}
        {tab === 1 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/security-group" />
        )}
        {tab === 2 && (
          <ResourceBridge
            endpoints={endpoints}
            legacyPath="/network-template"
          />
        )}
        {tab === 3 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/vrouter" />
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
