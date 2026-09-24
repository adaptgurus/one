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
import { VmAPI } from '@FeaturesModule'
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

const vmNics = (vm = {}) =>
  toArray(vm?.TEMPLATE?.NIC)
    .filter((nic) => nic && nic.NIC_ID !== undefined)
    .map((nic) => ({
      id: Number(nic.NIC_ID),
      sourceNetworkId: String(nic.NETWORK_ID || ''),
      sourceNetworkName: nic.NETWORK || `Network ${nic.NETWORK_ID || nic.NIC_ID}`,
      ip: nic.IP || '',
    }))

const backendLabel = {
  CEPH_RBD: 'Ceph RBD — fastest recovery',
  LVM_THIN: 'Generic block / SAN — LVM Thin',
  FILE_COW: 'NFS / shared filesystem — COW checkpoints',
}

const recommendedBackend = (caps = {}, allowed = [], catalogBound = false) => {
  const available = (kind) =>
    catalogBound ? allowed.includes(kind) : caps[kind.toLowerCase()] === true

  if (available('CEPH_RBD')) return 'CEPH_RBD'
  if (available('LVM_THIN')) return 'LVM_THIN'
  if (available('FILE_COW')) return 'FILE_COW'

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
  const vms = toArray(vmQuery.data)

  const [capabilities, setCapabilities] = useState({})
  const [localSiteId, setLocalSiteId] = useState('')
  const [targetSites, setTargetSites] = useState([])
  const [targetBackends, setTargetBackends] = useState({})
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
  const [groupDependencies, setGroupDependencies] = useState('{}')
  const [groupCheckpoints, setGroupCheckpoints] = useState([])
  const [environmentNetworks, setEnvironmentNetworks] = useState([])
  const [drMode, setDrMode] = useState('NDR')
  const [pairSiteId, setPairSiteId] = useState('')
  const [pairSiteName, setPairSiteName] = useState('')
  const [pairEndpoint, setPairEndpoint] = useState('')
  const [pairUsername, setPairUsername] = useState('')
  const [pairPassword, setPairPassword] = useState('')
  const [pairBusy, setPairBusy] = useState(false)
  const [managementPolicies, setManagementPolicies] = useState([])
  const [checkpointCatalog, setCheckpointCatalog] = useState([])
  const [targetClusterId, setTargetClusterId] = useState('0')
  const [targetDatastoreId, setTargetDatastoreId] = useState('1')
  const [targetNetworkId, setTargetNetworkId] = useState('')
  const [addressMode, setAddressMode] = useState('DHCP')
  const [staticIp, setStaticIp] = useState('')
  const [staticPrefix, setStaticPrefix] = useState(24)
  const [staticGateway, setStaticGateway] = useState('')
  const [staticDns, setStaticDns] = useState('')
  const [mappingBusy, setMappingBusy] = useState(false)

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
    setLocalSiteId(caps?.local_site_id || '')
    setTargetSites(caps?.target_site_ids || [])
    setTargetBackends(caps?.target_backends || {})
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
        setLocalSiteId(caps?.local_site_id || '')
        setTargetSites(caps?.target_site_ids || [])
        setTargetBackends(caps?.target_backends || {})
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

  useEffect(() => {
    let active = true
    replicationAPI
      .drEnvironmentNetworks()
      .then((payload) => {
        if (active) setEnvironmentNetworks(payload?.networks || [])
      })
      .catch(() => {
        if (active) setEnvironmentNetworks([])
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
  const nics = useMemo(() => vmNics(selectedVm), [selectedVm])
  const primaryNic = nics[0] || null
  const targetBackendCatalogBound =
    Boolean(targetSite) &&
    Object.prototype.hasOwnProperty.call(targetBackends, targetSite)
  const allowedTargetBackends = targetBackendCatalogBound
    ? toArray(targetBackends[targetSite])
    : []
  const backendAllowed = (kind) =>
    targetBackendCatalogBound
      ? allowedTargetBackends.includes(kind)
      : capabilities[kind.toLowerCase()] === true
  const multiWorkloadGroups =
    capabilities.multi_workload_protection_groups === true
  const filesystemConsistency =
    capabilities.filesystem_consistency === true
  const applicationConsistency =
    capabilities.application_consistency === true
  const groupModeQualified =
    groupMembers.length <= 1 ||
    multiWorkloadGroups
  const groupConsistencyQualified =
    groupConsistency === 'CRASH_CONSISTENT' ||
    (groupConsistency === 'FILESYSTEM_CONSISTENT' && filesystemConsistency) ||
    (groupConsistency === 'APPLICATION_CONSISTENT' && applicationConsistency)

  const selectedBackend =
    backendChoice === 'AUTO'
      ? recommendedBackend(
          capabilities,
          allowedTargetBackends,
          targetBackendCatalogBound
        )
      : backendAllowed(backendChoice)
        ? backendChoice
        : ''

  const request = useMemo(() => {
    if (!selectedVm || !targetSite || !selectedBackend) return null
    return {
      id: `vm-${selectedVm.ID}-to-${targetSite}`,
      protection_group_id: protectionGroupId.trim() || `vm-${selectedVm.ID}`,
      workload_id: String(selectedVm.ID),
      source_site_id: localSiteId,
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
    localSiteId,
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

  const pairRemoteSite = async () => {
    setError('')
    setNotice('')
    setPairBusy(true)
    try {
      const result = await replicationAPI.drPairSite({
        site_id: pairSiteId.trim(),
        name: pairSiteName.trim(),
        endpoint: pairEndpoint.trim(),
        username: pairUsername.trim(),
        password: pairPassword,
        mode: drMode,
      })
      setPairPassword('')
      if (result?.site?.id) {
        setTargetSite(result.site.id)
        setTargetSites((current) =>
          current.includes(result.site.id)
            ? current
            : [...current, result.site.id]
        )
      }
      const dc = localSiteId || 'dc'
      const dr = result?.site?.id || pairSiteId.trim()
      const policies = await replicationAPI
        .drManagementBackupPolicies(dc, dr)
        .catch(() => [])
      setManagementPolicies(Array.isArray(policies) ? policies : [])
      setNotice(
        `Site ${result?.site?.name || dr} paired. Bootstrap password was discarded; ongoing communication uses ${result?.auth_method || 'scoped API identity'}.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setPairBusy(false)
    }
  }

  const saveRecoveryMapping = async () => {
    setError('')
    setNotice('')
    if (!selectedVm || !targetSite || !primaryNic || !targetNetworkId.trim()) {
      setError(
        'Choose a VM, recovery site and target recovery network before saving mapping.'
      )
      return
    }
    if (nics.length !== 1) {
      setError(
        'This simple recovery mapper requires exactly one VM NIC. Multi-NIC VMs must use the ordered per-NIC mapping workflow so no NIC is omitted.'
      )
      return
    }
    setMappingBusy(true)
    try {
      const group = protectionGroupId.trim() || `vm-${selectedVm.ID}`
      const addressChoice =
        addressMode === 'STATIC'
          ? {
              mode: 'STATIC',
              target_ip: staticIp.trim(),
              guest_network: {
                prefix_length: Number(staticPrefix),
                gateway: staticGateway.trim(),
                dns: staticDns
                  .split(/[ ,]+/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
            }
          : { mode: 'DHCP' }
      await replicationAPI.drPutRecoveryMapping({
        mapping: {
          protection_group_id: group,
          target_site_id: String(targetSite),
          workloads: [
            {
              workload_id: String(selectedVm.ID),
              target_cluster_id: targetClusterId.trim(),
              target_datastore_id: targetDatastoreId.trim(),
              nic_mappings: [
                {
                  source_nic_id: Number(primaryNic.id),
                  source_network_id: primaryNic.sourceNetworkId,
                  target_network_id: targetNetworkId.trim(),
                  order: 0,
                },
              ],
            },
          ],
        },
        address_plans: [
          {
            workload_id: String(selectedVm.ID),
            nics: [
              {
                source_nic_id: Number(primaryNic.id),
                choice: addressChoice,
              },
            ],
          },
        ],
      })
      setNotice(
        `Recovery network mapping saved for ${selectedVm.NAME || selectedVm.ID}: ${primaryNic.sourceNetworkName} → target VNet ${targetNetworkId.trim()} using ${addressMode}.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setMappingBusy(false)
    }
  }

  const loadVMCheckpointCatalog = async () => {
    setError('')
    if (!selectedVm || !targetSite) {
      setError('Choose a VM and recovery site before loading checkpoints.')
      return
    }
    const group = protectionGroupId.trim() || `vm-${selectedVm.ID}`
    try {
      const catalog = await replicationAPI.drVMCheckpoints(group, targetSite)
      setCheckpointCatalog(Array.isArray(catalog) ? catalog : [])
    } catch (reason) {
      setError(reason.message)
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
          title="Pair DC and DR sites"
          description="Use an administrator username/password once to verify the remote LayerSentry site. The password is bootstrap-only; ongoing site-to-site traffic uses the scoped API/mTLS identity returned by the control plane."
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' },
            gap: 1.5,
          }}
        >
          <FormControl fullWidth>
            <InputLabel>DR mode</InputLabel>
            <Select
              value={drMode}
              label="DR mode"
              onChange={(e) => setDrMode(e.target.value)}
            >
              <MenuItem value="NDR">
                DR / NDR · asynchronous checkpoints · 5-minute RPO target
              </MenuItem>
              <MenuItem value="METRO_DR">
                Metro DR · synchronous / storage-mirroring capable site
              </MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Remote site ID"
            value={pairSiteId}
            onChange={(e) => setPairSiteId(e.target.value)}
            placeholder="dr"
          />
          <TextField
            label="Remote site name"
            value={pairSiteName}
            onChange={(e) => setPairSiteName(e.target.value)}
            placeholder="DR Site"
          />
          <TextField
            label="Remote LayerSentry HTTPS endpoint"
            value={pairEndpoint}
            onChange={(e) => setPairEndpoint(e.target.value)}
            placeholder="https://dr.layersentry.example"
          />
          <TextField
            label="Username"
            value={pairUsername}
            onChange={(e) => setPairUsername(e.target.value)}
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            value={pairPassword}
            onChange={(e) => setPairPassword(e.target.value)}
            autoComplete="current-password"
            helperText="Used only for pairing bootstrap and cleared after the request."
          />
        </Box>
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Metro DR is enabled only when the remote site advertises a qualified
          synchronous storage-mirroring capability. NDR uses verified
          checkpoint replication. LayerSentry will reject a mode that the
          selected site cannot support.
        </Alert>
        <Button
          sx={{ mt: 1.5, textTransform: 'none' }}
          variant="contained"
          disabled={
            pairBusy ||
            !pairSiteId.trim() ||
            !pairSiteName.trim() ||
            !pairEndpoint.trim() ||
            !pairUsername.trim() ||
            !pairPassword
          }
          onClick={pairRemoteSite}
        >
          {pairBusy ? 'Pairing site…' : 'Pair and verify site'}
        </Button>

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            Environment isolation profile
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 11, color: colors.text.muted }}>
            PROD, UAT, STAGE and DEV are separate security domains. Cross-environment
            traffic is denied by default; the default application flow is WEB → APP → DB
            inside the same environment only.
          </Typography>
          <Box
            sx={{
              mt: 1,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' },
              gap: 0.75,
            }}
          >
            {environmentNetworks.map((network) => (
              <Box
                key={network.name}
                sx={{
                  p: 1,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 1,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                  {network.name}
                </Typography>
                <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                  {network.environment} · {network.tier}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {!!managementPolicies.length && (
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
              LayerSentry management protection
            </Typography>
            {managementPolicies.map((policy) => (
              <Typography
                key={`${policy.source_site_id}-${policy.target_site_id}`}
                sx={{ mt: 0.5, fontSize: 11, color: colors.text.secondary }}
              >
                {policy.source_site_id} → {policy.target_site_id} · every{' '}
                {durationToText(policy.interval)} · retain {policy.retention} ·
                encrypted configuration, DR catalog, network mappings and recovery secrets
              </Typography>
            ))}
          </Box>
        )}
      </Surface>

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
              {targetSites.map((site) => (
                <MenuItem key={site} value={site}>
                  {site}
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
                .filter(([kind]) => backendAllowed(kind))
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
              <MenuItem
                value="FILESYSTEM_CONSISTENT"
                disabled={!filesystemConsistency}
              >
                Filesystem quiesced · coordinated group
              </MenuItem>
              <MenuItem
                value="APPLICATION_CONSISTENT"
                disabled={!applicationConsistency}
              >
                Application consistent · coordinated group
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

        {!targetSites.length && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            No LayerSentry replication target site is configured. Configure the
            remote site/transport before enabling protection.
          </Alert>
        )}
        {targetSite && targetBackendCatalogBound && !allowedTargetBackends.length && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            The selected recovery site has no qualified Replication v2 target
            backend configured.
          </Alert>
        )}
        {consistency !== 'CRASH_CONSISTENT' && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Filesystem/application consistency is produced only by a coordinated
            protection-group capture using the qualified quiesce provider.
          </Alert>
        )}

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
            · {localSiteId || 'unconfigured source site'} → {targetSite || 'no target site'} ·
            target checkpoint RPO {secondsToText(checkpointSeconds)}.
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
          title="Recovery network mapping and VM checkpoints"
          description="Keep one logical VM at the DR site and choose a retained checkpoint when you recover it. Map the source network to a DR VNet, then use DHCP or an explicitly validated static DR address."
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' },
            gap: 1.5,
          }}
        >
          <TextField
            label="Target cluster ID"
            value={targetClusterId}
            onChange={(e) => setTargetClusterId(e.target.value)}
          />
          <TextField
            label="Target datastore ID"
            value={targetDatastoreId}
            onChange={(e) => setTargetDatastoreId(e.target.value)}
          />
          <TextField
            label="Target DR VNet ID"
            value={targetNetworkId}
            onChange={(e) => setTargetNetworkId(e.target.value)}
            placeholder="DR VNet ID"
            helperText={
              primaryNic
                ? `Source NIC ${primaryNic.id}: ${primaryNic.sourceNetworkName} (network ${primaryNic.sourceNetworkId})`
                : 'Choose a VM to resolve its source network.'
            }
          />
          <FormControl fullWidth>
            <InputLabel>DR address</InputLabel>
            <Select
              value={addressMode}
              label="DR address"
              onChange={(e) => setAddressMode(e.target.value)}
            >
              <MenuItem value="DHCP">DHCP from target DR VNet</MenuItem>
              <MenuItem value="STATIC">Static DR IP</MenuItem>
            </Select>
          </FormControl>
          {addressMode === 'STATIC' && (
            <>
              <TextField
                label="Static DR IP"
                value={staticIp}
                onChange={(e) => setStaticIp(e.target.value)}
                placeholder="10.40.50.60"
              />
              <TextField
                label="Prefix length"
                type="number"
                value={staticPrefix}
                onChange={(e) => setStaticPrefix(Number(e.target.value))}
                inputProps={{ min: 0, max: 128 }}
              />
              <TextField
                label="DR gateway"
                value={staticGateway}
                onChange={(e) => setStaticGateway(e.target.value)}
                placeholder="10.40.50.1"
              />
              <TextField
                label="DR DNS"
                value={staticDns}
                onChange={(e) => setStaticDns(e.target.value)}
                placeholder="10.40.50.53 10.40.50.54"
              />
            </>
          )}
        </Box>

        {nics.length > 1 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            This VM has {nics.length} NICs. The simple mapper will not save an
            incomplete mapping. Use the ordered per-NIC advanced mapper before
            failover so every captured NIC is mapped explicitly.
          </Alert>
        )}

        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            disabled={
              mappingBusy ||
              !selectedVm ||
              !targetSite ||
              !targetNetworkId.trim() ||
              nics.length !== 1
            }
            onClick={saveRecoveryMapping}
            sx={{ textTransform: 'none' }}
          >
            {mappingBusy ? 'Saving mapping…' : 'Save recovery network mapping'}
          </Button>
          <Button
            variant="outlined"
            disabled={!selectedVm || !targetSite}
            onClick={loadVMCheckpointCatalog}
            sx={{ textTransform: 'none' }}
          >
            Load all retained VM checkpoints
          </Button>
        </Box>

        <Box sx={{ mt: 2 }}>
          {checkpointCatalog.map((vmCatalog) => (
            <Box
              key={vmCatalog.workload_id}
              sx={{
                mb: 1.5,
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                {vmCatalog.vm_name}
              </Typography>
              <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                One logical DR VM · workload {vmCatalog.workload_id} ·{' '}
                {vmCatalog.checkpoints?.length || 0} retained checkpoint(s)
              </Typography>
              {(vmCatalog.checkpoints || []).map((checkpoint) => (
                <Box
                  key={checkpoint.recovery_point_id}
                  sx={{
                    mt: 0.75,
                    p: 1,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography sx={{ fontSize: 11, color: colors.text.secondary }}>
                    {dateText(checkpoint.captured_at)} · {checkpoint.kind} ·{' '}
                    {checkpoint.state}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: checkpoint.available_at_site
                        ? colors.status.success
                        : colors.status.warning,
                    }}
                  >
                    {checkpoint.available_at_site
                      ? 'Available at selected DR site'
                      : 'Not available at selected DR site'}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
          {!checkpointCatalog.length && (
            <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
              Load the catalog to see every retained five-minute-RPO recovery
              point for the selected VM.
            </Typography>
          )}
        </Box>
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
                      (Boolean(groupId) &&
                        session.protection_group_id !== groupId) ||
                      (!multiWorkloadGroups &&
                        groupMembers.length >= 1 &&
                        !groupMembers.includes(session.id))
                    }
                  >
                    {session.id} · VM {session.workload_id} · group{' '}
                    {session.protection_group_id || '—'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Dependencies (JSON)"
              value={groupDependencies}
              onChange={(e) => setGroupDependencies(e.target.value)}
              multiline
              minRows={3}
              placeholder='{"database-session":["storage-session"]}'
              helperText="Map each session to prerequisite session IDs. Cycles and non-members are rejected by the coordinator."
            />
            <FormControl fullWidth>
              <InputLabel>Group consistency</InputLabel>
              <Select
                value={groupConsistency}
                label="Group consistency"
                onChange={(e) => setGroupConsistency(e.target.value)}
              >
                <MenuItem value="CRASH_CONSISTENT">Crash consistent</MenuItem>
                <MenuItem
                value="FILESYSTEM_CONSISTENT"
                disabled={!capabilities.application_consistency}
              >
                Filesystem quiesced
              </MenuItem>
              <MenuItem
                value="APPLICATION_CONSISTENT"
                disabled={!capabilities.application_consistency}
              >
                Application consistent
              </MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Alert severity={groupModeQualified ? 'info' : 'warning'} sx={{ mt: 1.5 }}>
            {multiWorkloadGroups
              ? 'Every member session must already use this exact protection-group ID. The dependency DAG is validated and retained for recovery planning; no failover action is exposed here.'
              : 'A qualified multi-workload quiesce provider is not configured. This site can create only single-session crash-consistent protection groups; multi-session and filesystem/application consistency remain unavailable.'}
          </Alert>
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              disabled={
                actionBusy === 'group:configure' ||
                !groupId.trim() ||
                !groupName.trim() ||
                groupMembers.length === 0 ||
                !groupModeQualified ||
                !groupConsistencyQualified
              }
              onClick={async () => {
                setError('')
                setNotice('')
                setActionBusy('group:configure')
                try {
                  const parsedDependencies = JSON.parse(groupDependencies || '{}')
                  if (
                    !parsedDependencies ||
                    Array.isArray(parsedDependencies) ||
                    typeof parsedDependencies !== 'object'
                  ) {
                    throw new Error(
                      'Protection-group dependencies must be a JSON object.'
                    )
                  }
                  await replicationAPI.putProtectionGroup({
                    id: groupId.trim(),
                    name: groupName.trim(),
                    session_ids: groupMembers,
                    dependencies: parsedDependencies,
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
                groupMembers.length === 0 ||
                !groupModeQualified ||
                !groupConsistencyQualified
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