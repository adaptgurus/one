/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 *                                                                           *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may   *
 * not use this file except in compliance with the License. You may obtain   *
 * a copy of the License at                                                  *
 *                                                                           *
 * http://www.apache.org/licenses/LICENSE-2.0                                *
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc */
import {
  Alert,
  Box,
  Button,
  Chip,
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

const RemoteSitePanel = ({ isAdmin }) => {
  const identityQuery = DrAPI.useGetLocalSiteIdentityQuery(undefined, {
    skip: !isAdmin,
  })
  const capabilitiesQuery = DrAPI.useGetDrCapabilitiesQuery(undefined, {
    skip: !isAdmin,
  })
  const pairsQuery = DrAPI.useGetSitePairsQuery(undefined, { skip: !isAdmin })
  const [createPair, createState] = DrAPI.useCreateSitePairMutation()

  const [remoteSiteId, setRemoteSiteId] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [username, setUsername] = useState('oneadmin')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('NDR')

  const local = identityQuery.data ?? {}
  const pairs = toArray(pairsQuery.data)
  const metroAvailable = capabilitiesQuery.data?.features?.metroDR === true
  const ndrAvailable = capabilitiesQuery.data?.features?.ndr === true
  const pairId = useMemo(
    () => slug(`${local.site_id ?? 'local'}-${remoteSiteId || 'remote'}`),
    [local.site_id, remoteSiteId]
  )

  const validationError = useMemo(() => {
    if (!local.site_id || !local.cluster_uuid)
      return 'Local LayerSentry Site identity is not ready.'
    if (!remoteSiteId.trim()) return 'Remote Site ID is required.'
    if (remoteSiteId.trim() === local.site_id)
      return 'Remote Site ID must differ from the local Site ID.'
    if (!/^https:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/.test(endpoint.trim()))
      return 'Remote LayerSentry Endpoint must be an HTTPS URL.'
    if (!username.trim()) return 'Remote administrator username is required.'
    if (!password) return 'Remote administrator password is required.'
    if (mode === 'METRO_DR' && !metroAvailable)
      return 'Metro DR is not qualified for this LayerSentry deployment.'
    if (mode === 'NDR' && !ndrAvailable)
      return 'NDR is not qualified for this LayerSentry deployment.'

    return ''
  }, [
    local.site_id,
    local.cluster_uuid,
    remoteSiteId,
    endpoint,
    username,
    password,
    mode,
    metroAvailable,
    ndrAvailable,
  ])

  const submit = async () => {
    if (validationError) return
    try {
      await createPair({
        id: pairId,
        local_site_id: local.site_id,
        remote_site_id: remoteSiteId.trim(),
        remote_endpoint: endpoint.trim().replace(/\/$/, ''),
        username: username.trim(),
        password,
        mode,
      }).unwrap()
      setPassword('')
      await pairsQuery.refetch()
    } finally {
      // Never retain the bootstrap password in component state after an attempt.
      setPassword('')
    }
  }

  if (!isAdmin) return null

  return (
    <Surface sx={{ p: 2 }} data-layersentry-site-pairs>
      <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
        LayerSentry Site Pairing
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}>
        Connect two LayerSentry sites once with remote administrator
        credentials. After identity/TLS validation, LayerSentry replaces the
        password with a scoped site-to-site API credential.
      </Typography>

      {identityQuery.isLoading || pairsQuery.isLoading ? (
        <LinearProgress sx={{ mt: 2 }} />
      ) : identityQuery.isError || pairsQuery.isError ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Site pairing is unavailable until the local DR service and durable
          pairing registry are healthy.
        </Alert>
      ) : (
        <>
          <Alert severity="info" sx={{ mt: 2 }}>
            Local Site: <strong>{local.site_name || local.site_id}</strong> ·{' '}
            {local.site_id} · cluster {local.cluster_uuid}
          </Alert>

          {pairs.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              No LayerSentry site pair is configured.
            </Alert>
          ) : (
            <Box sx={{ mt: 1.5, display: 'grid', gap: 1 }}>
              {pairs.map((pair) => (
                <Box
                  key={pair.id}
                  sx={{
                    p: 1.5,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                      {pair.local_site_id} → {pair.remote_site_id}
                    </Typography>
                    <Chip
                      size="small"
                      label={pair.mode === 'METRO_DR' ? 'Metro DR' : 'NDR'}
                    />
                    <Chip
                      size="small"
                      label={pair.state}
                      color={pair.state === 'PAIRED' ? 'success' : 'warning'}
                    />
                  </Box>
                  <Typography
                    sx={{ mt: 0.35, fontSize: 11, color: colors.text.secondary }}
                  >
                    {pair.remote_endpoint}
                  </Typography>
                  <Typography
                    sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}
                  >
                    Remote cluster {pair.remote_cluster_uuid}
                    {pair.last_validated_at
                      ? ` · verified ${new Date(
                          pair.last_validated_at
                        ).toLocaleString()}`
                      : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </>
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
          label="Remote Site ID"
          placeholder="dr"
          value={remoteSiteId}
          onChange={(e) => setRemoteSiteId(e.target.value)}
        />
        <TextField
          label="Remote LayerSentry Endpoint"
          placeholder="https://dr.layersentry.example:9444"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <TextField
          label="Remote Administrator"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Remote Administrator Password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          helperText="Used only for pairing bootstrap; never retained as the site credential."
        />
        <FormControl sx={{ gridColumn: { md: '1 / -1' } }}>
          <InputLabel id="layersentry-dr-mode-label">DR mode</InputLabel>
          <Select
            labelId="layersentry-dr-mode-label"
            label="DR mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <MenuItem value="NDR" disabled={!ndrAvailable}>
              NDR · asynchronous checkpoints · 5-minute RPO target
            </MenuItem>
            <MenuItem value="METRO_DR" disabled={!metroAvailable}>
              Metro DR · synchronous/mirrored storage only when qualified
            </MenuItem>
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
            'LayerSentry site pairing failed.'}
        </Alert>
      )}
      <Button
        variant="contained"
        disabled={
          Boolean(validationError) ||
          identityQuery.isLoading ||
          pairsQuery.isLoading ||
          createState.isLoading
        }
        onClick={submit}
        sx={{ mt: 1.5, textTransform: 'none' }}
      >
        Pair LayerSentry Sites
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
