/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems
 * Licensed under the Apache License, Version 2.0.
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc */
import { useEffect, useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import {
  CheckCircle,
  NavArrowLeft,
  WarningTriangle,
} from 'iconoir-react'
import { PageFrame, Surface } from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  FALLBACK_BLUEPRINTS,
  SERVICE_BLUEPRINT_API,
  SERVICE_BLUEPRINT_PREFLIGHT_API,
  WIZARD_STEPS,
  createDraftForBlueprint,
  getEdition,
  getTopologies,
  getVersionWarning,
  getVersions,
  makeNodes,
  nodeCountForTopology,
  validateDraft,
} from 'client/apps/layersentry/serviceBlueprints'

const Row = ({ children }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
      gap: 2,
    }}
  >
    {children}
  </Box>
)

const SelectField = ({
  label,
  value,
  onChange,
  children,
  disabled = false,
  helperText,
}) => (
  <FormControl fullWidth disabled={disabled}>
    <InputLabel>{label}</InputLabel>
    <Select
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </Select>
    {helperText && (
      <Typography sx={{ mt: 0.5, fontSize: 11, color: colors.text.secondary }}>
        {helperText}
      </Typography>
    )}
  </FormControl>
)

const displayQualification = (value) =>
  String(value || 'NOT_TESTED').replaceAll('_', ' ')

const topologyToBackend = (value = '') => {
  const mapping = {
    Standalone: 'standalone',
    '3-node HA': 'ha3',
    '5-node HA': 'ha5',
    'HA + DR': 'ha_dr',
    '3-node InnoDB Cluster': 'innodb-cluster3',
    '5-node InnoDB Cluster': 'innodb-cluster5',
    'ClusterSet DR': 'clusterset_dr',
    Replication: 'replication',
    '3-node PXC': 'pxc3',
    '5-node PXC': 'pxc5',
    '3-node Galera': 'galera3',
    '5-node Galera': 'galera5',
    'Async DR': 'async_dr',
    '3-node Replica Set': 'replicaset3',
    '5-node Replica Set': 'replicaset5',
    Sharded: 'sharded',
    Sentinel: 'sentinel',
    '6-node Cluster': 'cluster6',
    Replicated: 'replicated',
    'Sharded + Replicated': 'sharded_replicated',
    '3-node Cluster': 'cluster3',
    '5-node Cluster': 'cluster5',
    'Multi-DC': 'multidc',
    'Multi-zone': 'multizone',
    'Multi-site': 'multisite',
    '3-node Quorum': 'cluster3',
    '5-node Quorum': 'cluster5',
    'Federation DR': 'federation_dr',
    '3-node KRaft': 'kraft3',
    '5-node KRaft': 'kraft5',
    'Separate Controllers': 'separate_controllers',
    'Production Cluster': 'production_cluster',
    'Multi-cluster DR': 'multicluster_dr',
    'Reverse Proxy': 'reverse_proxy',
    'HA Pair': 'ha_pair',
    'Load Balanced': 'load_balanced',
    'HA Cluster': 'ha_cluster',
    Distributed: 'distributed',
    '3-node Raft': 'raft3',
    '5-node Raft': 'raft5',
    'Controller + Agents': 'controller_agents',
    'Dedicated Managers + Data': 'dedicated_managers_data',
    'PostgreSQL HA backend': 'postgresql_ha_backend',
    'Node Collector': 'node_collector',
    'Clustered Collectors': 'clustered_collectors',
  }

  return mapping[value] || value
}

const buildDesiredState = (draft) => ({
  blueprint_id: draft.blueprintId,
  edition: draft.edition || null,
  version: draft.version,
  deployment: {
    topology: topologyToBackend(draft.topology),
    node_count: Number(draft.nodeCount),
    workload: String(draft.workload || '').toLowerCase(),
    environment: 'production',
  },
  capacity: {
    vcpu: Number(draft.vcpu),
    memory_gib: Number(draft.memoryGiB),
    expected_data_gib: Number(draft.expectedDataGiB) || 0,
    expected_connections: Number(draft.expectedConnections) || 0,
  },
  storage: (draft.storage || []).map((volume) => ({
    role: String(volume.role || '')
      .toLowerCase()
      .replaceAll(' / ', '_')
      .replaceAll(' ', '_'),
    layout: volume.layout,
    mountpoint: volume.mountpoint,
    filesystem: volume.filesystem || 'xfs',
    storage_class: volume.storageClass,
    disks: (volume.diskSizes || []).map((size) => ({
      size_gib: Number(size),
    })),
  })),
  network: {
    domain: draft.domain,
    dns_servers: String(draft.dnsServers || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    nodes: draft.nodes.map((node) => ({
      fqdn: node.fqdn,
      ip_mode: draft.ipMode,
      ip: draft.ipMode === 'static' ? node.ip : '',
      failure_domain: node.failureDomain,
    })),
    endpoint: {
      mode: draft.endpointMode,
      fqdn: draft.serviceFqdn,
      vip: draft.vip,
      backend_port: Number(draft.backendPort),
      health_check: draft.healthCheck,
    },
  },
  tuning: {
    profile: draft.tuningProfile,
  },
  backup: draft.backupEnabled
    ? {
        enabled: true,
        engine: draft.backupEngine,
        retention_days: Number(draft.retentionDays),
        pitr: draft.pitr,
        pitr_window_hours: Number(draft.pitrWindowHours),
      }
    : { enabled: false, pitr: false },
  dr: draft.drEnabled
    ? {
        enabled: true,
        target_site: draft.drTarget,
        rpo_minutes: Number(draft.rpoMinutes),
        rto_minutes: Number(draft.rtoMinutes),
        replication_mode: 'async',
      }
    : { enabled: false },
  security: {
    hardening_profile: draft.hardeningProfile,
    tls: draft.tls,
    ssh_auth: draft.sshAuth,
  },
  observability: {
    metrics: draft.metrics,
    logs: draft.logs,
  },
  package_source: {
    mode: draft.packageSourceMode,
    repo_url: draft.repoUrl,
    bundle_id: draft.bundleId,
    allow_public_fallback: false,
  },
  product_options: {
    pg_stat_statements: draft.pgStatStatements,
    postgis: draft.postgis,
    postgis_databases: draft.postgisDatabases,
    pgbouncer: draft.pgbouncer,
    barman: draft.barman,
  },
})

const mergeRuntimeCatalog = (payload) => {
  const runtimeEntries = Array.isArray(payload) ? payload : payload?.items || []
  if (!runtimeEntries.length) {
    return {
      entries: FALLBACK_BLUEPRINTS,
      source: 'fallback',
      deploymentAvailable: false,
      draftsAvailable: false,
      blueprintStudioAvailable: false,
    }
  }

  const entries = FALLBACK_BLUEPRINTS.map((fallback) => {
    const runtime = runtimeEntries.find(({ id }) => id === fallback.id)
    if (!runtime) return fallback

    return {
      ...fallback,
      qualification: runtime.qualification || fallback.qualification,
      productionSelectable:
        runtime.production_selectable ??
        runtime.productionSelectable ??
        fallback.productionSelectable,
    }
  })

  return {
    entries,
    source: 'backend',
    deploymentAvailable: Boolean(
      payload?.capabilities?.deploy || payload?.deployment_available
    ),
    draftsAvailable: Boolean(
      payload?.capabilities?.drafts || payload?.drafts_available
    ),
    blueprintStudioAvailable: Boolean(
      payload?.blueprint_studio?.enabled_for_admin &&
        payload?.capabilities?.blueprint_studio
    ),
  }
}

const ProductionServiceWizard = () => {
  const history = useHistory()
  const [step, setStep] = useState(0)
  const [catalog, setCatalog] = useState(FALLBACK_BLUEPRINTS)
  const [catalogSource, setCatalogSource] = useState('fallback')
  const [deploymentAvailable, setDeploymentAvailable] = useState(false)
  const [draftsAvailable, setDraftsAvailable] = useState(false)
  const [blueprintStudioAvailable, setBlueprintStudioAvailable] =
    useState(false)
  const [draft, setDraft] = useState(() =>
    createDraftForBlueprint(FALLBACK_BLUEPRINTS[0])
  )
  const [backendIssues, setBackendIssues] = useState([])
  const [preflightState, setPreflightState] = useState('not-run')
  const [preflightMessage, setPreflightMessage] = useState('')

  useEffect(() => {
    let active = true

    fetch(SERVICE_BLUEPRINT_API, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)

        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const runtime = mergeRuntimeCatalog(payload)
        setCatalog(runtime.entries)
        setCatalogSource(runtime.source)
        setDeploymentAvailable(runtime.deploymentAvailable)
        setDraftsAvailable(runtime.draftsAvailable)
        setBlueprintStudioAvailable(runtime.blueprintStudioAvailable)
      })
      .catch(() => {
        if (!active) return
        setCatalog(FALLBACK_BLUEPRINTS)
        setCatalogSource('fallback')
        setDeploymentAvailable(false)
        setDraftsAvailable(false)
        setBlueprintStudioAvailable(false)
      })

    return () => {
      active = false
    }
  }, [])

  const blueprint = useMemo(
    () => catalog.find(({ id }) => id === draft.blueprintId),
    [catalog, draft.blueprintId]
  )

  const errors = useMemo(
    () => validateDraft(draft, blueprint),
    [draft, blueprint]
  )

  const allIssues = [...errors, ...backendIssues]

  const invalidate = () => {
    setBackendIssues([])
    setPreflightState('not-run')
    setPreflightMessage('')
  }

  const update = (key, value) => {
    invalidate()
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const selectBlueprint = (id) => {
    const selected = catalog.find((item) => item.id === id)
    if (!selected) return
    invalidate()
    setDraft((current) => createDraftForBlueprint(selected, current))
  }

  const selectEdition = (editionId) => {
    const versions = getVersions(blueprint, editionId)
    const topologies = getTopologies(blueprint, editionId)
    const topology = topologies[0] || ''
    const nodeCount = nodeCountForTopology(topology)

    invalidate()
    setDraft((current) => ({
      ...current,
      edition: editionId,
      version: versions[0] || '',
      topology,
      nodeCount,
      nodes: makeNodes(
        current.blueprintId,
        nodeCount,
        current.domain,
        current.ipMode
      ),
    }))
  }

  const selectTopology = (topology) => {
    const nodeCount = nodeCountForTopology(topology)
    invalidate()
    setDraft((current) => ({
      ...current,
      topology,
      nodeCount,
      nodes: makeNodes(
        current.blueprintId,
        nodeCount,
        current.domain,
        current.ipMode,
        current.nodes
      ),
    }))
  }

  const changeNodeCount = (value) => {
    const nodeCount = Math.max(1, Number(value) || 1)
    invalidate()
    setDraft((current) => ({
      ...current,
      nodeCount,
      nodes: makeNodes(
        current.blueprintId,
        nodeCount,
        current.domain,
        current.ipMode,
        current.nodes
      ),
    }))
  }

  const updateStorage = (index, patch) => {
    invalidate()
    setDraft((current) => ({
      ...current,
      storage: current.storage.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  const updateNode = (index, patch) => {
    invalidate()
    setDraft((current) => ({
      ...current,
      nodes: current.nodes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  const updateDomain = (domain) => {
    invalidate()
    setDraft((current) => {
      const generated = makeNodes(
        current.blueprintId,
        current.nodeCount,
        domain,
        current.ipMode
      )

      return {
        ...current,
        domain,
        nodes: current.nodes.map((node, index) => ({
          ...node,
          fqdn:
            !node.fqdn || node.fqdn.endsWith('.example.internal')
              ? generated[index].fqdn
              : node.fqdn,
        })),
      }
    })
  }

  const updateIpMode = (ipMode) => {
    invalidate()
    setDraft((current) => ({
      ...current,
      ipMode,
      nodes: current.nodes.map((node) => ({ ...node, ipMode })),
    }))
  }

  const runPreflight = async () => {
    setBackendIssues([])
    if (errors.length) {
      setPreflightState('failed')
      setPreflightMessage('Fix the validation errors before backend preflight.')

      return
    }

    setPreflightState('running')
    setPreflightMessage('Running authoritative backend preflight…')

    try {
      const response = await fetch(SERVICE_BLUEPRINT_PREFLIGHT_API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildDesiredState(draft)),
      })
      if (!response.ok) throw new Error(`preflight HTTP ${response.status}`)
      const result = await response.json()
      const issues = result.issues || []
      setBackendIssues(issues)

      if (result.valid) {
        setPreflightState('passed')
        setPreflightMessage(
          'Authoritative preflight passed. Deployment is enabled only for a promoted production tuple with an available execution backend.'
        )
      } else {
        setPreflightState('failed')
        setPreflightMessage('Authoritative preflight rejected this request.')
      }
    } catch (error) {
      setPreflightState('unavailable')
      setPreflightMessage(
        'Authoritative service-blueprint preflight is unavailable. No production deployment can start from local-only validation.'
      )
    }
  }

  const renderService = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Choose a production service
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        LayerSentry selects the qualified operating system and exact patch.
        Customers choose business requirements, not arbitrary compatibility
        combinations.
      </Typography>
      {catalogSource !== 'backend' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Runtime catalog is unavailable. This fail-closed engineering catalog
          is read-only and cannot deploy.
        </Alert>
      )}
      {[...new Set(catalog.map(({ category }) => category))].map((category) => (
        <Box key={category} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1 }}>
            {category}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(3, 1fr)',
              },
              gap: 1.25,
            }}
          >
            {catalog
              .filter((item) => item.category === category)
              .map((item) => (
                <Surface
                  key={item.id}
                  onClick={() => selectBlueprint(item.id)}
                  sx={{
                    p: 1.5,
                    cursor: 'pointer',
                    border: `1px solid ${
                      draft.blueprintId === item.id
                        ? colors.brand.primary
                        : colors.border
                    }`,
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
                    {item.name}
                  </Typography>
                  <Typography
                    sx={{
                      color: colors.text.secondary,
                      fontSize: 11.5,
                      mt: 0.5,
                    }}
                  >
                    OS selected by LayerSentry: {item.preferredOs}
                  </Typography>
                  <Chip
                    size="small"
                    label={displayQualification(item.qualification)}
                    sx={{ mt: 1 }}
                  />
                </Surface>
              ))}
          </Box>
        </Box>
      ))}
    </>
  )

  const renderDeployment = () => {
    const editionSpec = getEdition(blueprint, draft.edition)
    const versions = getVersions(blueprint, draft.edition)
    const topologies = getTopologies(blueprint, draft.edition)
    const versionWarning = getVersionWarning(
      blueprint,
      draft.edition,
      draft.version
    )

    return (
      <>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Deployment & Version
        </Typography>
        <Row>
          <TextField label="Service" value={blueprint?.name || ''} disabled />
          <TextField
            label="LayerSentry selected OS"
            value={blueprint?.preferredOs || ''}
            disabled
            helperText="The customer cannot override the certified OS tuple."
          />
          {!!blueprint?.editions?.length && (
            <SelectField
              label="Edition"
              value={draft.edition}
              onChange={selectEdition}
            >
              {blueprint.editions.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label}
                </MenuItem>
              ))}
            </SelectField>
          )}
          <SelectField
            label="Version"
            value={draft.version}
            onChange={(value) => update('version', value)}
          >
            {versions.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SelectField>
          <SelectField
            label="Topology"
            value={draft.topology}
            onChange={selectTopology}
          >
            {topologies.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SelectField>
          <TextField
            type="number"
            label="Node count"
            value={draft.nodeCount}
            onChange={(event) => changeNodeCount(event.target.value)}
            helperText="Fixed topologies are revalidated server-side."
          />
        </Row>

        {!!versionWarning && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {versionWarning}
          </Alert>
        )}
        {editionSpec?.label && (
          <Typography
            sx={{ mt: 1.5, color: colors.text.secondary, fontSize: 12 }}
          >
            Selected edition: {editionSpec.label}
          </Typography>
        )}

        {draft.blueprintId === 'postgresql' && (
          <Surface sx={{ p: 2, mt: 2 }}>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>
              PostgreSQL production extensions
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.pgStatStatements}
                  onChange={(event) =>
                    update('pgStatStatements', event.target.checked)
                  }
                />
              }
              label="pg_stat_statements (recommended; enabled by default)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.postgis}
                  onChange={(event) => update('postgis', event.target.checked)}
                />
              }
              label="PostGIS 3.6.4 geospatial profile"
            />
            {draft.postgis && (
              <TextField
                fullWidth
                sx={{ mt: 1 }}
                label="Enable PostGIS in databases"
                placeholder="gis, orders_geo"
                value={draft.postgisDatabases}
                onChange={(event) =>
                  update('postgisDatabases', event.target.value)
                }
                helperText="PostGIS is enabled only in the databases listed here."
              />
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.pgbouncer}
                  onChange={(event) =>
                    update('pgbouncer', event.target.checked)
                  }
                />
              }
              label="PgBouncer"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.barman}
                  onChange={(event) => update('barman', event.target.checked)}
                />
              }
              label="Barman backup / WAL archive / PITR"
            />
          </Surface>
        )}
      </>
    )
  }

  const renderCapacity = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Capacity & Workload
      </Typography>
      <Row>
        <TextField
          type="number"
          label="vCPU per node"
          value={draft.vcpu}
          onChange={(event) => update('vcpu', Number(event.target.value))}
        />
        <TextField
          type="number"
          label="Memory per node (GiB)"
          value={draft.memoryGiB}
          onChange={(event) => update('memoryGiB', Number(event.target.value))}
        />
        <TextField
          type="number"
          label="Expected data size (GiB)"
          value={draft.expectedDataGiB}
          onChange={(event) =>
            update('expectedDataGiB', Number(event.target.value))
          }
        />
        <TextField
          type="number"
          label="Expected connections"
          value={draft.expectedConnections}
          onChange={(event) =>
            update('expectedConnections', Number(event.target.value))
          }
        />
        <SelectField
          label="Workload profile"
          value={draft.workload}
          onChange={(value) => update('workload', value)}
        >
          {(blueprint?.workloads || ['General']).map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </SelectField>
        <SelectField
          label="OS / application tuning"
          value={draft.tuningProfile}
          onChange={(value) => update('tuningProfile', value)}
        >
          <MenuItem value="resource-aware-production">
            Resource-aware production (recommended)
          </MenuItem>
          <MenuItem value="vendor-default-safe">
            Vendor defaults / compatibility
          </MenuItem>
        </SelectField>
      </Row>
      <Alert severity="info" sx={{ mt: 2 }}>
        LayerSentry uses CPU, RAM, storage and workload for safe baseline
        operating-system and application sizing. It does not rewrite SQL,
        indexes or application schemas.
      </Alert>
    </>
  )

  const renderStorage = () => (
    <>
      <Typography variant="h6">Storage</Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Storage fields are generated for the selected product. Striped disks
        must be the same size and use one qualified storage class.
      </Typography>
      {draft.storage.map((volume, index) => (
        <Surface key={`${volume.role}-${index}`} sx={{ p: 2, mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>
            {volume.role}
          </Typography>
          <Row>
            <TextField
              label="Mount point"
              value={volume.mountpoint}
              onChange={(event) =>
                updateStorage(index, { mountpoint: event.target.value })
              }
            />
            <SelectField
              label="Layout"
              value={volume.layout}
              onChange={(value) =>
                updateStorage(index, {
                  layout: value,
                  diskSizes:
                    value === 'stripe'
                      ? [
                          volume.diskSizes?.[0] || 100,
                          volume.diskSizes?.[0] || 100,
                        ]
                      : [volume.diskSizes?.[0] || 100],
                })
              }
            >
              <MenuItem value="single">Single disk</MenuItem>
              <MenuItem value="lvm">LVM</MenuItem>
              <MenuItem value="stripe">Striped disks</MenuItem>
              <MenuItem value="existing_san_lun">Existing SAN/LUN</MenuItem>
              <MenuItem value="existing_mount">Existing mount</MenuItem>
            </SelectField>
            <TextField
              label="Storage class / pool"
              value={volume.storageClass}
              onChange={(event) =>
                updateStorage(index, { storageClass: event.target.value })
              }
            />
            <TextField
              label="Disk sizes (GiB, comma separated)"
              value={volume.diskSizes.join(',')}
              onChange={(event) =>
                updateStorage(index, {
                  diskSizes: event.target.value
                    .split(',')
                    .map((value) => Number(value.trim()))
                    .filter(Boolean),
                })
              }
              helperText={
                volume.layout === 'stripe'
                  ? 'All stripe members must have exactly the same provisioned size.'
                  : ''
              }
            />
          </Row>
        </Surface>
      ))}
      <Alert severity="warning">
        RAID0/striping does not provide redundancy. Production preflight must
        prove a qualified redundant lower storage layer before an unprotected
        stripe can be promoted.
      </Alert>
    </>
  )

  const renderNetwork = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Network & DNS
      </Typography>
      <Row>
        <TextField
          label="DNS domain"
          placeholder="prod.example.internal"
          value={draft.domain}
          onChange={(event) => updateDomain(event.target.value)}
        />
        <TextField
          label="Service FQDN"
          placeholder="postgres-prod.prod.example.internal"
          value={draft.serviceFqdn}
          onChange={(event) => update('serviceFqdn', event.target.value)}
        />
        <TextField
          label="DNS servers"
          placeholder="10.20.30.10, 10.20.30.11"
          value={draft.dnsServers}
          onChange={(event) => update('dnsServers', event.target.value)}
        />
        <SelectField
          label="Node IP assignment"
          value={draft.ipMode}
          onChange={updateIpMode}
        >
          <MenuItem value="auto">
            Allocate from LayerSentry network
          </MenuItem>
          <MenuItem value="static">Static IP addresses</MenuItem>
        </SelectField>
      </Row>

      <Typography sx={{ mt: 2.5, mb: 1, fontWeight: 800 }}>
        Node identities
      </Typography>
      {draft.nodes.map((node, index) => (
        <Surface key={`node-${index}`} sx={{ p: 1.5, mb: 1 }}>
          <Row>
            <TextField
              label={`Node ${index + 1} FQDN`}
              value={node.fqdn}
              onChange={(event) =>
                updateNode(index, { fqdn: event.target.value })
              }
            />
            {draft.ipMode === 'static' ? (
              <TextField
                label={`Node ${index + 1} static IP`}
                value={node.ip}
                onChange={(event) =>
                  updateNode(index, { ip: event.target.value })
                }
              />
            ) : (
              <TextField
                label={`Node ${index + 1} IP`}
                value="Allocated during authoritative preflight"
                disabled
              />
            )}
            <TextField
              label="Failure domain"
              value={node.failureDomain}
              onChange={(event) =>
                updateNode(index, { failureDomain: event.target.value })
              }
              helperText="For example host-a, rack-a or zone-a."
            />
          </Row>
        </Surface>
      ))}
      <Alert severity="info" sx={{ mt: 2 }}>
        Backend preflight verifies subnet membership, duplicate IPs, DNS
        conflicts, gateway/address capacity, forward DNS and the service VIP
        before any VM is created.
      </Alert>
    </>
  )

  const renderHa = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        HA & Load Balancer
      </Typography>
      <Row>
        <SelectField
          label="Service endpoint"
          value={draft.endpointMode}
          onChange={(value) => update('endpointMode', value)}
        >
          <MenuItem value="layersentry_managed">
            LayerSentry managed HA VIP/LB
          </MenuItem>
          <MenuItem value="external_lb">
            Existing hardware/software load balancer
          </MenuItem>
          <MenuItem value="product_native">
            Qualified product-native endpoint
          </MenuItem>
        </SelectField>
        {draft.endpointMode === 'external_lb' && (
          <TextField
            label="External VIP / address"
            value={draft.vip}
            onChange={(event) => update('vip', event.target.value)}
          />
        )}
        <TextField
          type="number"
          label="Backend service port"
          value={draft.backendPort}
          onChange={(event) =>
            update('backendPort', Number(event.target.value))
          }
        />
        <SelectField
          label="Health check"
          value={draft.healthCheck}
          onChange={(value) => update('healthCheck', value)}
        >
          <MenuItem value="tcp">TCP</MenuItem>
          <MenuItem value="http">HTTP</MenuItem>
          <MenuItem value="https">HTTPS</MenuItem>
        </SelectField>
      </Row>
      <Alert severity="info" sx={{ mt: 2 }}>
        Quorum members must be placed across distinct qualified OpenNebula
        failure domains. A multi-node service on one hypervisor is not
        production HA.
      </Alert>
    </>
  )

  const renderBackup = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Backup & Retention
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.backupEnabled}
            onChange={(event) =>
              update('backupEnabled', event.target.checked)
            }
          />
        }
        label="Application-aware backup"
      />
      {draft.backupEnabled && (
        <>
          <Row>
            <SelectField
              label="Backup engine"
              value={draft.backupEngine}
              onChange={(value) => update('backupEngine', value)}
            >
              {(blueprint?.backupEngines || ['Application-native']).map(
                (value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                )
              )}
            </SelectField>
            <TextField
              type="number"
              label="Retention (days)"
              value={draft.retentionDays}
              onChange={(event) =>
                update('retentionDays', Number(event.target.value))
              }
            />
            <TextField
              type="number"
              label="PITR recovery window (hours)"
              value={draft.pitrWindowHours}
              onChange={(event) =>
                update('pitrWindowHours', Number(event.target.value))
              }
              disabled={!draft.pitr}
            />
          </Row>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.pitr}
                onChange={(event) => update('pitr', event.target.checked)}
              />
            }
            label="Point-in-time recovery where supported"
          />
        </>
      )}
      <Alert severity="warning" sx={{ mt: 2 }}>
        A VM/storage snapshot is not treated as database backup. Production
        qualification requires a real restore/PITR exercise where supported.
      </Alert>
    </>
  )

  const renderDr = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Disaster Recovery
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.drEnabled}
            onChange={(event) => update('drEnabled', event.target.checked)}
          />
        }
        label="Configure a qualified DR topology"
      />
      {draft.drEnabled && (
        <Row>
          <TextField
            label="Target site"
            value={draft.drTarget}
            onChange={(event) => update('drTarget', event.target.value)}
          />
          <TextField
            type="number"
            label="RPO (minutes)"
            value={draft.rpoMinutes}
            onChange={(event) =>
              update('rpoMinutes', Number(event.target.value))
            }
          />
          <TextField
            type="number"
            label="RTO (minutes)"
            value={draft.rtoMinutes}
            onChange={(event) =>
              update('rtoMinutes', Number(event.target.value))
            }
          />
        </Row>
      )}
      <Alert severity="info" sx={{ mt: 2 }}>
        Cross-site replication defaults to asynchronous unless the exact
        product topology has separately qualified synchronous WAN behavior.
      </Alert>
    </>
  )

  const renderSecurity = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Security & Access
      </Typography>
      <Row>
        <SelectField
          label="Hardening profile"
          value={draft.hardeningProfile}
          onChange={(value) => update('hardeningProfile', value)}
        >
          <MenuItem value="standard-production">
            Standard production hardening
          </MenuItem>
          <MenuItem value="cis-qualified">
            CIS-aligned (qualified tuples only)
          </MenuItem>
        </SelectField>
        <SelectField
          label="OS access"
          value={draft.sshAuth}
          onChange={(value) => update('sshAuth', value)}
        >
          <MenuItem value="ssh_key_sudo">
            SSH key + sudo (recommended)
          </MenuItem>
          <MenuItem value="password_sudo">Password + sudo</MenuItem>
          <MenuItem value="root_bootstrap">
            Temporary root bootstrap
          </MenuItem>
        </SelectField>
      </Row>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.tls}
            onChange={(event) => update('tls', event.target.checked)}
          />
        }
        label="TLS enabled"
      />
      <Alert severity="info">
        Rocky stays SELinux enforcing; Ubuntu keeps AppArmor where applicable.
        Firewall, auditing, least-privilege service accounts and secure file
        permissions remain enabled.
      </Alert>
    </>
  )

  const renderObservability = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Observability
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.metrics}
            onChange={(event) => update('metrics', event.target.checked)}
          />
        }
        label="Metrics / product exporter"
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.logs}
            onChange={(event) => update('logs', event.target.checked)}
          />
        }
        label="Central logs"
      />
    </>
  )

  const renderPackageSource = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Package Source / Offline
      </Typography>
      <SelectField
        label="Installation source"
        value={draft.packageSourceMode}
        onChange={(value) => update('packageSourceMode', value)}
      >
        <MenuItem value="managed_online">Approved online repositories</MenuItem>
        <MenuItem value="local_mirror">
          Customer local repository / mirror
        </MenuItem>
        <MenuItem value="airgapped_bundle">
          LayerSentry air-gapped bundle
        </MenuItem>
      </SelectField>
      {draft.packageSourceMode === 'local_mirror' && (
        <TextField
          fullWidth
          sx={{ mt: 2 }}
          label="Internal repository URL / FQDN"
          value={draft.repoUrl}
          onChange={(event) => update('repoUrl', event.target.value)}
        />
      )}
      {draft.packageSourceMode === 'airgapped_bundle' && (
        <TextField
          fullWidth
          sx={{ mt: 2 }}
          label="Qualified bundle ID"
          value={draft.bundleId}
          onChange={(event) => update('bundleId', event.target.value)}
        />
      )}
      {draft.packageSourceMode !== 'managed_online' && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Public repository fallback is always disabled. Package signatures,
          checksums and complete dependency availability are validated before
          VM creation.
        </Alert>
      )}
    </>
  )

  const renderReview = () => {
    const readyForDeploy =
      preflightState === 'passed' &&
      blueprint?.productionSelectable &&
      deploymentAvailable &&
      catalogSource === 'backend'

    return (
      <>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Review & Validate
        </Typography>
        <Surface sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>
            {blueprint?.name} {draft.version}
          </Typography>
          <Typography sx={{ mt: 0.5, color: colors.text.secondary }}>
            {draft.topology} · {blueprint?.preferredOs} · {draft.vcpu} vCPU ·{' '}
            {draft.memoryGiB} GiB
          </Typography>
          <Typography sx={{ mt: 0.5, color: colors.text.secondary }}>
            {draft.serviceFqdn || 'Service FQDN not set'} ·{' '}
            {draft.packageSourceMode}
          </Typography>
          <Typography sx={{ mt: 0.5, color: colors.text.secondary }}>
            Tuning: {draft.tuningProfile} · Backup retention:{' '}
            {draft.backupEnabled ? `${draft.retentionDays} days` : 'disabled'}
          </Typography>
        </Surface>

        <Box sx={{ mt: 2 }}>
          {allIssues.length === 0 ? (
            <Alert severity="success" icon={<CheckCircle />}>
              Local form validation passed. Authoritative backend preflight is
              still required before any infrastructure reservation.
            </Alert>
          ) : (
            allIssues.map((error, index) => (
              <Alert
                key={`${error.code}-${index}`}
                severity="error"
                sx={{ mb: 1 }}
                icon={<WarningTriangle />}
              >
                <strong>{error.code}</strong> — {error.message}
              </Alert>
            ))
          )}
        </Box>

        {!!preflightMessage && (
          <Alert
            severity={
              preflightState === 'passed'
                ? 'success'
                : preflightState === 'running'
                ? 'info'
                : 'warning'
            }
            sx={{ mt: 2 }}
          >
            {preflightMessage}
          </Alert>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            sx={{ textTransform: 'none' }}
            onClick={runPreflight}
            disabled={preflightState === 'running'}
          >
            Validate
          </Button>
          <Button
            variant="outlined"
            sx={{ textTransform: 'none' }}
            disabled={!draftsAvailable}
            title={
              draftsAvailable
                ? 'Save this deployment draft.'
                : 'Draft API is not available or qualified.'
            }
          >
            Save Draft
          </Button>
          <Button
            variant="outlined"
            sx={{ textTransform: 'none' }}
            disabled={!blueprintStudioAvailable}
            title={
              blueprintStudioAvailable
                ? 'Clone this into an editable custom blueprint. Qualification resets to NOT_TESTED.'
                : 'Blueprint Studio is administrator-only and requires a qualified backend.'
            }
          >
            Save as Custom Blueprint
          </Button>
          <Button
            variant="contained"
            sx={{ textTransform: 'none' }}
            disabled={!readyForDeploy}
            title={
              readyForDeploy
                ? 'Deploy the promoted tuple.'
                : 'Deployment remains blocked until the exact tuple, authoritative preflight and execution backend are production-qualified.'
            }
          >
            Deploy
          </Button>
        </Box>

        {!blueprint?.productionSelectable && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This family is visible for engineering review only. The exact
            tuple is not production-selectable until fresh install,
            idempotency, offline install, reboot, TLS, backup/restore/PITR,
            HA/failover, negative validation and recovery evidence are
            promoted.
          </Alert>
        )}
      </>
    )
  }

  const panels = [
    renderService,
    renderDeployment,
    renderCapacity,
    renderStorage,
    renderNetwork,
    renderHa,
    renderBackup,
    renderDr,
    renderSecurity,
    renderObservability,
    renderPackageSource,
    renderReview,
  ]

  return (
    <PageFrame
      title="Create Production Service"
      description="Production-guided VM application and DBaaS deployment with automatic OS selection, fail-closed validation, offline repositories, hardening and product-aware sizing."
      actions={
        <Button
          variant="text"
          startIcon={<NavArrowLeft width={18} height={18} />}
          onClick={() => history.push(PRODUCT_PATHS.APPLICATIONS)}
          sx={{ textTransform: 'none' }}
        >
          Back
        </Button>
      }
    >
      <Stepper
        activeStep={step}
        alternativeLabel
        sx={{ mt: 2, overflowX: 'auto' }}
      >
        {WIZARD_STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Surface sx={{ mt: 3, p: { xs: 2, md: 3 } }}>
        {panels[step]()}
      </Surface>

      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          disabled={step === 0}
          onClick={() => setStep((value) => value - 1)}
          sx={{ textTransform: 'none' }}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          disabled={step === WIZARD_STEPS.length - 1}
          onClick={() => setStep((value) => value + 1)}
          sx={{ textTransform: 'none' }}
        >
          Next
        </Button>
      </Box>
    </PageFrame>
  )
}

export default ProductionServiceWizard
