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
import { useEffect, useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { DatastoreAPI, useViews } from '@FeaturesModule'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const isBackupDatastore = (datastore = {}) =>
  String(datastore?.TYPE) === '3' ||
  String(datastore?.TYPE_STRING ?? '')
    .toLowerCase()
    .includes('backup')

const ProtectionWorkspace = ({ endpoints, initialTab = 0 }) => {
  const history = useHistory()
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const capabilityModel = getCapabilityModel()
  const canCreateBackupPlan = isCapabilityEnabled(
    CAPABILITY_IDS.BACKUP_RECOVERY_CREATE,
    capabilityModel
  )
  const canViewBackupStorage = isCapabilityVisible(
    CAPABILITY_IDS.BACKUP_STORAGE,
    capabilityModel
  )
  const [tab, setTab] = useState(initialTab)
  const datastoresQuery = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: !isAdmin,
  })
  const datastores = Array.isArray(datastoresQuery.data)
    ? datastoresQuery.data
    : datastoresQuery.data
    ? [datastoresQuery.data]
    : []
  const backupDatastores = useMemo(
    () => datastores.filter(isBackupDatastore),
    [datastores]
  )

  useEffect(() => setTab(initialTab), [initialTab])

  return (
    <PageFrame
      title="Protection"
      description="Backup plans, recovery points and restores using the native OpenNebula protection lifecycle."
      actions={
        isAdmin &&
        canViewBackupStorage &&
        !datastoresQuery.isLoading &&
        backupDatastores.length === 0 ? (
          <Button
            variant="contained"
            onClick={() => history.push(PRODUCT_PATHS.INFRA_BACKUP_STORAGE)}
            sx={{ textTransform: 'none' }}
          >
            Configure backup storage
          </Button>
        ) : canCreateBackupPlan ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push('/protection/create')}
            sx={{ textTransform: 'none' }}
          >
            Create backup plan
          </Button>
        ) : null
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
      {isAdmin && backupDatastores.length === 0 && !datastoresQuery.isLoading && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            isAdmin && canViewBackupStorage ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => history.push(PRODUCT_PATHS.INFRA_BACKUP_STORAGE)}
              >
                Configure backup storage
              </Button>
            ) : undefined
          }
        >
          No OpenNebula Backup Datastore is configured. Backup Plans and restore
          require qualified backup storage such as Restic or Rsync before they
          can execute successfully.
        </Alert>
      )}
      {!isAdmin && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Backup storage is provider-managed. Your Backup Plan form will show
          only storage targets that OpenNebula authorizes for your account.
        </Alert>
      )}
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
  initialTab: PropTypes.number,
}
ProtectionWorkspace.defaultProps = { endpoints: [] }
export default ProtectionWorkspace
