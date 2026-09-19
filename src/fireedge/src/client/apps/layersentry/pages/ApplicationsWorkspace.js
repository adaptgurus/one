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
import { Box, Button, Tab, Tabs, Typography } from '@mui/material'
import { Plus } from 'iconoir-react'
import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const ApplicationsWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)

  return (
    <PageFrame
      title="Applications"
      description="Deploy and operate qualified production services while OneFlow remains the lifecycle authority."
      actions={
        <Button
          variant="contained"
          startIcon={<Plus width={17} height={17} />}
          onClick={() => history.push('/applications/deploy')}
          sx={{ textTransform: 'none' }}
        >
          Create Production Service
        </Button>
      }
    >
      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Production service blueprints"
          description="LayerSentry guides application sizing, VM footprint, dependencies, storage, DNS, HA, backup, DR, security and offline package access. Exact deployable tuples remain qualification-controlled."
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {[
            ['Catalog', 'Published and qualification-gated service blueprints'],
            ['Deployments', 'Running OneFlow-backed service instances'],
            ['Safe lifecycle', 'Validate, revise, recover and remove through authoritative backends'],
          ].map(([title, description]) => (
            <Box
              key={title}
              sx={{
                flex: '1 1 220px',
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                {title}
              </Typography>
              <Typography
                sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
              >
                {description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Surface>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="My Applications" />
        <Tab label="Application Catalog" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/service" />
        )}
        {tab === 1 && (
          <ResourceBridge
            endpoints={endpoints}
            legacyPath="/service-template"
          />
        )}
      </Surface>
    </PageFrame>
  )
}

ApplicationsWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
ApplicationsWorkspace.defaultProps = { endpoints: [] }
export default ApplicationsWorkspace
