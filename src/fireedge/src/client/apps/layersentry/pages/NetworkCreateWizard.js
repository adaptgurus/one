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
/* eslint-disable jsdoc/require-jsdoc, react/prop-types */
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { VnAPI } from '@FeaturesModule'
import { jsonToXml } from '@UtilsModule'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import {
  NETWORK_ENVIRONMENTS,
  NETWORK_IP_MODES,
  NETWORK_POLICIES,
  NETWORK_TIERS,
  compileNetworkTemplate,
  defaultNetworkDraft,
  networkReadbackMatches,
  validateNetworkDraft,
} from 'client/apps/layersentry/networkPlan'

const steps = ['Segment & addresses', 'Security & advanced', 'Review']
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const Field = ({ error, ...props }) => (
  <TextField
    fullWidth
    size="small"
    error={Boolean(error)}
    helperText={error}
    {...props}
  />
)

const SelectField = ({ label, value, onChange, options }) => (
  <FormControl fullWidth size="small">
    <InputLabel>{label}</InputLabel>
    <Select label={label} value={value} onChange={onChange}>
      {options.map(([optionValue, optionLabel]) => (
        <MenuItem key={optionValue} value={optionValue}>
          {optionLabel}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
)

const NetworkCreateWizard = () => {
  const history = useHistory()
  const [draft, setDraft] = useState(defaultNetworkDraft)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [allocate] = VnAPI.useAllocateVnetMutation()
  const [readNetwork] = VnAPI.useLazyGetVNetworkQuery()
  const errors = useMemo(() => validateNetworkDraft(draft), [draft])

  const update = (name) => (event) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setDraft((current) => {
      const next = { ...current, [name]: value }
      if (name === 'environment' || name === 'tier') {
        next.name = `${next.environment}_${next.tier}_network`
      }

      return next
    })
  }

  const submit = async () => {
    if (Object.keys(errors).length) {
      setError('Review the highlighted settings before creating this network.')

      return
    }

    setSubmitting(true)
    setError('')
    try {
      const expected = compileNetworkTemplate(draft)
      const id = await allocate({
        template: jsonToXml(expected),
        cluster: -1,
      }).unwrap()
      let reconciled = false
      let lastReadError
      for (let attempt = 0; attempt < 5 && !reconciled; attempt += 1) {
        try {
          const observed = await readNetwork(
            { id, extended: true },
            false
          ).unwrap()
          reconciled = networkReadbackMatches(observed, expected)
        } catch (reason) {
          lastReadError = reason
        }
        if (!reconciled && attempt < 4) await wait(350 * (attempt + 1))
      }
      if (!reconciled) {
        throw new Error(
          lastReadError?.data?.message ??
            `Network #${id} was accepted, but authoritative readback did not match the requested segment.`
        )
      }
      history.push(PRODUCT_PATHS.NETWORK)
    } catch (reason) {
      setError(
        reason?.data?.message ??
          reason?.message ??
          'LayerSentry could not create and reconcile this network.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageFrame
      title="Create Network"
      description="Create an environment and tier segment through the native LayerSentry network API."
    >
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        {steps.map((label, index) => (
          <Button
            key={label}
            size="small"
            variant={step === index ? 'contained' : 'outlined'}
            disabled={index > step}
            onClick={() => index < step && setStep(index)}
            sx={{ textTransform: 'none' }}
          >
            {index + 1}. {label}
          </Button>
        ))}
      </Box>
      <Surface sx={{ mt: 2, p: { xs: 2, md: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {step === 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              gap: 2,
            }}
          >
            <SelectField
              label="Environment"
              value={draft.environment}
              onChange={update('environment')}
              options={NETWORK_ENVIRONMENTS}
            />
            <SelectField
              label="Tier"
              value={draft.tier}
              onChange={update('tier')}
              options={NETWORK_TIERS}
            />
            <Field
              label="Network name"
              value={draft.name}
              onChange={update('name')}
              error={errors.name}
            />
            <Field
              label="IPv4 CIDR"
              value={draft.cidr}
              onChange={update('cidr')}
              error={errors.cidr}
            />
            <SelectField
              label="Address delivery"
              value={draft.ipMode}
              onChange={update('ipMode')}
              options={NETWORK_IP_MODES}
            />
            <Field
              label="Gateway"
              value={draft.gateway}
              onChange={update('gateway')}
              error={errors.gateway}
            />
            <Field
              label="First allocatable IP"
              value={draft.firstIp}
              onChange={update('firstIp')}
              error={errors.firstIp}
            />
            <Field
              label="Address count"
              type="number"
              value={draft.size}
              onChange={update('size')}
              error={errors.size}
            />
            <Field
              label="DNS servers"
              value={draft.dns}
              onChange={update('dns')}
              error={errors.dns}
              helperText={
                errors.dns ?? 'Space- or comma-separated IPv4 addresses'
              }
            />
            <Field
              label="VLAN / segment ID"
              type="number"
              value={draft.vlanId}
              onChange={update('vlanId')}
              error={errors.vlanId}
            />
            {draft.vlanId !== '' && !draft.advanced && (
              <Field
                label="Physical uplink for VLAN"
                value={draft.uplink}
                onChange={update('uplink')}
                error={errors.uplink}
                helperText={
                  errors.uplink ??
                  'Host interface used by the native 802.1Q driver'
                }
              />
            )}
          </Box>
        )}
        {step === 1 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <SelectField
              label="Default communication policy"
              value={draft.policy}
              onChange={update('policy')}
              options={NETWORK_POLICIES}
            />
            <Field
              label="Firewall group IDs"
              value={draft.securityGroups}
              onChange={update('securityGroups')}
              error={errors.securityGroups}
              helperText={
                errors.securityGroups ??
                'LayerSentry-managed native security groups, comma separated'
              }
            />
            <Alert severity="info">
              Isolation is enforced by the selected native firewall groups. The
              environment or tier name alone never grants or blocks traffic.
            </Alert>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={draft.filterMacSpoofing}
                    onChange={update('filterMacSpoofing')}
                  />
                }
                label="Block MAC spoofing"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={draft.filterIpSpoofing}
                    onChange={update('filterIpSpoofing')}
                  />
                }
                label="Block IP spoofing"
              />
            </Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.advanced}
                  onChange={update('advanced')}
                />
              }
              label="Advanced options"
            />
            {draft.advanced && (
              <Box
                data-layersentry-network-advanced
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 2,
                }}
              >
                <SelectField
                  label="Native network driver"
                  value={draft.driver}
                  onChange={update('driver')}
                  options={[
                    ['fw', 'Bridged + firewall'],
                    ['802.1Q', '802.1Q VLAN'],
                    ['vxlan', 'VXLAN'],
                    ['ovswitch', 'Open vSwitch'],
                    ['ovswitch_vxlan', 'Open vSwitch VXLAN'],
                  ]}
                />
                <Field
                  label="Bridge"
                  value={draft.bridge}
                  onChange={update('bridge')}
                />
                <Field
                  label="Uplink device"
                  value={draft.uplink}
                  onChange={update('uplink')}
                />
                <Field
                  label="MTU"
                  type="number"
                  value={draft.mtu}
                  onChange={update('mtu')}
                  error={errors.mtu}
                />
              </Box>
            )}
            {errors.uplink && <Alert severity="warning">{errors.uplink}</Alert>}
          </Box>
        )}
        {step === 2 && (
          <Box data-layersentry-network-review sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="h6">Review</Typography>
            {[
              ['Segment', `${draft.environment} / ${draft.tier}`],
              ['Name', draft.name],
              [
                'Addresses',
                `${draft.cidr} · ${draft.ipMode} · ${draft.firstIp} + ${draft.size}`,
              ],
              ['VLAN', draft.vlanId || 'Untagged / backend default'],
              [
                'Policy',
                `${draft.policy} · firewall groups ${draft.securityGroups}`,
              ],
              [
                'vNIC protection',
                `${
                  draft.filterMacSpoofing
                    ? 'MAC anti-spoofing'
                    : 'MAC changes allowed'
                } · ${
                  draft.filterIpSpoofing
                    ? 'IP anti-spoofing'
                    : 'IP changes allowed'
                }`,
              ],
              ...(draft.advanced
                ? [
                    [
                      'Advanced',
                      `${draft.driver} · bridge ${
                        draft.bridge || 'default'
                      } · MTU ${draft.mtu || 'default'}`,
                    ],
                  ]
                : []),
            ].map(([label, value]) => (
              <Typography key={label}>
                <strong>{label}:</strong> {value}
              </Typography>
            ))}
            <Alert severity="info">
              Success is shown only after the created native network is read
              back and its identity, CIDR, range and segment metadata match.
            </Alert>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            onClick={() =>
              step === 0
                ? history.push(PRODUCT_PATHS.NETWORK)
                : setStep((value) => value - 1)
            }
            disabled={submitting}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={() => setStep((value) => value + 1)}
              disabled={
                step === 0 &&
                Boolean(
                  errors.name ||
                    errors.cidr ||
                    errors.gateway ||
                    errors.firstIp ||
                    errors.size ||
                    errors.vlanId ||
                    errors.dns ||
                    errors.uplink
                )
              }
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={submit}
              disabled={submitting || Object.keys(errors).length > 0}
            >
              {submitting ? 'Creating and reconciling…' : 'Create network'}
            </Button>
          )}
        </Box>
      </Surface>
    </PageFrame>
  )
}

export default NetworkCreateWizard
