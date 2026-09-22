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
import { DrAPI } from '@FeaturesModule'
import { Surface } from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const slug = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const REMOTE_CAPABILITIES = [
  'RESTIC_CHECKPOINT',
  'OPENNEBULA_RECOVERY',
  'CBT_SOURCE',
  'CEPH_RBD_MIRROR',
  'ARRAY_REPLICATION',
  'REDFISH_FENCING',
]

const RemoteSitePanel = ({ isAdmin }) => {
  const sitesQuery = DrAPI.useGetRemoteSitesQuery(undefined, { skip: !isAdmin })
  const [createSite, createState] = DrAPI.useCreateRemoteSiteMutation()
  const [name, setName] = useState('')
  const [siteId, setSiteId] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [clusterUuid, setClusterUuid] = useState('')
  const [tlsFingerprint, setTlsFingerprint] = useState('')
  const [capabilities, setCapabilities] = useState([
    'RESTIC_CHECKPOINT',
    'OPENNEBULA_RECOVERY',
  ])

  const sites = toArray(sitesQuery.data)
  const validationError = useMemo(() => {
    const id = siteId.trim() || slug(name)
    if (!name.trim()) return 'Remote Site name is required.'
    if (!id) return 'Remote Site ID is required.'
    if (!/^https:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(endpoint.trim()))
      return 'Remote Site Endpoint must be an HTTPS URL.'
    if (!clusterUuid.trim())
      return 'Remote LayerSentry cluster UUID is required.'
    if (
      tlsFingerprint.trim() &&
      !/^(?:sha256:)?[a-fA-F0-9]{64}$/.test(tlsFingerprint.trim())
    )
      return 'TLS fingerprint must be a SHA-256 fingerprint.'
    if (capabilities.length === 0)
      return 'Select at least one qualified remote-site capability.'

    return ''
  }, [name, siteId, endpoint, clusterUuid, tlsFingerprint, capabilities])

  const submit = async () => {
    if (validationError) return
    await createSite({
      id: siteId.trim() || slug(name),
      name: name.trim(),
      endpoint: endpoint.trim().replace(/\/$/, ''),
      cluster_uuid: clusterUuid.trim(),
      tls_fingerprint_sha256: tlsFingerprint.trim(),
      capabilities,
    }).unwrap()
    await sitesQuery.refetch()
    setName('')
    setSiteId('')
    setEndpoint('')
    setClusterUuid('')
    setTlsFingerprint('')
    setCapabilities(['RESTIC_CHECKPOINT', 'OPENNEBULA_RECOVERY'])
  }

  if (!isAdmin) return null

  return (
    <Surface sx={{ p: 2 }} data-layersentry-remote-sites>
      <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
        Remote Sites
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}>
        Register the remote LayerSentry cluster identity before assigning it to
        a Protection Domain. Registration alone does not certify failover.
      </Typography>

      {sitesQuery.isLoading || sitesQuery.isFetching ? (
        <LinearProgress sx={{ mt: 2 }} />
      ) : sitesQuery.isError ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Remote Site registry is unavailable. New Protection Domains remain
          fail-closed.
        </Alert>
      ) : sites.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No Remote Sites are registered.
        </Alert>
      ) : (
        <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
          {sites.map((site) => (
            <Box
              key={site.id}
              sx={{
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                {site.name || site.id}
              </Typography>
              <Typography
                sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
              >
                {site.id} · {site.cluster_uuid} · {site.endpoint}
              </Typography>
              <Typography
                sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}
              >
                {toArray(site.capabilities).join(', ') || 'No capabilities'}
                {site.last_seen_at
                  ? ` · last verified ${site.last_seen_at}`
                  : ' · transport observation pending'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 1.25,
        }}
      >
        <TextField
          label="Remote Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Remote Site ID"
          placeholder="manoj"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
        />
        <TextField
          label="Remote Site Endpoint"
          placeholder="https://manoj-site.example"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <TextField
          label="Remote Cluster UUID"
          value={clusterUuid}
          onChange={(e) => setClusterUuid(e.target.value)}
        />
        <TextField
          label="TLS SHA-256 fingerprint"
          placeholder="sha256:..."
          value={tlsFingerprint}
          onChange={(e) => setTlsFingerprint(e.target.value)}
          sx={{ gridColumn: { md: '1 / -1' } }}
        />
        <FormControl sx={{ gridColumn: { md: '1 / -1' } }}>
          <InputLabel id="remote-site-capabilities-label">
            Capabilities
          </InputLabel>
          <Select
            labelId="remote-site-capabilities-label"
            label="Capabilities"
            multiple
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
          >
            {REMOTE_CAPABILITIES.map((capability) => (
              <MenuItem key={capability} value={capability}>
                {capability}
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
            'Remote Site registration failed.'}
        </Alert>
      )}
      <Button
        variant="contained"
        disabled={
          Boolean(validationError) ||
          sitesQuery.isError ||
          sitesQuery.isLoading ||
          createState.isLoading
        }
        onClick={submit}
        sx={{ mt: 1.5, textTransform: 'none' }}
      >
        Register Remote Site
      </Button>
    </Surface>
  )
}

export default RemoteSitePanel

RemoteSitePanel.propTypes = {
  isAdmin: PropTypes.bool,
}

RemoteSitePanel.defaultProps = {
  isAdmin: false,
}
