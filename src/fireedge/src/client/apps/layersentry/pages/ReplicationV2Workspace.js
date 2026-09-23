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
/* eslint-disable jsdoc/require-jsdoc, prettier/prettier, padding-line-between-statements */
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

const vmDisks = (vm = {}) =>
  toArray(vm?.TEMPLATE?.DISK)
    .filter((disk) => disk && disk.DISK_ID !== undefined)
    .filter(
      (disk) =>
        !['CDROM', 'SWAP'].includes(String(disk.TYPE || '').toUpperCase())
    )
    .map((disk) => ({
      id: String(disk.DISK_ID),
      source_ref: '',
      target_ref: '',
      virtual_bytes:
        Math.max(1, Number(disk.SIZE || disk.ORIGINAL_SIZE || 1)) *
        1024 *
        1024,
      label:
        disk.IMAGE ||
        disk.IMAGE_ID ||
        disk.TARGET ||
        `Disk ${disk.DISK_ID}`,
    }))

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
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value >= 3600) return `${Math.round(value / 360) / 10} h`
  if (value >= 60) return `${Math.round(value / 6) / 10} min`
  return `${Math.round(value)} sec`
}

const durationToText = (nanoseconds) =>
  secondsToText(Number(nanoseconds || 0) / 1e9)

const bytesToText = (bytes) => {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${Math.round(value)} B`
}

const dateText = (value) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

const ReplicationV2Workspace = () => {
  const vmQuery = VmAPI.useGetVmsQuery({ extended: true })
  const zoneQuery = ZoneAPI.useGetZonesQuery()
  const vms = toArray(vmQuery.data)
  const zones = toArray(zoneQuery.data)

  const [capabilities, setCapabilities] = useState({})
  const [sessions, setSessions] = useState([])
  const [details, setDetails] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [vmId, setVmId] = useState('')
  const [targetSite, setTargetSite] = useState('')
  const [backendChoice, setBackendChoice] = useState('AUTO')
  const [checkpointSeconds, setCheckpointSeconds] = useState(300)
  const [retention, setRetention] = useState(288)
  const [consistency, setConsistency] = useState('CRASH_CONSISTENT')
  const [protectionGroupId, setProtectionGroupId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState([])
  const [groupConsistency, setGroupConsistency] = useState('CRASH_CONSISTENT')
  const [groupCheckpoints, setGroupCheckpoints] = useState([])

  const loadSessionDetails = async (sessionList) => {
    const entries = await Promise.all(
      sessionList.map(async (session) => {
        const id = session.id
        const [health, backendHealth, checkpointPayload] = await Promise.all([
          replicationAPI.health(id).catch((reason) => ({
            unavailable: true,
            error: reason.message,
          })),
          replicationAPI.backendHealth(id).catch((reason) => ({
            unavailable: true,
            error: reason.message,
          })),
          replicationAPI.checkpoints(id).catch((reason) => ({
            checkpoints: [],
            unavailable: true,
            error: reason.message,
          })),
        ])
        return [
          id,
          {
            health,
            backendHealth,
            checkpoints: checkpointPayload?.checkpoints || [],
            checkpointError: checkpointPayload?.error,
          },
        ]
      })
    )
    setDetails(Object.fromEntries(entries))
  }

  const refresh = async () => {
    const [caps, sessionPayload] = await Promise.all([
      replicationAPI.capabilities(),
      replicationAPI.sessions(),
    ])
    const sessionList = sessionPayload?.sessions || []
    setCapabilities(caps?.capabilities || {})
    setSessions(sessionList)
    await loadSessionDetails(sessionList)
  }

  useEffect(() => {
    let active = true
    Promise.all([replicationAPI.capabilities(), replicationAPI.sessions()])
      .then(async ([caps, sessionPayload]) => {
        if (!active) return
        const sessionList = sessionPayload?.sessions || []
        setCapabilities(caps?.capabilities || {})
        setSessions(sessionList)
        await loadSessionDetails(sessionList)
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
      protection_group_id: protectionGroupId.trim() || `vm-${selectedVm.ID}`,
      workload_id: String(selectedVm.ID),
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
    protectionGroupId,
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

  const testRecovery = async (sessionId, checkpointId) => {
    setError('')
    setNotice('')
    const key = `clone:${sessionId}:${checkpointId}`
    setActionBusy(key)
    try {
      const name = `test-${sessionId}-${Date.now()}`
      const result = await replicationAPI.clone(sessionId, checkpointId, name)
      const count = Object.keys(result?.resources || {}).length
      setNotice(
        `Test Recovery clone created from committed checkpoint ${checkpointId} (${count} disk resource(s)). No failover was performed.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setActionBusy('')
    }
  }

  const requestRebaseline = async (sessionId, health = {}) => {
    setError('')
    setNotice('')
    const key = `rebaseline:${sessionId}`
    setActionBusy(key)
    try {
      await replicationAPI.rebaseline(sessionId)
      setNotice(
        `Rebaseline requested for ${sessionId}. Reason: ${health?.reason || 'operator-requested source continuity reset'}.`
      )
      await refresh()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setActionBusy('')
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
        Restic backup stays enabled and independent. Replication v2 creates hot
        recovery checkpoints only. Failover controls remain hidden until the
        fencing and recovery orchestrator path is independently qualified.
      </Alert>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {notice}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
          mt: 2,
        }}
      >
        <MetricCard
          label="Protected VMs"
          value={sessions.length}
          detail="Replication v2 sessions"
        />
        <MetricCard
          label="Replicating"
          value={healthy}
          detail="Checkpoint stream active"
          accent={colors.status.success}
        />
        <MetricCard
          label="Seeding"
          value={seeding}
          detail="Baseline convergence in progress"
          accent={colors.status.warning}
        />
      </Box>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Protect a VM"
          description="LayerSentry resolves authoritative VM and datastore identity server-side. Choose the recovery site and objective; storage details are selected automatically unless you override them."
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
            <Select
              value={vmId}
              label="Virtual machine"
              onChange={(e) => setVmId(e.target.value)}
            >
              {vms.map((vm) => (
                <MenuItem key={vm.ID} value={String(vm.ID)}>
                  {vm.NAME || `VM ${vm.ID}`} · ID {vm.ID}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Recovery site</InputLabel>
            <Select
              value={targetSite}
              label="Recovery site"
              onChange={(e) => setTargetSite(e.target.value)}
            >
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
              <MenuItem value={300}>
                Standard · checkpoint every 5 minutes
              </MenuItem>
              <MenuItem value={60}>
                Enhanced · checkpoint every 1 minute
              </MenuItem>
              <MenuItem value={30}>
                Enhanced · checkpoint every 30 seconds
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>DR storage</InputLabel>
            <Select
              value={backendChoice}
              label="DR storage"
              onChange={(e) => setBackendChoice(e.target.value)}
            >
              <MenuItem value="AUTO">Auto recommended</MenuItem>
              {Object.entries(backendLabel)
                .filter(
                  ([kind]) => capabilities[kind.toLowerCase()] === true
                )
                .map(([kind, label]) => (
                  <MenuItem key={kind} value={kind}>
                    {label}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Consistency</InputLabel>
            <Select
              value={consistency}
              label="Consistency"
              onChange={(e) => setConsistency(e.target.value)}
            >
              <MenuItem value="CRASH_CONSISTENT">Crash consistent</MenuItem>
              <MenuItem value="FILESYSTEM_CONSISTENT">
                Filesystem quiesced
              </MenuItem>
              <MenuItem value="APPLICATION_CONSISTENT">
                Application consistent
              </MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Protection group ID"
            value={protectionGroupId}
            onChange={(e) => setProtectionGroupId(e.target.value)}
            placeholder={selectedVm ? `vm-${selectedVm.ID}` : 'application-group'}
            helperText="Use the same ID on application members that must share a coordinated checkpoint barrier."
          />
          <TextField
            label="Hot checkpoints to retain"
            type="number"
            value={retention}
            onChange={(e) =>
              setRetention(Math.max(1, Number(e.target.value)))
            }
            inputProps={{ min: 1, max: 10000 }}
          />
        </Box>

        <Box
          sx={{
            mt: 2,
            p: 1.5,
            border: `1px solid ${colors.border}`,
            borderRadius: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>Review</Typography>
          <Typography
            sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
          >
            {selectedVm
              ? `${selectedVm.NAME || 'VM'} · ${disks.length} eligible disk(s)`
              : 'Choose a VM'}{' '}
            ·{' '}
            {selectedBackend
              ? backendLabel[selectedBackend]
              : 'No qualified DR backend available'}{' '}
            · target checkpoint RPO {secondsToText(checkpointSeconds)}.
          </Typography>
          {disks.map((disk) => (
            <Typography
              key={disk.id}
              sx={{ mt: 0.25, fontSize: 11, color: colors.text.muted }}
            >
              Disk {disk.id}: {disk.label} ·{' '}
              {Math.round(disk.virtual_bytes / 1024 / 1024 / 1024)} GiB
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
          description="Measured RPO and backlog are runtime evidence. Configured interval alone is never shown as achieved RPO."
        />
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {sessions.map((session) => {
            const sessionDetail = details[session.id] || {}
            const health = sessionDetail.health || {}
            const backendHealth = sessionDetail.backendHealth || {}
            const checkpoints = sessionDetail.checkpoints || []
            const latest = checkpoints[checkpoints.length - 1]
            const degraded =
              health.operational_state === 'RPO_VIOLATED' ||
              health.operational_state === 'REPLICATION_DEGRADED' ||
              session.state === 'DEGRADED'

            return (
              <Box
                key={session.id}
                sx={{
                  p: 1.5,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: '2fr repeat(5, 1fr)',
                    },
                    gap: 1,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                      {session.id}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                      VM {session.workload_id} · {session.source_site_id} →{' '}
                      {session.target_site_id}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      State
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                      {session.state}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Health
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                      {health.operational_state || '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Actual RPO
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {health.unavailable
                        ? 'Unavailable'
                        : durationToText(health.actual_rpo)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Backlog
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {health.unavailable
                        ? 'Unavailable'
                        : bytesToText(health.backlog_bytes)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Catch-up ETA
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {health.unavailable
                        ? 'Unavailable'
                        : durationToText(health.catch_up_eta)}
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    mt: 1.25,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
                    gap: 1,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Backend
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {backendLabel[session.backend] || session.backend}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Backend readiness
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {backendHealth.unavailable
                        ? 'Unavailable'
                        : backendHealth.ready
                          ? 'Ready'
                          : 'Not ready'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Configured RPO
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {durationToText(session?.policy?.max_rpo)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      Latest RESTORABLE checkpoint
                    </Typography>
                    <Typography sx={{ fontSize: 12 }}>
                      {latest
                        ? `G${latest.generation} · ${dateText(latest.committed_at)}`
                        : 'None yet'}
                    </Typography>
                  </Box>
                </Box>

                {health.reason && (
                  <Alert severity={degraded ? 'warning' : 'info'} sx={{ mt: 1 }}>
                    {health.reason}
                  </Alert>
                )}

                <Box sx={{ mt: 1.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 750 }}>
                    Checkpoint history
                  </Typography>
                  {checkpoints
                    .slice()
                    .reverse()
                    .slice(0, 8)
                    .map((checkpoint) => {
                      const key = `clone:${session.id}:${checkpoint.id}`
                      return (
                        <Box
                          key={checkpoint.id}
                          sx={{
                            mt: 0.75,
                            p: 1,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 1,
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography
                            sx={{ fontSize: 11, color: colors.text.secondary }}
                          >
                            G{checkpoint.generation} ·{' '}
                            {dateText(checkpoint.committed_at)} ·{' '}
                            {checkpoint.consistency} ·{' '}
                            {checkpoint.disks?.length || 0} disk(s)
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={
                              actionBusy === key ||
                              !capabilities.recovery_materialization
                            }
                            onClick={() =>
                              testRecovery(session.id, checkpoint.id)
                            }
                            sx={{ textTransform: 'none' }}
                          >
                            {actionBusy === key
                              ? 'Creating test recovery…'
                              : 'Test Recovery'}
                          </Button>
                        </Box>
                      )
                    })}
                  {!checkpoints.length && (
                    <Typography
                      sx={{ mt: 0.5, fontSize: 11, color: colors.text.muted }}
                    >
                      No committed recovery checkpoint is available yet.
                    </Typography>
                  )}
                </Box>

                {degraded && (
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      disabled={actionBusy === `rebaseline:${session.id}`}
                      onClick={() => requestRebaseline(session.id, health)}
                      sx={{ textTransform: 'none' }}
                    >
                      {actionBusy === `rebaseline:${session.id}`
                        ? 'Requesting…'
                        : 'Rebaseline after continuity loss'}
                    </Button>
                    <Typography
                      sx={{ mt: 0.5, fontSize: 10, color: colors.text.muted }}
                    >
                      Rebaseline starts a new baseline/epoch only when source
                      continuity cannot be proven. Existing committed checkpoints
                      and Restic recovery points remain independent.
                    </Typography>
                  </Box>
                )}
              </Box>
            )
          })}
          {!sessions.length && (
            <Typography sx={{ fontSize: 12, color: colors.text.secondary }}>
              No Replication v2 sessions are configured.
            </Typography>
          )}
        </Box>
      </Surface>

      {capabilities.application_protection_groups && (
        <Surface sx={{ mt: 2, p: 2.5 }}>
          <SectionHeader
            title="Application protection groups"
            description="Coordinate a common checkpoint barrier across related replication sessions. Filesystem/application consistency requires the qualified quiesce provider."
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' },
              gap: 1.5,
            }}
          >
            <TextField
              label="Group ID"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="app-ordering"
            />
            <TextField
              label="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ordering application"
            />
            <FormControl fullWidth>
              <InputLabel>Member sessions</InputLabel>
              <Select
                multiple
                value={groupMembers}
                label="Member sessions"
                onChange={(e) =>
                  setGroupMembers(
                    typeof e.target.value === 'string'
                      ? e.target.value.split(',')
                      : e.target.value
                  )
                }
              >
                {sessions.map((session) => (
                  <MenuItem
                    key={session.id}
                    value={session.id}
                    disabled={
                      Boolean(groupId) &&
                      session.protection_group_id !== groupId
                    }
                  >
                    {session.id} · VM {session.workload_id} · group{' '}
                    {session.protection_group_id || '—'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Group consistency</InputLabel>
              <Select
                value={groupConsistency}
                label="Group consistency"
                onChange={(e) => setGroupConsistency(e.target.value)}
              >
                <MenuItem value="CRASH_CONSISTENT">Crash consistent</MenuItem>
                <MenuItem value="FILESYSTEM_CONSISTENT">
                  Filesystem quiesced
                </MenuItem>
                <MenuItem value="APPLICATION_CONSISTENT">
                  Application consistent
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Every member session must already use this exact protection-group ID.
            Dependency ordering is enforced by the coordinator API; no failover
            action is exposed here.
          </Alert>
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              disabled={
                actionBusy === 'group:configure' ||
                !groupId.trim() ||
                !groupName.trim() ||
                groupMembers.length === 0
              }
              onClick={async () => {
                setError('')
                setNotice('')
                setActionBusy('group:configure')
                try {
                  await replicationAPI.putProtectionGroup({
                    id: groupId.trim(),
                    name: groupName.trim(),
                    session_ids: groupMembers,
                    dependencies: {},
                    consistency: groupConsistency,
                  })
                  setNotice(`Protection group ${groupId} configured.`)
                } catch (reason) {
                  setError(reason.message)
                } finally {
                  setActionBusy('')
                }
              }}
              sx={{ textTransform: 'none' }}
            >
              {actionBusy === 'group:configure'
                ? 'Configuring…'
                : 'Configure group'}
            </Button>
            <Button
              variant="contained"
              disabled={
                actionBusy === 'group:capture' ||
                !groupId.trim() ||
                groupMembers.length === 0
              }
              onClick={async () => {
                setError('')
                setNotice('')
                setActionBusy('group:capture')
                try {
                  const checkpoint =
                    await replicationAPI.captureProtectionGroup(groupId.trim())
                  const payload =
                    await replicationAPI.protectionGroupCheckpoints(
                      groupId.trim()
                    )
                  setGroupCheckpoints(payload?.checkpoints || [])
                  setNotice(
                    `Coordinated protection-group checkpoint ${checkpoint.id} committed. This did not perform failover.`
                  )
                  await refresh()
                } catch (reason) {
                  setError(reason.message)
                } finally {
                  setActionBusy('')
                }
              }}
              sx={{ textTransform: 'none' }}
            >
              {actionBusy === 'group:capture'
                ? 'Capturing coordinated checkpoint…'
                : 'Capture coordinated checkpoint'}
            </Button>
          </Box>
          <Box sx={{ mt: 1.5, display: 'grid', gap: 0.75 }}>
            {groupCheckpoints
              .slice()
              .reverse()
              .map((checkpoint) => (
                <Box
                  key={checkpoint.id}
                  sx={{
                    p: 1,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 1,
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                    {checkpoint.id}
                  </Typography>
                  <Typography
                    sx={{ fontSize: 10, color: colors.text.secondary }}
                  >
                    {checkpoint.consistency} ·{' '}
                    {Object.keys(checkpoint.checkpoints || {}).length} member
                    checkpoint(s) · {dateText(checkpoint.committed_at)}
                  </Typography>
                </Box>
              ))}
          </Box>
        </Surface>
      )}
    </PageFrame>
  )
}

export default ReplicationV2Workspace
