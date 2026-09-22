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
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import PropTypes from 'prop-types'
import { useMemo, useState } from 'react'
import { DrAPI, VmAPI } from '@FeaturesModule'
import { Surface } from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const NS_PER_MINUTE = 60 * 1000 * 1000 * 1000
const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const slug = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ProtectionDomainPanel = ({ isAdmin }) => {
  const domainsQuery = DrAPI.useGetProtectionDomainsQuery(undefined, {
    skip: !isAdmin,
  })
  const capabilitiesQuery = DrAPI.useGetDrCapabilitiesQuery(undefined, {
    skip: !isAdmin,
  })
  const sitesQuery = DrAPI.useGetRemoteSitesQuery(undefined, {
    skip: !isAdmin,
  })
  const vmsQuery = VmAPI.useGetVmsQuery({ extended: true }, { skip: !isAdmin })
  const [createDomain, createState] = DrAPI.useCreateProtectionDomainMutation()
  const [runCheckpoint, checkpointState] =
    DrAPI.useRunProtectionCheckpointMutation()

  const [name, setName] = useState('')
  const [sourceSite, setSourceSite] = useState('tester')
  const [remoteSite, setRemoteSite] = useState('')
  const [rpoMinutes, setRpoMinutes] = useState(5)
  const [rtoMinutes, setRtoMinutes] = useState(30)
  const [vmIds, setVmIds] = useState([])

  const domains = toArray(domainsQuery.data)
  const sites = toArray(sitesQuery.data)
  const vms = toArray(vmsQuery.data)
  const selectedRemoteSite = sites.find((site) => site.id === remoteSite)
  const executionReady =
    capabilitiesQuery.data?.capability?.enabled === true &&
    capabilitiesQuery.data?.runtime?.ready === true &&
    capabilitiesQuery.data?.runtime?.operational === true

  const validationError = useMemo(() => {
    if (!name.trim()) return 'Protection Domain name is required.'
    if (!sourceSite.trim() || !remoteSite.trim())
      return 'Source Site and a registered Remote Site are required.'
    if (sourceSite.trim() === remoteSite.trim())
      return 'Source Site and Remote Site must be different.'
    if (!selectedRemoteSite?.endpoint)
      return 'Selected Remote Site is not available from the durable registry.'
    if (vmIds.length === 0) return 'Select at least one virtual machine.'
    if (Number(rpoMinutes) < 1 || Number(rtoMinutes) < 1)
      return 'RPO and RTO must be at least one minute.'

    return ''
  }, [
    name,
    sourceSite,
    remoteSite,
    selectedRemoteSite,
    vmIds,
    rpoMinutes,
    rtoMinutes,
  ])

  const submit = async () => {
    if (validationError) return
    const domainId = slug(name)

    await createDomain({
      id: domainId,
      name: name.trim(),
      source_site_id: sourceSite.trim(),
      recovery_site_id: selectedRemoteSite.id,
      recovery_site_endpoint: selectedRemoteSite.endpoint,
      rpo: Number(rpoMinutes) * NS_PER_MINUTE,
      rto: Number(rtoMinutes) * NS_PER_MINUTE,
      transfer_concurrency: 2,
      transfer_policy: {
        max_attempts: 3,
        initial_backoff: 1 * 1000 * 1000 * 1000,
        max_backoff: 30 * 1000 * 1000 * 1000,
      },
      workloads: vmIds.map((id, index) => {
        const vm = vms.find((candidate) => String(candidate.ID) === String(id))

        return {
          id: `vm-${id}`,
          provider_id: String(id),
          name: vm?.NAME ?? `VM ${id}`,
          boot_order: index,
          application_protection: 'VM_ONLY',
          database_workload: false,
        }
      }),
    }).unwrap()
    domainsQuery.refetch()

    setName('')
    setRemoteSite('')
    setVmIds([])
  }

  if (!isAdmin) {
    return (
      <Alert severity="info">
        Protection Domains and remote-site configuration are managed by Super
        Admin.
      </Alert>
    )
  }

  return (
    <Box data-layersentry-protection-domains sx={{ display: 'grid', gap: 2 }}>
      <Surface sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
          Protection Domains
        </Typography>
        <Typography
          sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
        >
          A Protection Domain binds source workloads to one remote site and the
          checkpoint policy used by the durable DR controller.
        </Typography>

        {domainsQuery.isLoading || domainsQuery.isFetching ? (
          <LinearProgress sx={{ mt: 2 }} />
        ) : domainsQuery.isError ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            DR control-plane API is not configured, reachable, or authorized.
            Domain changes stay disabled.
          </Alert>
        ) : domains.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No Protection Domains are configured.
          </Alert>
        ) : (
          <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
            {domains.map((domain) => (
              <Box
                key={domain.id}
                sx={{
                  p: 1.5,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 1.5,
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                  {domain.name || domain.id}
                </Typography>
                <Typography
                  sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
                >
                  {domain.source_site_id} → {domain.recovery_site_id}
                  {domain.recovery_site_endpoint
                    ? ` · ${domain.recovery_site_endpoint}`
                    : ''}
                </Typography>
                <Typography
                  sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}
                >
                  {toArray(domain.workloads).length} workload
                  {toArray(domain.workloads).length === 1 ? '' : 's'} · RPO{' '}
                  {Math.round(Number(domain.rpo) / NS_PER_MINUTE)}m · RTO{' '}
                  {Math.round(Number(domain.rto) / NS_PER_MINUTE)}m
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!executionReady || checkpointState.isLoading}
                  onClick={() => runCheckpoint(domain.id)}
                  sx={{ mt: 1, textTransform: 'none' }}
                >
                  Ship checkpoint now
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Surface>

      <Surface sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
          Add Protection Domain
        </Typography>
        <Box
          sx={{
            mt: 1.5,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 1.25,
          }}
        >
          <TextField
            label="Protection Domain"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="Source Site"
            value={sourceSite}
            onChange={(e) => setSourceSite(e.target.value)}
          />
          <FormControl>
            <InputLabel id="protection-domain-remote-site-label">
              Remote Site
            </InputLabel>
            <Select
              labelId="protection-domain-remote-site-label"
              label="Remote Site"
              value={remoteSite}
              onChange={(e) => setRemoteSite(e.target.value)}
              disabled={sitesQuery.isLoading || sitesQuery.isError}
            >
              {sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name || site.id} · {site.cluster_uuid}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Remote Site Endpoint"
            value={selectedRemoteSite?.endpoint ?? ''}
            InputProps={{ readOnly: true }}
            helperText="Inherited from the registered Remote Site."
          />
          <TextField
            label="RPO (minutes)"
            type="number"
            value={rpoMinutes}
            onChange={(e) => setRpoMinutes(e.target.value)}
          />
          <TextField
            label="RTO (minutes)"
            type="number"
            value={rtoMinutes}
            onChange={(e) => setRtoMinutes(e.target.value)}
          />
          <FormControl sx={{ gridColumn: { md: '1 / -1' } }}>
            <InputLabel id="protection-domain-vms-label">
              Protected VMs
            </InputLabel>
            <Select
              labelId="protection-domain-vms-label"
              label="Protected VMs"
              multiple
              value={vmIds}
              onChange={(e) => setVmIds(e.target.value)}
            >
              {vms.map((vm) => (
                <MenuItem key={vm.ID} value={String(vm.ID)}>
                  #{vm.ID} · {vm.NAME}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {validationError && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            {validationError}
          </Alert>
        )}
        {createState.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {createState.error?.data?.message ??
              createState.error?.data?.error ??
              'Protection Domain creation failed.'}
          </Alert>
        )}
        <Button
          variant="contained"
          disabled={
            Boolean(validationError) ||
            domainsQuery.isError ||
            domainsQuery.isLoading ||
            sitesQuery.isError ||
            sitesQuery.isLoading ||
            createState.isLoading
          }
          onClick={submit}
          sx={{ mt: 1.5, textTransform: 'none' }}
        >
          Save Protection Domain
        </Button>
        <Typography sx={{ mt: 1, fontSize: 11, color: colors.text.muted }}>
          Saving the domain does not enable failover. Checkpoint execution,
          promotion and failback remain independently health/qualification gated
          by the DR backend.
        </Typography>
      </Surface>
    </Box>
  )
}

export default ProtectionDomainPanel

ProtectionDomainPanel.propTypes = {
  isAdmin: PropTypes.bool,
}

ProtectionDomainPanel.defaultProps = {
  isAdmin: false,
}
