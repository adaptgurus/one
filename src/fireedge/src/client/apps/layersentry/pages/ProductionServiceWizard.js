/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 * Licensed under the Apache License, Version 2.0.                            *
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc */
import { useMemo, useState } from 'react'
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
import { NavArrowLeft, CheckCircle, WarningTriangle } from 'iconoir-react'
import { PageFrame, Surface } from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  FALLBACK_BLUEPRINTS,
  WIZARD_STEPS,
  emptyDraft,
  validateDraft,
} from 'client/apps/layersentry/serviceBlueprints'

const Row = ({ children }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
    {children}
  </Box>
)

const SelectField = ({ label, value, onChange, children, disabled = false }) => (
  <FormControl fullWidth disabled={disabled}>
    <InputLabel>{label}</InputLabel>
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </Select>
  </FormControl>
)

const ProductionServiceWizard = () => {
  const history = useHistory()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(emptyDraft)
  const [validated, setValidated] = useState(false)

  const blueprint = useMemo(
    () => FALLBACK_BLUEPRINTS.find(({ id }) => id === draft.blueprintId),
    [draft.blueprintId]
  )
  const errors = useMemo(() => validateDraft(draft, blueprint), [draft, blueprint])
  const update = (key, value) => {
    setValidated(false)
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const selectBlueprint = (id) => {
    const selected = FALLBACK_BLUEPRINTS.find((item) => item.id === id)
    if (!selected) return
    setValidated(false)
    setDraft((current) => ({
      ...current,
      blueprintId: id,
      version: selected.versions[0] || '',
      topology: selected.topologies[0] || '',
      workload: selected.workloads?.[0] || 'General',
    }))
  }
  const updateStorage = (index, patch) =>
    setDraft((current) => ({
      ...current,
      storage: current.storage.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))

  const renderService = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Choose a production service</Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        The operating system is selected automatically from the qualified LayerSentry tuple. Unsupported combinations are never offered.
      </Typography>
      {[...new Set(FALLBACK_BLUEPRINTS.map(({ category }) => category))].map((category) => (
        <Box key={category} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1 }}>{category}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.25 }}>
            {FALLBACK_BLUEPRINTS.filter((item) => item.category === category).map((item) => (
              <Surface
                key={item.id}
                onClick={() => selectBlueprint(item.id)}
                sx={{ p: 1.5, cursor: 'pointer', border: `1px solid ${draft.blueprintId === item.id ? colors.brand.primary : colors.border}` }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{item.name}</Typography>
                <Typography sx={{ color: colors.text.secondary, fontSize: 11.5, mt: 0.5 }}>{item.preferredOs}</Typography>
                <Chip size="small" label={item.qualification} sx={{ mt: 1 }} />
              </Surface>
            ))}
          </Box>
        </Box>
      ))}
    </>
  )

  const renderDeployment = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Deployment & Version</Typography>
      <Row>
        <TextField label="Service" value={blueprint?.name || ''} disabled />
        <TextField label="LayerSentry selected OS" value={blueprint?.preferredOs || ''} disabled helperText="OS is policy-controlled, not customer-selected." />
        <SelectField label="Version" value={draft.version} onChange={(value) => update('version', value)}>
          {(blueprint?.versions || []).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </SelectField>
        <SelectField label="Topology" value={draft.topology} onChange={(value) => update('topology', value)}>
          {(blueprint?.topologies || []).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </SelectField>
        {!!blueprint?.editions && (
          <SelectField label="Edition" value={draft.edition} onChange={(value) => update('edition', value)}>
            <MenuItem value=""><em>Select edition</em></MenuItem>
            {blueprint.editions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </SelectField>
        )}
      </Row>
      {draft.blueprintId === 'postgresql' && (
        <Surface sx={{ p: 2, mt: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>PostgreSQL production extensions</Typography>
          <FormControlLabel control={<Checkbox checked={draft.pgStatStatements} onChange={(e) => update('pgStatStatements', e.target.checked)} />} label="pg_stat_statements (recommended, enabled by default)" />
          <FormControlLabel control={<Checkbox checked={draft.postgis} onChange={(e) => update('postgis', e.target.checked)} />} label="PostGIS 3.6.x geospatial profile" />
          {draft.postgis && <TextField fullWidth sx={{ mt: 1 }} label="Enable PostGIS in databases" placeholder="gis, orders_geo" value={draft.postgisDatabases} onChange={(e) => update('postgisDatabases', e.target.value)} />}
          <FormControlLabel control={<Checkbox checked={draft.pgbouncer} onChange={(e) => update('pgbouncer', e.target.checked)} />} label="PgBouncer" />
          <FormControlLabel control={<Checkbox checked={draft.barman} onChange={(e) => update('barman', e.target.checked)} />} label="Barman backup / WAL / PITR" />
        </Surface>
      )}
    </>
  )

  const renderCapacity = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Capacity & Workload</Typography>
      <Row>
        <TextField type="number" label="vCPU per node" value={draft.vcpu} onChange={(e) => update('vcpu', Number(e.target.value))} />
        <TextField type="number" label="Memory per node (GiB)" value={draft.memoryGiB} onChange={(e) => update('memoryGiB', Number(e.target.value))} />
        <TextField type="number" label="Expected data size (GiB)" value={draft.expectedDataGiB} onChange={(e) => update('expectedDataGiB', Number(e.target.value))} />
        <SelectField label="Workload profile" value={draft.workload} onChange={(value) => update('workload', value)}>
          {(blueprint?.workloads || ['General']).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
        </SelectField>
      </Row>
      <Alert severity="info" sx={{ mt: 2 }}>LayerSentry uses CPU, RAM, storage and workload only for safe baseline OS/application sizing. It does not rewrite SQL, indexes or schemas.</Alert>
    </>
  )

  const renderStorage = () => (
    <>
      <Typography variant="h6">Storage</Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>Use separate product-aware mounts. Striped disks must be equal size and use one qualified storage class.</Typography>
      {draft.storage.map((volume, index) => (
        <Surface key={`${volume.role}-${index}`} sx={{ p: 2, mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{volume.role}</Typography>
          <Row>
            <TextField label="Mount point" value={volume.mountpoint} onChange={(e) => updateStorage(index, { mountpoint: e.target.value })} />
            <SelectField label="Layout" value={volume.layout} onChange={(value) => updateStorage(index, { layout: value, diskSizes: value === 'stripe' ? [500, 500] : volume.diskSizes.slice(0, 1) })}>
              <MenuItem value="single">Single disk</MenuItem>
              <MenuItem value="lvm">LVM</MenuItem>
              <MenuItem value="stripe">Striped disks</MenuItem>
              <MenuItem value="existing_san_lun">Existing SAN/LUN</MenuItem>
              <MenuItem value="existing_mount">Existing mount</MenuItem>
            </SelectField>
            <TextField label="Storage class / pool" value={volume.storageClass} onChange={(e) => updateStorage(index, { storageClass: e.target.value })} />
            <TextField label="Disk sizes (GiB, comma separated)" value={volume.diskSizes.join(',')} onChange={(e) => updateStorage(index, { diskSizes: e.target.value.split(',').map((value) => Number(value.trim())).filter(Boolean) })} helperText={volume.layout === 'stripe' ? 'All values must be exactly equal.' : ''} />
          </Row>
        </Surface>
      ))}
    </>
  )

  const renderNetwork = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Network & DNS</Typography>
      <Row>
        <TextField label="DNS domain" placeholder="prod.example.internal" value={draft.domain} onChange={(e) => update('domain', e.target.value)} />
        <TextField label="Service FQDN" placeholder="postgres-prod.prod.example.internal" value={draft.serviceFqdn} onChange={(e) => update('serviceFqdn', e.target.value)} />
        <SelectField label="Node IP assignment" value={draft.ipMode} onChange={(value) => update('ipMode', value)}>
          <MenuItem value="auto">Allocate from LayerSentry network</MenuItem>
          <MenuItem value="static">Static IP addresses</MenuItem>
        </SelectField>
      </Row>
      <Alert severity="info" sx={{ mt: 2 }}>Backend preflight verifies subnet membership, duplicate IPs, DNS conflicts, gateway, address capacity and service VIP before any VM is created.</Alert>
    </>
  )

  const renderHa = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>HA & Load Balancer</Typography>
      <Row>
        <SelectField label="Service endpoint" value={draft.endpointMode} onChange={(value) => update('endpointMode', value)}>
          <MenuItem value="layersentry_managed">LayerSentry managed HA VIP/LB</MenuItem>
          <MenuItem value="external_lb">Existing hardware/software load balancer</MenuItem>
          <MenuItem value="product_native">Qualified product-native endpoint</MenuItem>
        </SelectField>
        {draft.endpointMode === 'external_lb' && <TextField label="External VIP / address" value={draft.vip} onChange={(e) => update('vip', e.target.value)} />}
        <TextField type="number" label="Backend service port" value={draft.backendPort} onChange={(e) => update('backendPort', Number(e.target.value))} />
      </Row>
      <Alert severity="info" sx={{ mt: 2 }}>HA nodes are placed across distinct OpenNebula failure domains when the selected topology requires quorum.</Alert>
    </>
  )

  const renderBackup = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Backup & Retention</Typography>
      <FormControlLabel control={<Checkbox checked={draft.backupEnabled} onChange={(e) => update('backupEnabled', e.target.checked)} />} label="Application-aware backup" />
      {draft.backupEnabled && <Row>
        <TextField type="number" label="Retention (days)" value={draft.retentionDays} onChange={(e) => update('retentionDays', Number(e.target.value))} />
        <TextField type="number" label="PITR recovery window (hours)" value={draft.pitrWindowHours} onChange={(e) => update('pitrWindowHours', Number(e.target.value))} disabled={!draft.pitr} />
      </Row>}
      {draft.backupEnabled && <FormControlLabel control={<Checkbox checked={draft.pitr} onChange={(e) => update('pitr', e.target.checked)} />} label="Point-in-time recovery where supported" />}
      <Alert severity="warning" sx={{ mt: 2 }}>A VM/storage snapshot is not treated as database backup. Production qualification requires a real restore test.</Alert>
    </>
  )

  const renderDr = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Disaster Recovery</Typography>
      <FormControlLabel control={<Checkbox checked={draft.drEnabled} onChange={(e) => update('drEnabled', e.target.checked)} />} label="Configure a qualified DR topology" />
      {draft.drEnabled && <Row>
        <TextField label="Target site" value={draft.drTarget} onChange={(e) => update('drTarget', e.target.value)} />
        <TextField type="number" label="RPO (minutes)" value={draft.rpoMinutes} onChange={(e) => update('rpoMinutes', Number(e.target.value))} />
        <TextField type="number" label="RTO (minutes)" value={draft.rtoMinutes} onChange={(e) => update('rtoMinutes', Number(e.target.value))} />
      </Row>}
    </>
  )

  const renderSecurity = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Security & Access</Typography>
      <Row>
        <SelectField label="Hardening profile" value={draft.hardeningProfile} onChange={(value) => update('hardeningProfile', value)}>
          <MenuItem value="standard-production">Standard production hardening</MenuItem>
          <MenuItem value="cis-qualified">CIS-aligned (only qualified tuples)</MenuItem>
        </SelectField>
        <SelectField label="OS access" value={draft.sshAuth} onChange={(value) => update('sshAuth', value)}>
          <MenuItem value="ssh_key_sudo">SSH key + sudo (recommended)</MenuItem>
          <MenuItem value="password_sudo">Password + sudo</MenuItem>
          <MenuItem value="root_bootstrap">Temporary root bootstrap</MenuItem>
        </SelectField>
      </Row>
      <FormControlLabel control={<Checkbox checked={draft.tls} onChange={(e) => update('tls', e.target.checked)} />} label="TLS enabled" />
      <Alert severity="info">Rocky stays SELinux enforcing; Ubuntu keeps AppArmor where applicable. Firewall, auditing and secure service accounts remain enabled.</Alert>
    </>
  )

  const renderObservability = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Observability</Typography>
      <FormControlLabel control={<Checkbox checked={draft.metrics} onChange={(e) => update('metrics', e.target.checked)} />} label="Metrics / product exporter" />
      <FormControlLabel control={<Checkbox checked={draft.logs} onChange={(e) => update('logs', e.target.checked)} />} label="Central logs" />
    </>
  )

  const renderPackageSource = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Package Source / Offline</Typography>
      <SelectField label="Installation source" value={draft.packageSourceMode} onChange={(value) => update('packageSourceMode', value)}>
        <MenuItem value="managed_online">Approved online repositories</MenuItem>
        <MenuItem value="local_mirror">Customer local repository / mirror</MenuItem>
        <MenuItem value="airgapped_bundle">LayerSentry air-gapped bundle</MenuItem>
      </SelectField>
      {draft.packageSourceMode === 'local_mirror' && <TextField fullWidth sx={{ mt: 2 }} label="Internal repository URL / FQDN" value={draft.repoUrl} onChange={(e) => update('repoUrl', e.target.value)} />}
      {draft.packageSourceMode === 'airgapped_bundle' && <TextField fullWidth sx={{ mt: 2 }} label="Qualified bundle ID" value={draft.bundleId} onChange={(e) => update('bundleId', e.target.value)} />}
      {draft.packageSourceMode !== 'managed_online' && <Alert severity="info" sx={{ mt: 2 }}>Public repository fallback is always disabled. Package signatures/checksums and complete dependencies are validated before VM creation.</Alert>}
    </>
  )

  const renderReview = () => (
    <>
      <Typography variant="h6" sx={{ mb: 2 }}>Review & Validate</Typography>
      <Surface sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 800 }}>{blueprint?.name} {draft.version}</Typography>
        <Typography sx={{ mt: 0.5, color: colors.text.secondary }}>{draft.topology} · {blueprint?.preferredOs} · {draft.vcpu} vCPU · {draft.memoryGiB} GiB</Typography>
        <Typography sx={{ mt: 0.5, color: colors.text.secondary }}>{draft.serviceFqdn || 'Service FQDN not set'} · {draft.packageSourceMode}</Typography>
      </Surface>
      <Box sx={{ mt: 2 }}>
        {errors.length === 0 ? <Alert severity="success" icon={<CheckCircle />}>Local form validation passed. Authoritative backend preflight and tuple qualification are still required.</Alert> : errors.map((error) => <Alert key={`${error.code}-${error.message}`} severity="error" sx={{ mb: 1 }} icon={<WarningTriangle />}><strong>{error.code}</strong> — {error.message}</Alert>)}
      </Box>
      <Button variant="outlined" sx={{ mt: 2, textTransform: 'none' }} onClick={() => setValidated(errors.length === 0)}>Validate</Button>
      <Button variant="contained" sx={{ mt: 2, ml: 1, textTransform: 'none' }} disabled={!validated || !blueprint?.productionSelectable} title={!blueprint?.productionSelectable ? 'This exact tuple is not production-qualified yet.' : ''}>Deploy</Button>
      {!blueprint?.productionSelectable && <Alert severity="warning" sx={{ mt: 2 }}>This blueprint is visible for engineering review but is not production-selectable until the backend returns a promoted exact tuple and native OneFlow/OpenNebula execution is qualified.</Alert>}
    </>
  )

  const panels = [renderService, renderDeployment, renderCapacity, renderStorage, renderNetwork, renderHa, renderBackup, renderDr, renderSecurity, renderObservability, renderPackageSource, renderReview]

  return (
    <PageFrame
      title="Create Production Service"
      description="Production-guided application and DBaaS deployment with fail-closed validation, automatic OS selection and offline installation support."
      actions={<Button variant="text" startIcon={<NavArrowLeft width={18} height={18} />} onClick={() => history.push(PRODUCT_PATHS.APPLICATIONS)} sx={{ textTransform: 'none' }}>Back</Button>}
    >
      <Stepper activeStep={step} alternativeLabel sx={{ mt: 2, overflowX: 'auto' }}>
        {WIZARD_STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>
      <Surface sx={{ mt: 3, p: { xs: 2, md: 3 } }}>{panels[step]()}</Surface>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button disabled={step === 0} onClick={() => setStep((value) => value - 1)} sx={{ textTransform: 'none' }}>Previous</Button>
        <Button variant="contained" disabled={step === WIZARD_STEPS.length - 1} onClick={() => setStep((value) => value + 1)} sx={{ textTransform: 'none' }}>Next</Button>
      </Box>
    </PageFrame>
  )
}

export default ProductionServiceWizard
