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
import { Alert, Box, Button, Typography } from '@mui/material'
import { Archive, Plus } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import { DATASTORE_TYPES } from '@ConstantsModule'
import { DatastoreAPI } from '@FeaturesModule'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const BackupStorageWorkspace = () => {
  const history = useHistory()
  const query = DatastoreAPI.useGetDatastoresQuery()
  const stores = toArray(query.data).filter(
    ({ TYPE }) => +TYPE === DATASTORE_TYPES.BACKUP.id
  )

  return (
    <PageFrame
      title="Backup Storage"
      description="LayerSentry Backup Datastores used by VM backups and Backup Plans."
      actions={
        <Button
          variant="contained"
          startIcon={<Plus width={17} height={17} />}
          onClick={() => history.push('/infrastructure/backup-storage/create')}
          sx={{ textTransform: 'none' }}
        >
          Create Backup Storage
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
        <MetricCard
          label="Backup Datastores"
          value={query.isLoading ? '…' : stores.length}
          detail="Only TYPE=BACKUP_DS is counted"
          icon={Archive}
          accent={stores.length ? colors.status.success : colors.status.warning}
        />
        <MetricCard
          label="Supported backends"
          value="Restic / Rsync"
          detail="Or an explicitly qualified custom driver"
          icon={Archive}
        />
        <MetricCard
          label="Backup Plans"
          value={stores.length ? 'Ready' : 'Blocked'}
          detail={
            stores.length
              ? 'Backup Plans can select qualified storage'
              : 'Create backup storage before executing plans'
          }
          icon={Archive}
        />
      </Box>

      {!query.isLoading && stores.length === 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          No Backup Datastore is configured. Normal image, file and system
          datastores are intentionally excluded from this page because they
          cannot satisfy the Backup Job storage prerequisite.
        </Alert>
      )}

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Configured backup storage"
          description="Capacity and backend information for real LayerSentry Backup Datastores only."
        />
        <Box sx={{ display: 'grid', gap: 1 }}>
          {stores.map((store) => (
            <Box
              key={store.ID}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                  {store.NAME || `Backup Datastore ${store.ID}`}
                </Typography>
                <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                  {store.DS_MAD || store.TEMPLATE?.DS_MAD || 'Backup driver'} ·
                  ID {store.ID}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => history.push(`/datastore/${store.ID}`)}
                sx={{ textTransform: 'none' }}
              >
                Open details
              </Button>
            </Box>
          ))}
          {!query.isLoading && stores.length === 0 && (
            <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
              No Backup Datastore is available yet.
            </Typography>
          )}
        </Box>
      </Surface>
    </PageFrame>
  )
}

export default BackupStorageWorkspace
