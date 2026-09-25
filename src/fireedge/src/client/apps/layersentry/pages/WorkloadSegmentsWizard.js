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

import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Plus, Trash } from 'iconoir-react'
import { useMemo, useRef, useState } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { ClusterAPI, useGeneralApi, VnAPI } from '@FeaturesModule'
import { jsonToXml } from '@UtilsModule'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'
import {
  compileWorkloadSegment,
  createSegmentDraft,
  createStandardSegmentSet,
  ENVIRONMENT_OPTIONS,
  SEGMENT_MODES,
  TIER_OPTIONS,
  validateWorkloadSegments,
} from 'client/apps/layersentry/networkSegments'

const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
    ? value
    : [value]

const environmentLabel = (value) =>
  ENVIRONMENT_OPTIONS.find(([id]) => id === value)?.[1] ?? value

const createName = (environment, tier) =>
  environment === 'custom' || tier === 'custom'
    ? ''
    : `${environment}_${tier}_network`

const getErrorMessage = (error) =>
  error?.data?.message ??
  error?.data?.error?.message ??
  error?.message ??
  'OpenNebula did not accept the network request.'

const SegmentCard = ({ segment, errors, onChange, onRemove, disabled }) => {
  const change = (field) => (event) => onChange(field, event.target.value)

  return (
    <Surface
      sx={{
        p: 2,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surface,
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        gap={1}
      >
        <Box>
          <Typography sx={{ fontWeight: 800 }}>
            {segment.name || 'New workload segment'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: colors.text.muted }}>
            {environmentLabel(segment.environment)} · {segment.tier} ·{' '}
            {segment.mode === SEGMENT_MODES.VLAN
              ? '802.1Q VLAN'
              : 'Linux bridge'}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Trash width={16} height={16} />}
          onClick={onRemove}
          disabled={disabled}
          sx={{ textTransform: 'none' }}
        >
          Remove
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            xl: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 1.5,
          mt: 2,
        }}
      >
        <TextField
          label="Network name"
          value={segment.name}
          onChange={change('name')}
          error={Boolean(errors?.name)}
          helperText={errors?.name}
          disabled={disabled}
          size="small"
        />
        <TextField
          select
          label="Environment"
          value={segment.environment}
          onChange={change('environment')}
          disabled={disabled}
          size="small"
        >
          {ENVIRONMENT_OPTIONS.map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Workload tier"
          value={segment.tier}
          onChange={change('tier')}
          disabled={disabled}
          size="small"
        >
          {TIER_OPTIONS.map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Segment type"
          value={segment.mode}
          onChange={change('mode')}
          error={Boolean(errors?.mode)}
          helperText={errors?.mode}
          disabled={disabled}
          size="small"
        >
          <MenuItem value={SEGMENT_MODES.VLAN}>VLAN segment (802.1Q)</MenuItem>
          <MenuItem value={SEGMENT_MODES.BRIDGE}>Bridge segment</MenuItem>
        </TextField>

        {segment.mode === SEGMENT_MODES.VLAN ? (
          <>
            <TextField
              label="Parent bridge / device"
              value={segment.parent}
              onChange={change('parent')}
              error={Boolean(errors?.parent)}
              helperText={errors?.parent || 'Usually br0 on the KVM hosts.'}
              disabled={disabled}
              size="small"
            />
            <TextField
              label="VLAN ID"
              type="number"
              value={segment.vlanId}
              onChange={change('vlanId')}
              error={Boolean(errors?.vlanId)}
              helperText={errors?.vlanId || '1-4094'}
              disabled={disabled}
              size="small"
            />
          </>
        ) : (
          <>
            <TextField
              label="Bridge name"
              value={segment.bridge}
              onChange={change('bridge')}
              helperText="Optional. Blank lets OpenNebula use its native bridge naming."
              disabled={disabled}
              size="small"
            />
            <TextField
              label="Tagged VLANs"
              value={segment.taggedVlans}
              onChange={change('taggedVlans')}
              error={Boolean(errors?.taggedVlans)}
              helperText={
                errors?.taggedVlans || 'Optional: 100,200-210,300'
              }
              disabled={disabled}
              size="small"
            />
          </>
        )}

        <TextField
          label="IPv4 CIDR"
          placeholder="10.20.30.0/24"
          value={segment.cidr}
          onChange={change('cidr')}
          error={Boolean(errors?.cidr)}
          helperText={errors?.cidr}
          disabled={disabled}
          size="small"
        />
        <TextField
          label="Gateway"
          placeholder="10.20.30.1"
          value={segment.gateway}
          onChange={change('gateway')}
          error={Boolean(errors?.gateway)}
          helperText={errors?.gateway || 'Optional for isolated segments.'}
          disabled={disabled}
          size="small"
        />
        <TextField
          label="DNS"
          placeholder="10.20.30.53"
          value={segment.dns}
          onChange={change('dns')}
          error={Boolean(errors?.dns)}
          helperText={errors?.dns || 'Optional IPv4 DNS server.'}
          disabled={disabled}
          size="small"
        />
        <TextField
          label="First workload IP"
          placeholder="10.20.30.10"
          value={segment.firstIp}
          onChange={change('firstIp')}
          error={Boolean(errors?.firstIp)}
          helperText={errors?.firstIp}
          disabled={disabled}
          size="small"
        />
        <TextField
          label="IP count"
          type="number"
          value={segment.rangeSize}
          onChange={change('rangeSize')}
          error={Boolean(errors?.rangeSize)}
          helperText={errors?.rangeSize || 'Number of leases in this range.'}
          disabled={disabled}
          size="small"
        />
      </Box>
    </Surface>
  )
}

SegmentCard.propTypes = {
  segment: PropTypes.object.isRequired,
  errors: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}

SegmentCard.defaultProps = {
  errors: {},
  disabled: false,
}

const WorkloadSegmentsWizard = () => {
  const history = useHistory()
  const location = useLocation()
  const { enqueueSuccess, enqueueError } = useGeneralApi()
  const [allocate, allocationState] = VnAPI.useAllocateVnetMutation()
  const clusterQuery = ClusterAPI.useGetClustersQuery()
  const clusters = toArray(clusterQuery.data)
  const keySequence = useRef(0)

  const initialEnvironment = ENVIRONMENT_OPTIONS.some(
    ([value]) => value === location.state?.environment
  )
    ? location.state.environment
    : 'prod'

  const withKeys = (items) =>
    items.map((item) => ({
      ...item,
      key: `segment-${keySequence.current++}`,
    }))

  const [segments, setSegments] = useState(() =>
    withKeys(createStandardSegmentSet(initialEnvironment))
  )
  const [cluster, setCluster] = useState('-1')
  const [validation, setValidation] = useState(() =>
    validateWorkloadSegments(segments)
  )
  const [result, setResult] = useState(null)
  const submitting = allocationState.isLoading

  const summary = useMemo(
    () => ({
      total: segments.length,
      vlan: segments.filter(({ mode }) => mode === SEGMENT_MODES.VLAN).length,
      bridge: segments.filter(({ mode }) => mode === SEGMENT_MODES.BRIDGE)
        .length,
    }),
    [segments]
  )

  const validate = (nextSegments) => {
    const next = validateWorkloadSegments(nextSegments)
    setValidation(next)

    return next
  }

  const updateSegment = (key, field, value) => {
    setSegments((current) => {
      const next = current.map((segment) => {
        if (segment.key !== key) return segment

        if (field === 'environment' || field === 'tier') {
          const previousGeneratedName = createName(
            segment.environment,
            segment.tier
          )
          const updated = { ...segment, [field]: value }
          if (!segment.name || segment.name === previousGeneratedName) {
            updated.name = createName(updated.environment, updated.tier)
          }

          return updated
        }

        return { ...segment, [field]: value }
      })
      validate(next)

      return next
    })
  }

  const removeSegment = (key) => {
    setSegments((current) => {
      const next = current.filter((segment) => segment.key !== key)
      validate(next)

      return next
    })
  }

  const addSegment = () => {
    setSegments((current) => {
      const next = [
        ...current,
        ...withKeys([
          createSegmentDraft({
            environment: initialEnvironment,
            tier: 'custom',
            index: current.length,
          }),
        ]),
      ]
      validate(next)

      return next
    })
  }

  const addStandardSet = (environment) => {
    setSegments((current) => {
      const next = [...current, ...withKeys(createStandardSegmentSet(environment))]
      validate(next)

      return next
    })
  }

  const runCreate = async () => {
    const checked = validate(segments)
    setResult(null)

    if (!checked.valid) {
      enqueueError('Fix the highlighted workload-segment fields before create.')

      return
    }

    const created = []
    for (const segment of segments) {
      try {
        const id = await allocate({
          template: jsonToXml(compileWorkloadSegment(segment)),
          cluster: cluster === '-1' ? '-1' : Number(cluster),
        }).unwrap()
        created.push({ id, name: segment.name })
      } catch (error) {
        const message = getErrorMessage(error)
        setResult({
          status: 'partial',
          created,
          failed: segment.name,
          message,
        })
        enqueueError(
          `Stopped after ${created.length} of ${segments.length} segments. ${message}`
        )

        return
      }
    }

    setResult({ status: 'success', created })
    enqueueSuccess(`${created.length} workload segments created successfully.`)
  }

  return (
    <PageFrame
      title="Create workload segments"
      description="Create several isolated workload networks in one guided operation. Every segment is allocated as a native OpenNebula Virtual Network."
      actions={
        <Button
          variant="outlined"
          onClick={() => history.push('/network')}
          disabled={submitting}
          sx={{ textTransform: 'none' }}
        >
          Back to Networks
        </Button>
      }
    >
      <Alert severity="info" sx={{ mt: 2 }}>
        Use a separate segment for Web, Application, Database, Management or
        Backup traffic. LayerSentry validates the whole batch before sending
        native OpenNebula network allocations.
      </Alert>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Batch settings"
          description="Choose the OpenNebula cluster once, then define each workload segment."
        />
        <TextField
          select
          label="Infrastructure cluster"
          value={cluster}
          onChange={(event) => setCluster(event.target.value)}
          disabled={submitting || clusterQuery.isLoading}
          size="small"
          sx={{ mt: 1.5, minWidth: 280 }}
        >
          <MenuItem value="-1">Default / unassigned</MenuItem>
          {clusters.map(({ ID, NAME }) => (
            <MenuItem key={ID} value={String(ID)}>
              {NAME ?? `Cluster ${ID}`} (#{ID})
            </MenuItem>
          ))}
        </TextField>

        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          gap={1}
          flexWrap="wrap"
          sx={{ mt: 2 }}
        >
          <Button
            variant="outlined"
            startIcon={<Plus width={16} height={16} />}
            onClick={addSegment}
            disabled={submitting}
            sx={{ textTransform: 'none' }}
          >
            Add segment
          </Button>
          {ENVIRONMENT_OPTIONS.filter(([value]) => value !== 'custom').map(
            ([value, label]) => (
              <Button
                key={value}
                variant="outlined"
                onClick={() => addStandardSet(value)}
                disabled={submitting}
                sx={{ textTransform: 'none' }}
              >
                Add {label} Web/App/DB
              </Button>
            )
          )}
        </Stack>
      </Surface>

      <Surface sx={{ mt: 2, p: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          gap={1}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
              Workload segments
            </Typography>
            <Typography sx={{ fontSize: 12, color: colors.text.muted }}>
              {summary.total} total · {summary.vlan} VLAN · {summary.bridge}{' '}
              bridge
            </Typography>
          </Box>
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {segments.map(({ key, name }) => (
              <Chip key={key} size="small" label={name || 'unnamed'} />
            ))}
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {validation.batchErrors.map((error) => (
          <Alert key={error} severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        ))}

        <Stack gap={2}>
          {segments.map((segment, index) => (
            <SegmentCard
              key={segment.key}
              segment={segment}
              errors={validation.rowErrors[index]}
              onChange={(field, value) =>
                updateSegment(segment.key, field, value)
              }
              onRemove={() => removeSegment(segment.key)}
              disabled={submitting}
            />
          ))}
        </Stack>
      </Surface>

      {result?.status === 'partial' && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Created {result.created.length} segment
          {result.created.length === 1 ? '' : 's'}, then stopped at{' '}
          <strong>{result.failed}</strong>: {result.message}. Successfully
          created networks were retained; LayerSentry does not automatically
          delete them after a partial batch failure.
        </Alert>
      )}

      {result?.status === 'success' && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Created {result.created.length} workload segments:{' '}
          {result.created.map(({ id, name }) => `${name} (#${id})`).join(', ')}
        </Alert>
      )}

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Review and create"
          description="All CIDRs must be non-overlapping, VLAN IDs unique per parent, and IP ranges must fit their subnet."
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={runCreate}
            disabled={submitting || !segments.length}
            sx={{ textTransform: 'none' }}
          >
            {submitting
              ? 'Creating workload segments…'
              : `Create ${segments.length} workload segment${
                  segments.length === 1 ? '' : 's'
                }`}
          </Button>
          <Button
            variant="outlined"
            onClick={() => history.push('/network/create')}
            disabled={submitting}
            sx={{ textTransform: 'none' }}
          >
            Create one network instead
          </Button>
        </Stack>
      </Surface>
    </PageFrame>
  )
}

WorkloadSegmentsWizard.propTypes = {}

export default WorkloadSegmentsWizard
