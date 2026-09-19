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

const ApplicationsWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const canDeploy = isCapabilityEnabled(
    CAPABILITY_IDS.APPLICATIONS_DEPLOY,
    getCapabilityModel()
  )

  return (
    <PageFrame
      title="Applications"
      description="Browse published services while OneFlow remains the lifecycle authority."
      actions={
        canDeploy ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push('/applications/deploy')}
            sx={{ textTransform: 'none' }}
          >
            Deploy application
          </Button>
        ) : null
      }
    >
      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Application model"
          description="Catalog definitions describe the service. Deployments are the running application instances."
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {[
            ['Catalog', 'Published OneFlow service templates'],
            ['Deployments', 'Running service instances'],
            [
              'Lifecycle',
              'Day-2 actions appear only after separate production qualification',
            ],
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
