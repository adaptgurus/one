/* eslint-disable jsdoc/require-jsdoc */
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { VmAPI, ZoneAPI } from '@FeaturesModule'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'
import { replicationAPI } from 'client/apps/layersentry/replicationV2'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const vmDisks = (vm = {}) => {
  const raw = vm?.TEMPLATE?.DISK
  return toArray(raw)
    .filter((disk) => disk && disk.DISK_ID !== undefined)
    .filter(
      (disk) =>
        !['CDROM', 'SWAP'].includes(String(disk.TYPE || '').toUpperCase())
    )
    .map((disk) => ({
      id: String(disk.DISK_ID),
      source_ref: `opennebula://vm/${vm.ID}/disk/${disk.DISK_ID}`,
      target_ref: '',
      virtual_bytes:
        Math.max(1, Number(disk.SIZE || disk.ORIGINAL_SIZE || 1)) * 1024 * 1024,
      label:
        disk.IMAGE ||
        disk.IMAGE_ID ||
        disk.TARGET ||
        `Disk ${disk.DISK_ID}`,
    }))
}

const backendLabel = {
  CEPH_RBD: 'Ceph RBD — fastest recovery',
  LVM_THIN: 'Generic block / SAN — LVM Thin',
  FILE_COW: 'NFS / shared filesystem — COW checkpoints',
}

const recommendedBackend = (caps = {}) => {
  if (caps.ceph_rbd) return 'CEPH_RBD'
  if (caps.lvm_thin) return 'LVM_THIN'
  if (caps.file_cow) return 'FILE_COW'
  return ''
}

const secondsToText = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 3600) return `${Math.round(value / 360) / 10} h`
  if (value >= 60) return `${Math.round(value / 6) / 10} min`
  return `${Math.round(value)} sec`
}

const ReplicationV2Workspace = () => {
  const vmQuery = VmAPI.useGetVmsQuery({ extended: true })
  const zoneQuery = ZoneAPI.useGetZonesQuery()
  const vms = toArray(vmQuery.data)
  const zones = toArray(zoneQuery.data)

  const [capabilities, setCapabilities] = useState({})
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [vmId, setVmId] = useState('')
  const [targetSite, setTargetSite] = useState('')
  const [backendChoice, setBackendChoice] = useState('AUTO')
  const [checkpointSeconds, setCheckpointSeconds] = useState(300)
  const [retention, setRetention] = useState(288)
  const [consistency, setConsistency] = useState('CRASH_CONSISTENT')

  const refresh = async () => {
    const [caps, sessionPayload] = await Promise.all([
      replicationAPI.capabilities(),
      replicationAPI.sessions(),
    ])
    setCapabilities(caps?.capabilities || {})
    setSessions(sessionPayload?.sessions || [])
  }

  useEffect(() => {
    let active = true
    Promise.all([replicationAPI.capabilities(), replicationAPI.sessions()])
      .then(([caps, sessionPayload]) => {
        if (!active) return
        setCapabilities(caps?.capabilities || {})
        setSessions(sessionPayload?.sessions || [])
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedVm = useMemo(
    () => vms.find(({ ID }) => String(ID) === String(vmId)),
    [vms, vmId]
  )
  const disks = useMemo(() => vmDisks(selectedVm), [selectedVm])
  const selectedBackend =
    backendChoice === 'AUTO'
      ? recommendedBackend(capabilities)
      : backendChoice

  const request = useMemo(() => {
    if (!selectedVm || !targetSite || !selectedBackend) return null
    return {
      id: `vm-${selectedVm.ID}-to-${targetSite}`,
      protection_group_id: `vm-${selectedVm.ID}`,
      workload_id: `opennebula-vm:${selectedVm.ID}`,
      source_site_id: 'current',
      target_site_id: String(targetSite),
      backend: selectedBackend,
      disks: disks.map(({ label: _label, ...disk }) => disk),
      checkpoint_seconds: Number(checkpointSeconds),
      max_rpo_seconds: Number(checkpointSeconds),
      warn_backlog_bytes: 70 * 1024 * 1024 * 1024,
      max_backlog_bytes: 100 * 1024 * 1024 * 1024,
      retain_checkpoints: Number(retention),
      consistency,
      compression: 'AUTO',
    }
  }, [
    checkpointSeconds,
    consistency,
    disks,
    retention,
    selectedBackend,
    selectedVm,
    targetSite,
  ])

  const createProtection = async () => {
    setError('')
    setNotice('')
    if (!request || disks.length === 0) {
      setError('Choose a VM, target site and available replication backend.')
      return
    }
    setBusy(true)
    try {
      const preflight = await replicationAPI.preflight(request)
      if (preflight?.ready !== true) {
        throw new Error(preflight?.error || 'Replication preflight failed.')
      }
      await replicationAPI.create(request)
      setNotice(
        'Replication session created in SEEDING state. Existing Restic backup remains unchanged.'
      )
      await refresh()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const healthy = sessions.filter(({ state }) => state === 'REPLICATING').length
  const seeding = sessions.filter(({ state }) => state === 'SEEDING').length

  return (
    <PageFrame
      title="VM Replication"
      description="Checkpoint-based DC/DR replication. Hot DR is independent from the existing Restic backup and recovery path."
    >
      <Alert severity="info" sx={{ mt: 2 }}>
        Restic backup stays enabled and independent. This page configures the
        new hot-replica/checkpoint path only; failover remains governed by the
        existing LayerSentry fencing and recovery safety controls.
      </Alert>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
          mt: 2,
        }}
      >
        <MetricCard label="Protected VMs" value={sessions.length} detail="Replication v2 sessions" />
        <MetricCard label="Replicating" value={healthy} detail="Checkpoint stream active" accent={colors.status.success} />
        <MetricCard label="Seeding" value={seeding} detail="Baseline convergence in progress" accent={colors.status.warning} />
      </Box>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Protect a VM"
          description="LayerSentry discovers attached VM disks automatically. Choose the recovery site and objective; storage details are selected automatically unless you override them."
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' },
            gap: 1.5,
          }}
        >
          <FormControl fullWidth>
            <InputLabel>Virtual machine</InputLabel>
            <Select value={vmId} label="Virtual machine" onChange={(e) => setVmId(e.target.value)}>
              {vms.map((vm) => (
                <MenuItem key={vm.ID} value={String(vm.ID)}>
                  {vm.NAME || `VM ${vm.ID}`} · ID {vm.ID}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Recovery site</InputLabel>
            <Select value={targetSite} label="Recovery site" onChange={(e) => setTargetSite(e.target.value)}>
              {zones.map((zone) => (
                <MenuItem key={zone.ID} value={`zone:${zone.ID}`}>
                  {zone.NAME || `Zone ${zone.ID}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Recovery objective</InputLabel>
            <Select
              value={checkpointSeconds}
              label="Recovery objective"
              onChange={(e) => setCheckpointSeconds(Number(e.target.value))}
            >
              <MenuItem value={300}>Standard · checkpoint every 5 minutes</MenuItem>
              <MenuItem value={60}>Enhanced · checkpoint every 1 minute</MenuItem>
              <MenuItem value={30}>Enhanced · checkpoint every 30 seconds</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>DR storage</InputLabel>
            <Select value={backendChoice} label="DR storage" onChange={(e) => setBackendChoice(e.target.value)}>
              <MenuItem value="AUTO">Auto recommended</MenuItem>
              {Object.entries(backendLabel)
                .filter(([kind]) => capabilities[kind.toLowerCase()] === true)
                .map(([kind, label]) => <MenuItem key={kind} value={kind}>{label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Consistency</InputLabel>
            <Select value={consistency} label="Consistency" onChange={(e) => setConsistency(e.target.value)}>
              <MenuItem value="CRASH_CONSISTENT">Crash consistent</MenuItem>
              <MenuItem value="FILESYSTEM_CONSISTENT">Filesystem quiesced</MenuItem>
              <MenuItem value="APPLICATION_CONSISTENT">Application consistent</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Hot checkpoints to retain"
            type="number"
            value={retention}
            onChange={(e) => setRetention(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1, max: 10000 }}
          />
        </Box>

        <Box sx={{ mt: 2, p: 1.5, border: `1px solid ${colors.border}`, borderRadius: 1.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>Review</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}>
            {selectedVm ? `${selectedVm.NAME || 'VM'} · ${disks.length} eligible disk(s)` : 'Choose a VM'} ·
            {' '}{selectedBackend ? backendLabel[selectedBackend] : 'No qualified DR backend available'} ·
            {' '}target checkpoint RPO {secondsToText(checkpointSeconds)}.
          </Typography>
          {disks.map((disk) => (
            <Typography key={disk.id} sx={{ mt: 0.25, fontSize: 11, color: colors.text.muted }}>
              Disk {disk.id}: {disk.label} · {Math.round(disk.virtual_bytes / 1024 / 1024 / 1024)} GiB
            </Typography>
          ))}
        </Box>
        <Button
          sx={{ mt: 2, textTransform: 'none' }}
          variant="contained"
          disabled={busy || !request || disks.length === 0}
          onClick={createProtection}
        >
          {busy ? 'Validating…' : 'Validate and enable replication'}
        </Button>
      </Surface>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Replication sessions"
          description="Configured objective and current control-plane state. Actual RPO/backlog telemetry will supersede configured interval once the data-plane worker is running."
        />
        <Box sx={{ display: 'grid', gap: 1 }}>
          {sessions.map((session) => (
            <Box
              key={session.id}
              sx={{
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' },
                gap: 1,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 750 }}>{session.id}</Typography>
                <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                  {session.workload_id} · {session.source_site_id} → {session.target_site_id}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: colors.text.muted }}>State</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{session.state}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: colors.text.muted }}>Backend</Typography>
                <Typography sx={{ fontSize: 12 }}>{backendLabel[session.backend] || session.backend}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 10, color: colors.text.muted }}>Configured RPO</Typography>
                <Typography sx={{ fontSize: 12 }}>{secondsToText(Number(session?.policy?.max_rpo || 0) / 1e9)}</Typography>
              </Box>
            </Box>
          ))}
          {!sessions.length && (
            <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
              No Replication v2 sessions are configured.
            </Typography>
          )}
        </Box>
      </Surface>
    </PageFrame>
  )
}

export default ReplicationV2Workspace
