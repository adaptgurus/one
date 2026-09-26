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
  LinearProgress,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Plus } from 'iconoir-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { BackupJobAPI, DatastoreAPI, ImageAPI, useViews } from '@FeaturesModule'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const BACKUP_PLAN_CATALOG_API = '/api/v1/backup-plans'

const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
    ? value
    : [value]

const hasIds = (value) => toArray(value?.ID).length > 0

const getBackupPlanState = ({
  BACKING_UP_VMS,
  ERROR_VMS,
  LAST_BACKUP_TIME,
  OUTDATED_VMS,
} = {}) => {
  if (hasIds(ERROR_VMS)) return 'Error'
  if (hasIds(BACKING_UP_VMS)) return 'Running'
  if (!LAST_BACKUP_TIME || String(LAST_BACKUP_TIME) === '0')
    return 'Not started'
  if (hasIds(OUTDATED_VMS)) return 'Completed · attention needed'

  return 'Completed'
}

const countBackupVms = (plan = {}) =>
  String(plan?.TEMPLATE?.BACKUP_VMS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean).length

const formatLastBackup = (value) => {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Never'

  return new Date(timestamp).toLocaleString()
}

const formatBackupSize = (value) => {
  const sizeMb = Number(value)
  if (!Number.isFinite(sizeMb) || sizeMb <= 0) return 'Size unavailable'

  return `${Math.max(1, Math.ceil(sizeMb / 1024))} GB`
}

const formatPlanInterval = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return 'Schedule unavailable'
  if (value % 86400 === 0) {
    const days = value / 86400

    return `Every ${days} day${days === 1 ? '' : 's'}`
  }
  if (value % 3600 === 0) {
    const hours = value / 3600

    return `Every ${hours} hour${hours === 1 ? '' : 's'}`
  }

  const minutes = Math.max(1, Math.round(value / 60))

  return `Every ${minutes} minute${minutes === 1 ? '' : 's'}`
}

const BackupPlanCatalogInventory = () => {
  const [catalog, setCatalog] = useState({
    status: 'loading',
    items: [],
    error: '',
  })

  useEffect(() => {
    let active = true

    fetch(BACKUP_PLAN_CATALOG_API, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('catalog unavailable')

        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const responseData = payload?.data ?? payload
        const items = Array.isArray(responseData?.items)
          ? responseData.items
          : []

        setCatalog({ status: 'ready', items, error: '' })
      })
      .catch(() => {
        if (!active) return
        setCatalog({
          status: 'error',
          items: [],
          error:
            'Could not load the LayerSentry backup-plan catalog. The control plane or backup-storage configuration may be unavailable.',
        })
      })

    return () => {
      active = false
    }
  }, [])

  if (catalog.status === 'loading') return <LinearProgress />

  if (catalog.status === 'error') {
    return <Alert severity="error">{catalog.error}</Alert>
  }

  if (catalog.items.length === 0) {
    return (
      <Alert severity="warning">
        No LayerSentry plan templates are configured. Configure qualified Backup
        Storage before assigning a protection plan.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-backup-plan-catalog
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' },
        gap: 1,
      }}
    >
      {catalog.items.map((plan) => (
        <Box
          key={plan.id}
          data-layersentry-backup-plan-template={plan.id}
          sx={{
            p: 1.5,
            border: `1px solid ${colors.border}`,
            borderRadius: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            {plan.name}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}>
            {formatPlanInterval(plan.intervalSeconds)} · Backup Storage #
            {plan.sourceBackupDatastoreId}
          </Typography>
          <Typography
            sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
          >
            Retention: {plan.sourceSnapshotsPerVm} source /{' '}
            {plan.recoverySnapshotsPerVm} recovery points ·{' '}
            {plan.incrementMode || 'qualified backend'}
          </Typography>
          <Typography
            sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
          >
            {plan.enabled
              ? 'Available for assignment'
              : 'Disabled by administrator'}
            {plan.system ? ' · LayerSentry preset' : ' · Custom plan'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

const NativeBackupJobInventory = () => {
  const query = BackupJobAPI.useGetBackupJobsQuery()
  const plans = toArray(query.data)

  if (query.isLoading || query.isFetching) return <LinearProgress />

  if (query.isError) {
    return (
      <Alert severity="error">
        Could not load native backup jobs from the LayerSentry backup provider.
      </Alert>
    )
  }

  if (plans.length === 0) {
    return (
      <Alert severity="info">
        No native backup jobs are assigned yet. The plan templates above remain
        available for selection.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-readonly-backup-plan-inventory
      sx={{ display: 'grid', gap: 1 }}
    >
      {plans.map((plan) => (
        <Box
          key={plan.ID ?? plan.NAME}
          sx={{
            p: 1.5,
            border: `1px solid ${colors.border}`,
            borderRadius: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            {plan.NAME ?? `Backup job ${plan.ID}`}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}>
            #{plan.ID} · {getBackupPlanState(plan)} · {countBackupVms(plan)} VM
            {countBackupVms(plan) === 1 ? '' : 's'}
          </Typography>
          <Typography
            sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
          >
            Last backup: {formatLastBackup(plan.LAST_BACKUP_TIME)}
            {plan.PRIORITY ? ` · Priority ${plan.PRIORITY}` : ''}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

const RecoveryPointInventory = () => {
  const query = ImageAPI.useGetBackupsQuery()
  const backups = toArray(query.data)

  if (query.isLoading || query.isFetching) return <LinearProgress />

  if (query.isError) {
    return (
      <Alert severity="error">
        Could not load recovery points from the LayerSentry API.
      </Alert>
    )
  }

  if (backups.length === 0) {
    return (
      <Alert severity="info">
        No recovery points are visible to this account.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-readonly-recovery-point-inventory
      sx={{ display: 'grid', gap: 1 }}
    >
      {backups.map((backup) => {
        const increments = toArray(backup?.BACKUP_INCREMENTS?.INCREMENT)

        return (
          <Box
            key={backup.ID ?? backup.NAME}
            sx={{
              p: 1.5,
              border: `1px solid ${colors.border}`,
              borderRadius: 1.5,
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
              {backup.NAME ?? `Recovery point ${backup.ID}`}
            </Typography>
            <Typography
              sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}
            >
              #{backup.ID} · {formatBackupSize(backup.SIZE)} ·{' '}
              {increments.length} increment
              {increments.length === 1 ? '' : 's'}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

const isBackupDatastore = (datastore = {}) =>
  String(datastore?.TYPE) === '3' ||
  String(datastore?.TYPE_STRING ?? '')
    .toLowerCase()
    .includes('backup')

const ProtectionWorkspace = ({ endpoints, initialTab = 0 }) => {
  const history = useHistory()
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const capabilityModel = getCapabilityModel(endpoints)
  const canCreateBackupPlan = isCapabilityEnabled(
    CAPABILITY_IDS.BACKUP_RECOVERY_CREATE,
    capabilityModel
  )
  const canConfigureBackupStorage = isCapabilityEnabled(
    CAPABILITY_IDS.BACKUP_STORAGE_CREATE,
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
      description="LayerSentry plan templates, native backup jobs and recovery points; execution and restore remain capability-gated."
      actions={
        isAdmin &&
        canConfigureBackupStorage &&
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
            canConfigureBackupStorage ? (
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
          No LayerSentry backup storage is configured. Backup Plans and restore
          require qualified backup storage such as Restic or Rsync before they
          can execute successfully.
        </Alert>
      )}
      {!isAdmin && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Backup storage is provider-managed. Your Backup Plan form will show
          only storage targets that LayerSentry authorizes for your account.
        </Alert>
      )}
      <Alert severity="info" sx={{ mt: 2 }}>
        LayerSentry does not promise an RPO/RTO that the configured backend has
        not qualified. Restore targets and retention behavior remain subject to
        native backend capability.
      </Alert>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="Backup Plans" />
        <Tab label="Recovery Points" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 ? (
          <Box>
            <Typography sx={{ mb: 1, fontSize: 12, fontWeight: 800 }}>
              Pre-baked plan templates
            </Typography>
            <BackupPlanCatalogInventory />
            <Typography sx={{ mt: 2.5, mb: 1, fontSize: 12, fontWeight: 800 }}>
              Native backup jobs
            </Typography>
            <NativeBackupJobInventory />
          </Box>
        ) : (
          <RecoveryPointInventory />
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
