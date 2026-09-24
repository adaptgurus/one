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
import {
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { replicationAPI } from 'client/apps/layersentry/replicationV2'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const vmNics = (vm = {}) =>
  toArray(vm?.TEMPLATE?.NIC)
    .filter((nic) => nic && nic.NIC_ID !== undefined)
    .map((nic, index) => ({
      id: Number(nic.NIC_ID),
      order: index,
      sourceNetworkId: String(nic.NETWORK_ID || ''),
      sourceNetworkName: nic.NETWORK || `NIC ${nic.NIC_ID}`,
    }))

const canonicalNetworkOrder = [
  'prod_web', 'prod_app', 'prod_db',
  'uat_web', 'uat_app', 'uat_db',
  'stage_web', 'stage_app', 'stage_db',
  'dev_web', 'dev_app', 'dev_db',
]

const defaultTargetMapping = () =>
  Object.fromEntries(
    canonicalNetworkOrder.map((name) => [name, { targetNetworkId: '', addressMode: 'DHCP' }])
  )

const DRProductPanel = ({ localSiteId = '', targetSites = [], vms = [] }) => {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [environmentNetworks, setEnvironmentNetworks] = useState([])
  const [pairedSites, setPairedSites] = useState([])
  const [pairBusy, setPairBusy] = useState(false)
  const [pairId, setPairId] = useState('')
  const [pairName, setPairName] = useState('')
  const [pairEndpoint, setPairEndpoint] = useState('')
  const [pairUsername, setPairUsername] = useState('')
  const [pairPassword, setPairPassword] = useState('')
  const [drMode, setDrMode] = useState('NDR')
  const [managementPolicies, setManagementPolicies] = useState([])
  const [managementStatuses, setManagementStatuses] = useState({})
  const [networkBusy, setNetworkBusy] = useState(false)
  const [clusterId, setClusterId] = useState('0')
  const [basePrefix, setBasePrefix] = useState('10.60')
  const [startSubnet, setStartSubnet] = useState(10)
  const [startVlan, setStartVlan] = useState(3000)
  const [vnMad, setVnMad] = useState('802.1Q')
  const [bridge, setBridge] = useState('br0')
  const [physicalDevice, setPhysicalDevice] = useState('')
  const [dns, setDns] = useState('10.10.10.53')
  const [vmId, setVmId] = useState('')
  const [checkpointSite, setCheckpointSite] = useState('')
  const [checkpointCatalog, setCheckpointCatalog] = useState([])
  const [mappingBusy, setMappingBusy] = useState(false)
  const [targetClusterId, setTargetClusterId] = useState('0')
  const [targetDatastoreId, setTargetDatastoreId] = useState('1')
  const [networkMapping, setNetworkMapping] = useState(defaultTargetMapping())
  const [staticIp, setStaticIp] = useState('')
  const [staticPrefix, setStaticPrefix] = useState(24)
  const [staticGateway, setStaticGateway] = useState('')
  const [staticDns, setStaticDns] = useState('')

  const selectedVm = useMemo(
    () => vms.find(({ ID }) => String(ID) === String(vmId)),
    [vms, vmId]
  )
  const selectedNics = useMemo(() => vmNics(selectedVm), [selectedVm])

  const siteChoices = useMemo(() => {
    const set = new Set(toArray(targetSites).map(String))
    pairedSites.forEach((site) => set.add(String(site.id)))
    return [...set]
  }, [pairedSites, targetSites])

  useEffect(() => {
    let active = true
    Promise.all([
      replicationAPI.drEnvironmentNetworks(),
      replicationAPI.drSites().catch(() => ({ sites: [] })),
    ])
      .then(([networks, sites]) => {
        if (!active) return
        setEnvironmentNetworks(networks?.networks || [])
        setPairedSites(sites?.sites || [])
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [])

  const pairSite = async () => {
    setError('')
    setNotice('')
    setPairBusy(true)
    try {
      const result = await replicationAPI.drPairSite({
        id: pairId.trim(),
        name: pairName.trim(),
        endpoint: pairEndpoint.trim(),
        username: pairUsername.trim(),
        password: pairPassword,
        mode: drMode,
      })
      setPairPassword('')
      const site = result?.site
      if (site) {
        setPairedSites((current) => [
          ...current.filter((entry) => entry.id !== site.id),
          site,
        ])
        setCheckpointSite(site.id)
        const source = localSiteId || 'dc'
        const policies = await replicationAPI.drManagementBackupPolicies(source, site.id)
        setManagementPolicies(policies?.policies || [])
      }
      setNotice(
        `Site ${site?.name || pairId} paired. Bootstrap password was discarded; ongoing communication uses ${result?.auth_method || 'mTLS API identity'}.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setPairBusy(false)
    }
  }

  const networkPlan = useMemo(() => {
    const names = environmentNetworks.length
      ? environmentNetworks.map(({ name }) => name)
      : canonicalNetworkOrder
    const dnsList = dns
      .split(/[ ,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    return {
      cluster_id: clusterId.trim(),
      networks: names.map((name, index) => {
        const subnet = Number(startSubnet) + index
        const vlan = Number(startVlan) + index
        return {
          name,
          network_cidr: `${basePrefix}.${subnet}.0/24`,
          start_ip: `${basePrefix}.${subnet}.10`,
          size: 200,
          gateway: `${basePrefix}.${subnet}.1`,
          dns: dnsList,
          vn_mad: vnMad,
          bridge: bridge.trim(),
          physical_device: physicalDevice.trim() || undefined,
          vlan_id: vlan,
        }
      }),
    }
  }, [
    basePrefix,
    bridge,
    clusterId,
    dns,
    environmentNetworks,
    physicalDevice,
    startSubnet,
    startVlan,
    vnMad,
  ])

  const provisionNetworks = async () => {
    setError('')
    setNotice('')
    setNetworkBusy(true)
    try {
      const result = await replicationAPI.drProvisionEnvironmentNetworks(networkPlan)
      const resources = result?.resources || []
      setNotice(
        `${resources.length} environment VNETs provisioned/read back. Cross-environment routing remains deny-by-default.`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setNetworkBusy(false)
    }
  }

  const runManagementBackup = async (source, target) => {
    setError('')
    setNotice('')
    try {
      const status = await replicationAPI.drRunManagementBackup(source, target)
      setManagementStatuses((current) => ({
        ...current,
        [`${source}->${target}`]: status,
      }))
      setNotice(`Encrypted LayerSentry management backup completed: ${source} → ${target}.`)
    } catch (reason) {
      setError(reason.message)
    }
  }

  const refreshManagementStatus = async (source, target) => {
    setError('')
    try {
      const status = await replicationAPI.drManagementBackupStatus(source, target)
      setManagementStatuses((current) => ({
        ...current,
        [`${source}->${target}`]: status,
      }))
    } catch (reason) {
      setError(reason.message)
    }
  }

  const loadCheckpoints = async () => {
    setError('')
    if (!checkpointSite) {
      setError('Choose a paired recovery site first.')
      return
    }
    try {
      const payload = await replicationAPI.drVMCheckpoints('', checkpointSite)
      setCheckpointCatalog(payload?.vms || [])
      setNotice('DR VM checkpoint catalog refreshed.')
    } catch (reason) {
      setError(reason.message)
    }
  }

  const currentVmCatalog = checkpointCatalog.find(
    ({ workload_id: workloadId }) => String(workloadId) === String(vmId)
  )

  const saveRecoveryMapping = async () => {
    setError('')
    setNotice('')
    if (!selectedVm || !checkpointSite || selectedNics.length === 0) {
      setError('Choose a VM, recovery site and VM with at least one NIC.')
      return
    }
    const canonicalBySourceName = Object.fromEntries(
      selectedNics.map((nic) => {
        const key = String(nic.sourceNetworkName || '').toLowerCase()
        return [nic.id, canonicalNetworkOrder.includes(key) ? key : '']
      })
    )
    const nics = selectedNics.map((nic, index) => {
      const sourceCanonical = canonicalBySourceName[nic.id]
      const config = networkMapping[sourceCanonical] || {}
      const targetNetworkId = config.targetNetworkId || ''
      const mode = config.addressMode || 'DHCP'
      const useStatic = mode === 'STATIC'
      return {
        source_nic_id: nic.id,
        source_network_id: nic.sourceNetworkId || sourceCanonical || String(nic.id),
        target_network_id: targetNetworkId,
        address_mode: mode,
        target_ip: useStatic ? staticIp.trim() : undefined,
        guest_network: useStatic
          ? {
              prefix_length: Number(staticPrefix),
              gateway: staticGateway.trim(),
              dns: staticDns
                .split(/[ ,]+/)
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : undefined,
        order: index,
      }
    })
    if (nics.some(({ target_network_id: targetNetworkId }) => !targetNetworkId)) {
      setError(
        'Every VM NIC must be mapped to a target DR VNet. Multi-NIC recovery never drops an unmapped NIC.'
      )
      return
    }
    setMappingBusy(true)
    try {
      await replicationAPI.drPutRecoveryMapping({
        workload_id: String(selectedVm.ID),
        target_site_id: checkpointSite,
        mapping: {
          workload_id: String(selectedVm.ID),
          target_cluster_id: targetClusterId.trim(),
          target_datastore_id: targetDatastoreId.trim(),
          nics,
        },
      })
      setNotice(
        `Recovery mapping saved for ${selectedVm.NAME || selectedVm.ID} with ${nics.length} NIC(s).`
      )
    } catch (reason) {
      setError(reason.message)
    } finally {
      setMappingBusy(false)
    }
  }

  return (
    <Surface sx={{ mt: 2, p: 2.5 }}>
      <SectionHeader
        title="DC / DR site pairing and recovery policy"
        description="Pair two LayerSentry sites once, provision isolated environment networks, protect the LayerSentry management plane in both directions, and map VM recovery networking."
      />

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1.5 }}>{notice}</Alert>}

      <Typography sx={{ fontSize: 13, fontWeight: 750, mb: 1 }}>
        1. Pair recovery site
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 1.25 }}>
        <TextField label="Site ID" value={pairId} onChange={(e) => setPairId(e.target.value)} placeholder="dr-site" />
        <TextField label="Site name" value={pairName} onChange={(e) => setPairName(e.target.value)} placeholder="Secondary DC" />
        <TextField label="LayerSentry HTTPS endpoint" value={pairEndpoint} onChange={(e) => setPairEndpoint(e.target.value)} placeholder="https://dr.example:9444" />
        <FormControl fullWidth>
          <InputLabel>DR mode</InputLabel>
          <Select value={drMode} label="DR mode" onChange={(e) => setDrMode(e.target.value)}>
            <MenuItem value="NDR">DR / NDR · asynchronous checkpoints</MenuItem>
            <MenuItem value="METRO_DR">Metro DR · synchronous storage mirror required</MenuItem>
          </Select>
        </FormControl>
        <TextField label="Pairing username" value={pairUsername} onChange={(e) => setPairUsername(e.target.value)} />
        <TextField label="Pairing password" type="password" value={pairPassword} onChange={(e) => setPairPassword(e.target.value)} autoComplete="new-password" />
      </Box>
      <Button
        variant="contained"
        sx={{ mt: 1.5, textTransform: 'none' }}
        disabled={pairBusy || !pairId.trim() || !pairName.trim() || !pairEndpoint.trim() || !pairUsername.trim() || !pairPassword}
        onClick={pairSite}
      >
        {pairBusy ? 'Pairing…' : 'Pair sites'}
      </Button>
      <Typography sx={{ mt: 0.75, fontSize: 11, color: colors.text.muted }}>
        Username/password is bootstrap-only. The durable site record contains a scoped credential reference and mTLS/API identity, never the plaintext password.
      </Typography>

      <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${colors.border}` }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750, mb: 1 }}>
          2. Isolated environment networks
        </Typography>
        <Typography sx={{ fontSize: 11, color: colors.text.secondary, mb: 1 }}>
          Canonical VNETs: PROD/UAT/STAGE/DEV × WEB/APP/DB. Each receives a unique VLAN/VNI and IPv4 subnet. Cross-environment communication is deny-by-default.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 1.25 }}>
          <TextField label="OpenNebula cluster ID" value={clusterId} onChange={(e) => setClusterId(e.target.value)} />
          <TextField label="Base prefix" value={basePrefix} onChange={(e) => setBasePrefix(e.target.value)} helperText="Example: 10.60" />
          <TextField label="First /24 subnet" type="number" value={startSubnet} onChange={(e) => setStartSubnet(Number(e.target.value))} />
          <TextField label="First VLAN/VNI" type="number" value={startVlan} onChange={(e) => setStartVlan(Number(e.target.value))} />
          <FormControl fullWidth>
            <InputLabel>Network driver</InputLabel>
            <Select value={vnMad} label="Network driver" onChange={(e) => setVnMad(e.target.value)}>
              <MenuItem value="802.1Q">802.1Q VLAN</MenuItem>
              <MenuItem value="vxlan">VXLAN</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Bridge" value={bridge} onChange={(e) => setBridge(e.target.value)} />
          <TextField label="Physical device (optional)" value={physicalDevice} onChange={(e) => setPhysicalDevice(e.target.value)} />
          <TextField label="DNS" value={dns} onChange={(e) => setDns(e.target.value)} helperText="Space or comma separated" />
        </Box>
        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {(environmentNetworks.length ? environmentNetworks : canonicalNetworkOrder.map((name) => ({ name }))).map(({ name }) => (
            <Box key={name} sx={{ px: 1, py: 0.5, border: `1px solid ${colors.border}`, borderRadius: 1 }}>
              <Typography sx={{ fontSize: 10 }}>{name}</Typography>
            </Box>
          ))}
        </Box>
        <Button
          variant="outlined"
          sx={{ mt: 1.5, textTransform: 'none' }}
          disabled={networkBusy}
          onClick={provisionNetworks}
        >
          {networkBusy ? 'Provisioning…' : 'Provision / verify 12 VNETs'}
        </Button>
      </Box>

      <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${colors.border}` }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750, mb: 1 }}>
          3. LayerSentry management backup
        </Typography>
        <Typography sx={{ fontSize: 11, color: colors.text.secondary, mb: 1 }}>
          Configuration, DR catalog, network mappings and encrypted secret recovery material are protected every five minutes in both directions.
        </Typography>
        {managementPolicies.map((policy) => {
          const key = `${policy.source_site_id}->${policy.target_site_id}`
          const status = managementStatuses[key]
          return (
            <Box key={key} sx={{ mt: 0.75, p: 1, border: `1px solid ${colors.border}`, borderRadius: 1 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{key}</Typography>
              <Typography sx={{ fontSize: 10, color: colors.text.secondary }}>
                5-minute encrypted policy · retain {policy.retention} · {status?.healthy === true ? 'Healthy' : status?.message || 'Not yet verified'}
              </Typography>
              <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75 }}>
                <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} onClick={() => runManagementBackup(policy.source_site_id, policy.target_site_id)}>
                  Backup now
                </Button>
                <Button size="small" variant="text" sx={{ textTransform: 'none' }} onClick={() => refreshManagementStatus(policy.source_site_id, policy.target_site_id)}>
                  Refresh status
                </Button>
              </Box>
            </Box>
          )
        })}
        {!managementPolicies.length && (
          <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
            Pair a recovery site to create the bidirectional management-backup policy.
          </Typography>
        )}
      </Box>

      <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${colors.border}` }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750, mb: 1 }}>
          4. VM checkpoint catalog and recovery network mapping
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 1.25 }}>
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
            <Select value={checkpointSite} label="Recovery site" onChange={(e) => setCheckpointSite(e.target.value)}>
              {siteChoices.map((site) => <MenuItem key={site} value={site}>{site}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Target cluster ID" value={targetClusterId} onChange={(e) => setTargetClusterId(e.target.value)} />
          <TextField label="Target datastore ID" value={targetDatastoreId} onChange={(e) => setTargetDatastoreId(e.target.value)} />
        </Box>
        <Button variant="outlined" sx={{ mt: 1.25, textTransform: 'none' }} onClick={loadCheckpoints}>
          Refresh DR checkpoints
        </Button>

        {currentVmCatalog && (
          <Box sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
              {currentVmCatalog.vm_name} · {currentVmCatalog.coverage_healthy ? 'RPO coverage healthy' : 'RPO coverage gap'}
            </Typography>
            {toArray(currentVmCatalog.checkpoints).slice(0, 12).map((checkpoint) => (
              <Typography key={checkpoint.id} sx={{ fontSize: 10, color: colors.text.secondary }}>
                {new Date(checkpoint.committed_at).toLocaleString()} · G{checkpoint.generation} · {checkpoint.consistency}
              </Typography>
            ))}
          </Box>
        )}

        {selectedVm && selectedNics.length > 0 && (
          <Box sx={{ mt: 1.5, display: 'grid', gap: 1 }}>
            {selectedNics.map((nic) => {
              const sourceKey = String(nic.sourceNetworkName || '').toLowerCase()
              const canonical = canonicalNetworkOrder.includes(sourceKey) ? sourceKey : ''
              const config = networkMapping[canonical] || { targetNetworkId: '', addressMode: 'DHCP' }
              return (
                <Box key={nic.id} sx={{ p: 1, border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                    NIC {nic.id} · {nic.sourceNetworkName}
                  </Typography>
                  <Box sx={{ mt: 0.75, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 1 }}>
                    <TextField
                      label="Target DR VNet ID"
                      value={config.targetNetworkId || ''}
                      onChange={(e) =>
                        setNetworkMapping((current) => ({
                          ...current,
                          [canonical]: { ...config, targetNetworkId: e.target.value },
                        }))
                      }
                      helperText={canonical ? `Source profile: ${canonical}` : 'Map this source network explicitly'}
                    />
                    <FormControl fullWidth>
                      <InputLabel>Address mode</InputLabel>
                      <Select
                        value={config.addressMode || 'DHCP'}
                        label="Address mode"
                        onChange={(e) =>
                          setNetworkMapping((current) => ({
                            ...current,
                            [canonical]: { ...config, addressMode: e.target.value },
                          }))
                        }
                      >
                        <MenuItem value="DHCP">DHCP</MenuItem>
                        <MenuItem value="STATIC">Static DR IP</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Box>
              )
            })}
            {Object.values(networkMapping).some(({ addressMode }) => addressMode === 'STATIC') && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 1 }}>
                <TextField label="Static DR IP" value={staticIp} onChange={(e) => setStaticIp(e.target.value)} />
                <TextField label="Prefix length" type="number" value={staticPrefix} onChange={(e) => setStaticPrefix(Number(e.target.value))} />
                <TextField label="Gateway" value={staticGateway} onChange={(e) => setStaticGateway(e.target.value)} />
                <TextField label="DNS" value={staticDns} onChange={(e) => setStaticDns(e.target.value)} />
              </Box>
            )}
            <Button variant="contained" sx={{ textTransform: 'none' }} disabled={mappingBusy} onClick={saveRecoveryMapping}>
              {mappingBusy ? 'Saving…' : 'Save recovery network mapping'}
            </Button>
          </Box>
        )}
      </Box>
    </Surface>
  )
}

export default DRProductPanel
