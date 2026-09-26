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

const backupDatastoreLabel = (datastore = {}) =>
  `${datastore.NAME ?? `Backup Storage ${datastore.ID}`} (#${datastore.ID})`

const BackupPlanCatalogInventory = ({ backupDatastores, canManagePlans }) => {
  const [catalog, setCatalog] = useState({
    status: 'loading',
    items: [],
    error: '',
    editable: false,
    customAllowed: false,
    allowedDatastoreIds: [],
  })
  const [datastoreDrafts, setDatastoreDrafts] = useState({})
  const [cloneDrafts, setCloneDrafts] = useState({})
  const [mutation, setMutation] = useState({
    key: '',
    error: '',
    success: '',
  })

  const loadCatalog = useCallback(async () => {
    setCatalog((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const response = await fetch(BACKUP_PLAN_CATALOG_API, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json().catch(() => ({}))
      const responseData = payload?.data ?? payload
      if (!response.ok) {
        throw new Error(
          responseData?.error || 'The backup-plan catalog is unavailable.'
        )
      }
      const items = Array.isArray(responseData?.items) ? responseData.items : []

      setCatalog({
        status: 'ready',
        items,
        error: '',
        editable: responseData?.editable === true,
        customAllowed: responseData?.customAllowed === true,
        allowedDatastoreIds: Array.isArray(responseData?.allowedDatastoreIds)
          ? responseData.allowedDatastoreIds
          : [],
      })
      setDatastoreDrafts((current) => {
        const next = { ...current }
        items.forEach((plan) => {
          if (next[plan.id] === undefined) {
            next[plan.id] =
              Number(plan.sourceBackupDatastoreId) >= 0
                ? String(plan.sourceBackupDatastoreId)
                : ''
          }
        })

        return next
      })
    } catch (error) {
      setCatalog((current) => ({
        ...current,
        status: 'error',
        items: [],
        error:
          error?.message ||
          'Could not load the LayerSentry backup-plan catalog.',
      }))
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const postCatalogMutation = async (key, action, body, success) => {
    setMutation({ key, error: '', success: '' })
    try {
      const response = await fetch(`${BACKUP_PLAN_CATALOG_API}/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      const responseData = payload?.data ?? payload
      if (!response.ok) {
        throw new Error(
          responseData?.error || 'The backup-plan update was rejected.'
        )
      }

      await loadCatalog()
      setMutation({ key: '', error: '', success })

      return responseData
    } catch (error) {
      setMutation({
        key: '',
        error: error?.message || 'The backup-plan update failed.',
        success: '',
      })

      return null
    }
  }

  const saveDatastore = async (plan) => {
    const datastoreId = Number(datastoreDrafts[plan.id])
    if (!Number.isInteger(datastoreId) || datastoreId < 0) return

    await postCatalogMutation(
      `datastore:${plan.id}`,
      'datastore',
      {
        planId: plan.id,
        version: plan.version,
        sourceBackupDatastoreId: datastoreId,
      },
      `${plan.name} now uses Backup Storage #${datastoreId}.`
    )
  }

  const openClone = (plan) => {
    setCloneDrafts((current) => ({
      ...current,
      [plan.id]: {
        open: true,
        name: `${plan.name} Copy`,
        sourceBackupDatastoreId: String(
          datastoreDrafts[plan.id] ??
            (Number(plan.sourceBackupDatastoreId) >= 0
              ? plan.sourceBackupDatastoreId
              : '')
        ),
      },
    }))
  }

  const updateCloneDraft = (planId, change) => {
    setCloneDrafts((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        ...change,
      },
    }))
  }

  const clonePlan = async (plan) => {
    const draft = cloneDrafts[plan.id] ?? {}
    const name = String(draft.name ?? '').trim()
    const datastoreId = Number(draft.sourceBackupDatastoreId)
    if (!name || !Number.isInteger(datastoreId) || datastoreId < 0) {
      setMutation({
        key: '',
        error: 'Clone name and Backup Storage are required.',
        success: '',
      })

      return
    }

    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `clone-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const result = await postCatalogMutation(
      `clone:${plan.id}`,
      'clone',
      {
        sourcePlanId: plan.id,
        name,
        sourceBackupDatastoreId: datastoreId,
        requestId,
      },
      `${name} was cloned from ${plan.name}.`
    )
    if (result) {
      updateCloneDraft(plan.id, { open: false })
    }
  }

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

  const allowMutations = catalog.editable === true && canManagePlans === true
  const allowedDatastoreIds = new Set(
    (catalog.allowedDatastoreIds ?? []).map((id) => String(id))
  )
  const qualifiedDatastores =
    allowedDatastoreIds.size > 0
      ? backupDatastores.filter((datastore) =>
          allowedDatastoreIds.has(String(datastore.ID))
        )
      : backupDatastores

  return (
    <Box>
      {mutation.error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {mutation.error}
        </Alert>
      )}
      {mutation.success && (
        <Alert severity="success" sx={{ mb: 1 }}>
          {mutation.success}
        </Alert>
      )}
      {allowMutations && qualifiedDatastores.length === 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          No qualified Backup Storage is available for plan selection or
          cloning.
        </Alert>
      )}
      <Box
        data-layersentry-backup-plan-catalog
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' },
          gap: 1,
        }}
      >
        {catalog.items.map((plan) => {
          const selectedDatastore = String(
            datastoreDrafts[plan.id] ??
              (Number(plan.sourceBackupDatastoreId) >= 0
                ? plan.sourceBackupDatastoreId
                : '')
          )
          const currentDatastoreVisible = qualifiedDatastores.some(
            (datastore) =>
              String(datastore.ID) === String(plan.sourceBackupDatastoreId)
          )
          const cloneDraft = cloneDrafts[plan.id] ?? {}
          const busyDatastore = mutation.key === `datastore:${plan.id}`
          const busyClone = mutation.key === `clone:${plan.id}`

          return (
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
              <Typography
                sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}
              >
                {formatPlanInterval(plan.intervalSeconds)} ·{' '}
                {Number(plan.sourceBackupDatastoreId) >= 0
                  ? `Backup Storage #${plan.sourceBackupDatastoreId}`
                  : 'Backup Storage not assigned'}
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
                {plan.clonedFromPlanId
                  ? ` · cloned from ${plan.clonedFromPlanId}`
                  : ''}
              </Typography>

              {allowMutations && (
                <>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Backup Storage"
                    data-layersentry-backup-datastore-select={plan.id}
                    value={selectedDatastore}
                    onChange={(event) =>
                      setDatastoreDrafts((current) => ({
                        ...current,
                        [plan.id]: event.target.value,
                      }))
                    }
                    sx={{ mt: 1.25 }}
                  >
                    <MenuItem value="" disabled>
                      Choose Backup Storage
                    </MenuItem>
                    {!currentDatastoreVisible &&
                      Number(plan.sourceBackupDatastoreId) >= 0 && (
                        <MenuItem
                          value={String(plan.sourceBackupDatastoreId)}
                          disabled
                        >
                          {`Current #${plan.sourceBackupDatastoreId} (not available)`}
                        </MenuItem>
                      )}
                    {qualifiedDatastores.map((datastore) => (
                      <MenuItem key={datastore.ID} value={String(datastore.ID)}>
                        {backupDatastoreLabel(datastore)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                      mt: 1,
                    }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={
                        busyDatastore ||
                        qualifiedDatastores.length === 0 ||
                        selectedDatastore === '' ||
                        selectedDatastore ===
                          String(plan.sourceBackupDatastoreId)
                      }
                      onClick={() => saveDatastore(plan)}
                    >
                      {busyDatastore ? 'Saving…' : 'Save datastore'}
                    </Button>
                    {catalog.customAllowed && (
                      <Button
                        size="small"
                        variant="outlined"
                        data-layersentry-clone-backup-plan={plan.id}
                        disabled={busyClone || qualifiedDatastores.length === 0}
                        onClick={() => openClone(plan)}
                      >
                        Clone plan
                      </Button>
                    )}
                  </Box>

                  {cloneDraft.open && (
                    <Box
                      data-layersentry-backup-plan-clone-form={plan.id}
                      sx={{ mt: 1.25 }}
                    >
                      <TextField
                        fullWidth
                        size="small"
                        label="Clone name"
                        value={cloneDraft.name ?? ''}
                        inputProps={{ maxLength: 191 }}
                        onChange={(event) =>
                          updateCloneDraft(plan.id, {
                            name: event.target.value,
                          })
                        }
                      />
                      <TextField
                        select
                        fullWidth
                        size="small"
                        label="Clone Backup Storage"
                        value={String(
                          cloneDraft.sourceBackupDatastoreId ??
                            (Number(plan.sourceBackupDatastoreId) >= 0
                              ? plan.sourceBackupDatastoreId
                              : '')
                        )}
                        onChange={(event) =>
                          updateCloneDraft(plan.id, {
                            sourceBackupDatastoreId: event.target.value,
                          })
                        }
                        sx={{ mt: 1 }}
                      >
                        <MenuItem value="" disabled>
                          Choose Backup Storage
                        </MenuItem>
                        {qualifiedDatastores.map((datastore) => (
                          <MenuItem
                            key={datastore.ID}
                            value={String(datastore.ID)}
                          >
                            {backupDatastoreLabel(datastore)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={
                            busyClone ||
                            !String(cloneDraft.name ?? '').trim() ||
                            qualifiedDatastores.length === 0
                          }
                          onClick={() => clonePlan(plan)}
                        >
                          {busyClone ? 'Cloning…' : 'Create clone'}
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            updateCloneDraft(plan.id, { open: false })
                          }
                        >
                          Cancel
                        </Button>
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

BackupPlanCatalogInventory.propTypes = {
  backupDatastores: PropTypes.arrayOf(PropTypes.object),
  canManagePlans: PropTypes.bool,
}
BackupPlanCatalogInventory.defaultProps = {
  backupDatastores: [],
  canManagePlans: false,
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
        qualifiedDatastores.length === 0 ? (
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
      {isAdmin && qualifiedDatastores.length === 0 && !datastoresQuery.isLoading && (
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
            <BackupPlanCatalogInventory
              backupDatastores={backupDatastores}
              canManagePlans={isAdmin && canCreateBackupPlan}
            />
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
