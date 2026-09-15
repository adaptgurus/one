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
import { Alert, Box, Button, Tab, Tabs, Typography } from '@mui/material'
import { Plus } from 'iconoir-react'
import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const ProtectionWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)

  return (
    <PageFrame
      title="Protection"
      description="Backup plans, recovery points and restores using the native OpenNebula protection lifecycle."
      actions={
        <Button
          variant="contained"
          startIcon={<Plus width={17} height={17} />}
          onClick={() => history.push('/protection/create')}
          sx={{ textTransform: 'none' }}
        >
          Create backup plan
        </Button>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
          mt: 2,
        }}
      >
        {[
          ['Snapshot', 'Fast point-in-time state tied to its source resource.'],
          ['Backup', 'Independent protection copy managed by a backup plan.'],
          ['Restore', 'Recover from an existing qualified backup or snapshot.'],
        ].map(([title, description]) => (
          <Surface key={title} sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
              {title}
            </Typography>
            <Typography
              sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
            >
              {description}
            </Typography>
          </Surface>
        ))}
      </Box>
      <Alert severity="info" sx={{ mt: 2 }}>
        LayerSentry does not promise an RPO/RTO that the configured backend has
        not qualified. Restore targets and retention behavior remain subject to
        native backend capability.
      </Alert>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="Backup Plans" />
        <Tab label="Backups & Restore" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/backupjobs" />
        )}
        {tab === 1 && (
          <ResourceBridge endpoints={endpoints} legacyPath="/backup" />
        )}
      </Surface>
    </PageFrame>
  )
}

ProtectionWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
ProtectionWorkspace.defaultProps = { endpoints: [] }
export default ProtectionWorkspace
