/* LayerSentry DBaaS customer page. SPDX-License-Identifier: Apache-2.0 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Redirect } from 'react-router-dom'

import { OneKsAPI, useViews } from '@FeaturesModule'

const API_ROOT = '/fireedge/api/layersentry/dbaas'
const TRANSITIONAL_PHASES = new Set([
  'Pending',
  'Provisioning',
  'Scaling',
  'Resizing',
  'Upgrading',
  'BackingUp',
  'Restoring',
  'Deleting',
  'Unknown',
])
const ENGINE_LABELS = {
  postgresql: 'PostgreSQL',
  pxc: 'MySQL compatible (PXC)',
  psmdb: 'MongoDB compatible (PSMDB)',
}
const EMPTY_RECOVERY = { backupRef: '', target: '' }

const unwrapCluster = (entry) => entry?.DOCUMENT ?? entry ?? {}
const clusterId = (entry) => {
  const resource = unwrapCluster(entry)

  return resource?.CLUSTER_ID ?? resource?.ID
}
const clusterName = (entry) => {
  const resource = unwrapCluster(entry)

  return resource?.NAME ?? `Kubernetes ${clusterId(entry)}`
}

const jsonRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  })
  let envelope
  try {
    envelope = await response.json()
  } catch (_) {
    envelope = undefined
  }
  if (!response.ok) {
    const message =
      envelope?.data?.error ??
      envelope?.error ??
      envelope?.message ??
      `Request failed (${response.status})`
    throw new Error(message)
  }

  return envelope?.data !== undefined ? envelope.data : envelope
}

const phaseColor = (phase) => {
  switch (phase) {
    case 'Ready':
      return 'success'
    case 'Failed':
      return 'error'
    case 'Unknown':
      return 'warning'
    default:
      return 'info'
  }
}

const endpointText = (endpoint = {}) => {
  if (!endpoint?.host) return 'Pending'

  return `${endpoint.protocol || 'db'}://${endpoint.host}${
    endpoint.port ? `:${endpoint.port}` : ''
  }`
}

const monitoringText = (monitoring = {}) => {
  if (!monitoring.known) return 'Unknown'
  if (!monitoring.enabled) return 'Disabled'

  return monitoring.healthy ? 'Healthy' : 'Degraded'
}

const monitoringColor = (monitoring = {}) => {
  if (!monitoring.known) return 'warning'
  if (!monitoring.enabled) return 'default'

  return monitoring.healthy ? 'success' : 'error'
}

const firstQualified = (catalog = {}) => {
  const engine = Object.keys(catalog.engines ?? {})[0] ?? ''

  return {
    name: '',
    engine,
    version: catalog.engines?.[engine]?.[0] ?? '',
    replicas: 3,
    storageGiB: 20,
    storageClass: catalog.storageClasses?.[0] ?? '',
    topology: 'ha',
    protectionGroupRef: '',
    deletionProtection: true,
  }
}

const CreateDialog = ({ open, catalog, onClose, onSubmit, busy }) => {
  const [form, setForm] = useState(() => firstQualified(catalog))
  const set = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  useEffect(() => {
    if (open) setForm(firstQualified(catalog))
  }, [open, catalog])

  const submit = () =>
    onSubmit({
      name: form.name.trim(),
      engine: form.engine,
      version: form.version,
      replicas: Number(form.replicas),
      storageGiB: Number(form.storageGiB),
      storageClass: form.storageClass,
      haTopology: {
        mode: form.topology,
        replicas: Number(form.replicas),
      },
      protectionGroupRef: form.protectionGroupRef.trim(),
      deletionProtection: Boolean(form.deletionProtection),
    })

  const engines = Object.keys(catalog?.engines ?? {})
  const versions = catalog?.engines?.[form.engine] ?? []
  const storageClasses = catalog?.storageClasses ?? []

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Create LayerSentry database</DialogTitle>
      <DialogContent
        sx={{ display: 'grid', gap: 2, pt: '12px !important' }}
      >
        <Alert severity="info">
          Only administrator-qualified database versions and persistent CSI classes
          are selectable. Provider implementation details and admin credentials stay
          server-side.
        </Alert>
        <TextField
          label="Database name"
          value={form.name}
          onChange={set('name')}
          helperText="Lowercase DNS label, for example orders-db"
          required
        />
        <FormControl fullWidth required>
          <InputLabel id="layersentry-engine-label">Database engine</InputLabel>
          <Select
            labelId="layersentry-engine-label"
            label="Database engine"
            value={form.engine}
            onChange={(event) => {
              const engine = event.target.value
              setForm((current) => ({
                ...current,
                engine,
                version: catalog?.engines?.[engine]?.[0] ?? '',
              }))
            }}
          >
            {engines.map((engine) => (
              <MenuItem key={engine} value={engine}>
                {ENGINE_LABELS[engine] ?? engine}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth required>
          <InputLabel id="layersentry-version-label">Certified engine version</InputLabel>
          <Select
            labelId="layersentry-version-label"
            label="Certified engine version"
            value={form.version}
            onChange={set('version')}
          >
            {versions.map((version) => (
              <MenuItem key={version} value={version}>{version}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
          }}
        >
          <FormControl fullWidth>
            <InputLabel id="layersentry-topology-label">Topology</InputLabel>
            <Select
              labelId="layersentry-topology-label"
              label="Topology"
              value={form.topology}
              onChange={(event) => {
                const topology = event.target.value
                setForm((current) => ({
                  ...current,
                  topology,
                  replicas:
                    topology === 'single'
                      ? 1
                      : Math.max(3, Number(current.replicas) || 3),
                }))
              }}
            >
              <MenuItem value="ha">High availability</MenuItem>
              <MenuItem value="single">Single instance</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Replicas"
            type="number"
            inputProps={{ min: form.topology === 'ha' ? 3 : 1 }}
            value={form.replicas}
            onChange={set('replicas')}
            disabled={form.topology === 'single'}
            required
          />
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
          }}
        >
          <TextField
            label="Storage (GiB)"
            type="number"
            inputProps={{ min: 1 }}
            value={form.storageGiB}
            onChange={set('storageGiB')}
            required
          />
          <FormControl fullWidth required>
            <InputLabel id="layersentry-storage-label">Persistent storage class</InputLabel>
            <Select
              labelId="layersentry-storage-label"
              label="Persistent storage class"
              value={form.storageClass}
              onChange={set('storageClass')}
            >
              {storageClasses.map((storageClass) => (
                <MenuItem key={storageClass} value={storageClass}>
                  {storageClass}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <TextField
          label="Protection group reference"
          value={form.protectionGroupRef}
          onChange={set('protectionGroupRef')}
          helperText="Optional P3 recovery-reference integration"
        />
        <FormControlLabel
          control={(
            <Switch
              checked={form.deletionProtection}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  deletionProtection: event.target.checked,
                }))
              }
            />
          )}
          label="Protect this database from deletion"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={
            busy ||
            !form.name.trim() ||
            !form.engine ||
            !form.version ||
            !form.storageClass
          }
        >
          {busy ? 'Submitting…' : 'Create database'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const ScaleDialog = ({ database, catalog, onClose, onSubmit, busy }) => {
  const [version, setVersion] = useState(database?.spec?.desiredVersion ?? '')
  const [replicas, setReplicas] = useState(database?.spec?.replicas ?? 3)
  const [storage, setStorage] = useState(database?.spec?.storageGiB ?? 20)
  const [protectionGroupRef, setProtectionGroupRef] = useState(
    database?.spec?.protectionGroupRef ?? ''
  )
  const [deletionProtection, setDeletionProtection] = useState(
    database?.spec?.deletionProtection ?? true
  )

  useEffect(() => {
    setVersion(database?.spec?.desiredVersion ?? '')
    setReplicas(database?.spec?.replicas ?? 3)
    setStorage(database?.spec?.storageGiB ?? 20)
    setProtectionGroupRef(database?.spec?.protectionGroupRef ?? '')
    setDeletionProtection(database?.spec?.deletionProtection ?? true)
  }, [database])

  if (!database) return null
  const topology = database.spec?.haTopology?.mode || 'provider-managed'
  const versions = catalog?.engines?.[database.spec?.engine] ?? []
  const minimumReplicas = topology === 'ha' ? 3 : 1

  return (
    <Dialog
      open={Boolean(database)}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Scale or upgrade {database.spec.name}</DialogTitle>
      <DialogContent
        sx={{ display: 'grid', gap: 2, pt: '12px !important' }}
      >
        <Alert severity="warning">
          Changes are asynchronous. LayerSentry keeps the operation visible until
          authoritative convergence is observed. Persistent storage can grow but
          cannot shrink or switch storage class in place.
        </Alert>
        <FormControl fullWidth required>
          <InputLabel id="layersentry-upgrade-version-label">Certified engine version</InputLabel>
          <Select
            labelId="layersentry-upgrade-version-label"
            label="Certified engine version"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          >
            {versions.map((item) => (
              <MenuItem key={item} value={item}>{item}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Replicas"
          type="number"
          value={replicas}
          inputProps={{ min: minimumReplicas }}
          disabled={topology === 'single'}
          onChange={(event) => setReplicas(event.target.value)}
        />
        <TextField
          label="Storage (GiB)"
          type="number"
          value={storage}
          inputProps={{ min: database.spec.storageGiB }}
          onChange={(event) => setStorage(event.target.value)}
        />
        <TextField
          label="Persistent storage class"
          value={database.spec.storageClass ?? ''}
          InputProps={{ readOnly: true }}
          helperText="Changing storage class requires a separately qualified migration workflow."
        />
        <TextField
          label="Protection group reference"
          value={protectionGroupRef}
          onChange={(event) => setProtectionGroupRef(event.target.value)}
          helperText="Optional P3 recovery-reference integration"
        />
        <FormControlLabel
          control={(
            <Switch
              checked={deletionProtection}
              onChange={(event) => setDeletionProtection(event.target.checked)}
            />
          )}
          label="Deletion protection"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          disabled={
            busy ||
            !version ||
            !versions.includes(version) ||
            Number(replicas) < minimumReplicas ||
            Number(storage) < database.spec.storageGiB
          }
          onClick={() =>
            onSubmit({
              version,
              replicas: Number(replicas),
              storageGiB: Number(storage),
              storageClass: database.spec.storageClass ?? '',
              haTopology: database.spec.haTopology,
              protectionGroupRef: protectionGroupRef.trim(),
              deletionProtection,
            })
          }
        >
          {busy ? 'Submitting…' : 'Apply change'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const RecoveryDialog = ({ database, mode, onClose, onSubmit, busy }) => {
  const [form, setForm] = useState(EMPTY_RECOVERY)
  useEffect(() => {
    setForm({
      backupRef: database?.status?.lastBackupRef ?? '',
      target: '',
    })
  }, [database, mode])
  if (!database || !mode) return null

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'restore' ? 'Restore database backup' : 'Point-in-time recovery'}
      </DialogTitle>
      <DialogContent
        sx={{ display: 'grid', gap: 2, pt: '12px !important' }}
      >
        {mode === 'restore' ? (
          <TextField
            label="Backup reference"
            value={form.backupRef}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                backupRef: event.target.value,
              }))
            }
            required
          />
        ) : (
          <>
            <Alert severity="info">
              PITR uses the last completed database-native backup as its base recovery point.
            </Alert>
            <TextField
              label="Recovery time"
              type="datetime-local"
              value={form.target}
              InputLabelProps={{ shrink: true }}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  target: event.target.value,
                }))
              }
              required
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          disabled={
            busy ||
            (mode === 'restore' ? !form.backupRef.trim() : !form.target)
          }
          onClick={() =>
            onSubmit(
              mode === 'restore'
                ? { backupRef: form.backupRef.trim() }
                : { target: new Date(form.target).toISOString() }
            )
          }
        >
          {busy ? 'Submitting…' : mode === 'restore' ? 'Restore' : 'Start PITR'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const CredentialsDialog = ({ database, credentials, onClose }) => {
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    setShowPassword(false)
  }, [credentials])

  const copy = (value) => {
    if (value && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value)
    }
  }

  return (
    <Dialog
      open={Boolean(database && credentials)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Temporary connection credentials</DialogTitle>
      <DialogContent
        sx={{ display: 'grid', gap: 2, pt: '12px !important' }}
      >
        <Alert severity="warning">
          These credentials are held only in page memory and automatically cleared
          after 60 seconds. Copy them to an approved secrets manager; do not save them
          in the browser.
        </Alert>
        <TextField
          label="Username"
          value={credentials?.username ?? ''}
          InputProps={{ readOnly: true }}
        />
        <TextField
          label="Password"
          value={credentials?.password ?? ''}
          type={showPassword ? 'text' : 'password'}
          InputProps={{ readOnly: true }}
        />
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button onClick={() => copy(credentials?.username)}>
          Copy username
        </Button>
        <Button onClick={() => copy(credentials?.password)}>
          Copy password
        </Button>
        <Button onClick={() => setShowPassword((current) => !current)}>
          {showPassword ? 'Hide password' : 'Reveal password'}
        </Button>
        <Button onClick={onClose}>Clear credentials</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * LayerSentry-branded provider-neutral DBaaS page.
 *
 * @returns {object} React element
 */
const Dbaas = () => {
  const { view } = useViews()
  const oneKsQuery = OneKsAPI.useGetOneKsClustersQuery()
  const clusters = oneKsQuery.data ?? []
  const [selectedCluster, setSelectedCluster] = useState('')
  const [catalog, setCatalog] = useState({ engines: {}, storageClasses: [] })
  const [databases, setDatabases] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editDatabase, setEditDatabase] = useState(null)
  const [recovery, setRecovery] = useState({ database: null, mode: '' })
  const [credentialDatabase, setCredentialDatabase] = useState(null)
  const [credentials, setCredentials] = useState(null)
  const credentialsTimer = useRef(null)

  useEffect(() => {
    if (!selectedCluster && clusters.length) {
      const first = clusterId(clusters[0])
      if (first !== undefined && first !== null) {
        setSelectedCluster(String(first))
      }
    }
  }, [clusters, selectedCluster])

  const clusterRoot = useMemo(
    () =>
      selectedCluster
        ? `${API_ROOT}/${encodeURIComponent(selectedCluster)}`
        : '',
    [selectedCluster]
  )
  const baseUrl = clusterRoot ? `${clusterRoot}/databases` : ''

  const refresh = useCallback(
    async (quiet = false) => {
      if (!clusterRoot) {
        setDatabases([])
        setCatalog({ engines: {}, storageClasses: [] })

        return
      }
      if (!quiet) setLoading(true)
      try {
        const [qualified, data] = await Promise.all([
          jsonRequest(`${clusterRoot}/catalog`),
          jsonRequest(`${clusterRoot}/databases`),
        ])
        setCatalog(qualified ?? { engines: {}, storageClasses: [] })
        setDatabases(Array.isArray(data) ? data : [])
        setError('')
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [clusterRoot]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  const shouldPoll = databases.some(
    (database) =>
      database?.status?.activeOperation ||
      TRANSITIONAL_PHASES.has(database?.status?.phase)
  )

  useEffect(() => {
    if (!clusterRoot) return undefined
    const interval = setInterval(
      () => refresh(true),
      shouldPoll ? 5000 : 15000
    )

    return () => clearInterval(interval)
  }, [clusterRoot, refresh, shouldPoll])

  useEffect(
    () => () => {
      if (credentialsTimer.current) clearTimeout(credentialsTimer.current)
    },
    []
  )

  const mutate = async (request, close) => {
    setBusy(true)
    setError('')
    try {
      await request()
      close?.()
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const createDatabase = (body) =>
    mutate(
      () =>
        jsonRequest(baseUrl, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      () => setCreateOpen(false)
    )

  const updateDatabase = (database, body) =>
    mutate(
      () =>
        jsonRequest(`${baseUrl}/${encodeURIComponent(database.spec.name)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      () => setEditDatabase(null)
    )

  const action = (database, operation, body = {}) =>
    mutate(() =>
      jsonRequest(
        `${baseUrl}/${encodeURIComponent(
          database.spec.name
        )}/actions/${encodeURIComponent(operation)}`,
        { method: 'POST', body: JSON.stringify(body) }
      )
    )

  const getCredentials = async (database) => {
    setBusy(true)
    setError('')
    try {
      const value = await jsonRequest(
        `${baseUrl}/${encodeURIComponent(
          database.spec.name
        )}/actions/credentials`,
        { method: 'POST', body: '{}' }
      )
      if (credentialsTimer.current) clearTimeout(credentialsTimer.current)
      setCredentialDatabase(database)
      setCredentials(value)
      credentialsTimer.current = setTimeout(() => {
        setCredentials(null)
        setCredentialDatabase(null)
      }, 60000)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const clearCredentials = () => {
    if (credentialsTimer.current) clearTimeout(credentialsTimer.current)
    credentialsTimer.current = null
    setCredentials(null)
    setCredentialDatabase(null)
  }

  if (view !== 'cloud') return <Redirect to="/dashboard" />

  const hasQualifiedCatalog =
    Object.keys(catalog.engines ?? {}).length > 0 &&
    (catalog.storageClasses ?? []).length > 0

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', md: 'row' },
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            LayerSentry DBaaS
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Provision and recover managed databases on your LayerSentry Kubernetes clusters.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="dbaas-cluster-label">Kubernetes cluster</InputLabel>
            <Select
              labelId="dbaas-cluster-label"
              label="Kubernetes cluster"
              value={selectedCluster}
              onChange={(event) => setSelectedCluster(String(event.target.value))}
            >
              {clusters.map((entry) => {
                const id = clusterId(entry)

                return (
                  <MenuItem key={id} value={String(id)}>
                    {clusterName(entry)}
                  </MenuItem>
                )
              })}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            onClick={() => refresh()}
            disabled={loading || !clusterRoot}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreateOpen(true)}
            disabled={!clusterRoot || busy || !hasQualifiedCatalog}
          >
            Create database
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        LayerSentry DBaaS uses database-native backup and recovery. VM snapshots
        alone are not database-consistent recovery points. Operations remain
        running or unknown until authoritative provider state proves their outcome.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {oneKsQuery.isError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Kubernetes cluster inventory is unavailable; DBaaS access cannot be authorized.
        </Alert>
      )}
      {selectedCluster && !loading && !hasQualifiedCatalog && !error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This cluster has no qualified DB engine/version or persistent CSI catalog.
          Database creation is disabled rather than guessing compatibility.
        </Alert>
      )}

      {loading && !databases.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress aria-label="Loading LayerSentry databases" />
        </Box>
      ) : !selectedCluster ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6">Select a Kubernetes cluster</Typography>
          <Typography color="text.secondary">
            DBaaS is scoped to an authorized LayerSentry Kubernetes cluster.
          </Typography>
        </Paper>
      ) : databases.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6">No managed databases</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Create the first database after qualified persistent CSI and DBaaS
            catalog entries are available on this cluster.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Database</TableCell>
                <TableCell>Engine</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Topology / replicas</TableCell>
                <TableCell>Storage</TableCell>
                <TableCell>Endpoint</TableCell>
                <TableCell>Monitoring</TableCell>
                <TableCell>Recovery</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {databases.map((database) => {
                const { spec = {}, status = {} } = database
                const active = status.activeOperation
                const ready = status.phase === 'Ready' && !active

                return (
                  <TableRow key={spec.name} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {spec.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {status.currentVersion || spec.desiredVersion}
                      </Typography>
                    </TableCell>
                    <TableCell>{ENGINE_LABELS[spec.engine] ?? spec.engine}</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Chip
                        size="small"
                        color={phaseColor(status.phase)}
                        label={status.phase || 'Pending'}
                      />
                      {active && (
                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                          {active.kind}: {active.state}
                        </Typography>
                      )}
                      {active?.message && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {active.message}
                        </Typography>
                      )}
                      {status.message && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {status.message}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {spec.haTopology?.mode || 'provider-managed'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {status.readyReplicas ?? 0} / {spec.replicas ?? 0} ready
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {status.appliedStorageGiB || spec.storageGiB || 0} GiB
                    </TableCell>
                    <TableCell>{endpointText(status.endpoint)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={monitoringColor(status.monitoring)}
                        label={monitoringText(status.monitoring)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">
                        Backup: {status.lastBackupRef || 'None'}
                      </Typography>
                      <Typography variant="caption" display="block">
                        Recovery: {status.lastRecoveryRef || 'None'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ minWidth: 330 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.5,
                          justifyContent: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Button
                          size="small"
                          onClick={() => setEditDatabase(database)}
                          disabled={!ready || busy}
                        >
                          Scale / upgrade
                        </Button>
                        <Button
                          size="small"
                          onClick={() => action(database, 'backup')}
                          disabled={!ready || busy}
                        >
                          Backup
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            setRecovery({ database, mode: 'restore' })
                          }
                          disabled={!ready || busy || !status.lastBackupRef}
                        >
                          Restore
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setRecovery({ database, mode: 'pitr' })}
                          disabled={!ready || busy || !status.lastBackupRef}
                        >
                          PITR
                        </Button>
                        <Button
                          size="small"
                          onClick={() => getCredentials(database)}
                          disabled={!ready || busy}
                        >
                          Credentials
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={
                            busy || spec.deletionProtection || Boolean(active)
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete database ${spec.name}? This requests provider deletion.`
                              )
                            ) {
                              mutate(() =>
                                jsonRequest(
                                  `${baseUrl}/${encodeURIComponent(spec.name)}`,
                                  { method: 'DELETE' }
                                )
                              )
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateDialog
        open={createOpen}
        catalog={catalog}
        onClose={() => setCreateOpen(false)}
        onSubmit={createDatabase}
        busy={busy}
      />
      <ScaleDialog
        database={editDatabase}
        catalog={catalog}
        onClose={() => setEditDatabase(null)}
        onSubmit={(body) => updateDatabase(editDatabase, body)}
        busy={busy}
      />
      <RecoveryDialog
        database={recovery.database}
        mode={recovery.mode}
        onClose={() => setRecovery({ database: null, mode: '' })}
        onSubmit={(body) => {
          const database = recovery.database
          const mode = recovery.mode

          return mutate(
            () =>
              jsonRequest(
                `${baseUrl}/${encodeURIComponent(
                  database.spec.name
                )}/actions/${mode}`,
                { method: 'POST', body: JSON.stringify(body) }
              ),
            () => setRecovery({ database: null, mode: '' })
          )
        }}
        busy={busy}
      />
      <CredentialsDialog
        database={credentialDatabase}
        credentials={credentials}
        onClose={clearCredentials}
      />
    </Box>
  )
}

export default Dbaas