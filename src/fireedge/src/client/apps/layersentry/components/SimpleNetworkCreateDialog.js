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
import PropTypes from 'prop-types'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import {
  SecurityGroupAPI,
  VnAPI,
  VnTemplateAPI,
  useGeneralApi,
} from '@FeaturesModule'
import { jsonToXml } from '@UtilsModule'
import {
  buildLayerSentryNetworkOverlay,
  isLayerSentryNetworkBlueprint,
  isLayerSentrySecurityGroupCompatible,
} from 'client/apps/layersentry/layersentryNetworkCreation'

const initialDraft = {
  name: '',
  description: '',
  blueprintId: '',
  environment: 'DEV',
  tier: 'APP',
  cidr: '',
  gateway: '',
  dns: '',
  rangeStart: '',
  rangeEnd: '',
  isolationPolicy: 'ISOLATED',
  securityGroupId: '',
}

const environments = [
  ['PROD', 'Production'],
  ['UAT', 'UAT'],
  ['DEV', 'Development'],
  ['STAGE', 'Stage'],
  ['CUSTOM', 'Custom'],
]
const tiers = [
  ['WEB', 'Web'],
  ['APP', 'Application'],
  ['DB', 'Database'],
  ['MANAGEMENT', 'Management'],
  ['BACKUP', 'Backup'],
  ['CUSTOM', 'Custom'],
]
const policies = [
  ['ISOLATED', 'Isolated'],
  ['SAME_APPLICATION', 'Same Application'],
  ['SAME_ENVIRONMENT', 'Same Environment'],
  ['CUSTOM', 'Custom firewall rules'],
]
const toArray = (value) =>
  value === undefined || value === null ? [] : [].concat(value)

const Field = ({ select, children, ...props }) => (
  <TextField fullWidth size="small" select={select} {...props}>
    {children}
  </TextField>
)
Field.propTypes = {
  select: PropTypes.bool,
  children: PropTypes.node,
}

const SimpleNetworkCreateDialog = ({ open, onClose }) => {
  const [draft, setDraft] = useState(initialDraft)
  const [review, setReview] = useState()
  const [error, setError] = useState('')
  const [created, setCreated] = useState()
  const { enqueueSuccess } = useGeneralApi()
  const { data: templates = [], isLoading: templatesLoading } =
    VnTemplateAPI.useGetVNTemplatesQuery(undefined, { skip: !open })
  const { data: securityGroups = [], isLoading: securityGroupsLoading } =
    SecurityGroupAPI.useGetSecGroupsQuery(undefined, { skip: !open })
  const [instantiate, instantiateState] =
    VnTemplateAPI.useInstantiateVNTemplateMutation()
  const [updateNetwork, updateState] = VnAPI.useUpdateVNetMutation()
  const [readNetwork] = VnAPI.useLazyGetVNetworkQuery()
  const { data: existingNetworks = [] } = VnAPI.useGetVNetworksQuery(
    undefined,
    { skip: !open }
  )
  const approvedTemplates = useMemo(
    () => templates.filter(isLayerSentryNetworkBlueprint),
    [templates]
  )
  const selectedBlueprint = approvedTemplates.find(
    ({ ID }) => `${ID}` === `${draft.blueprintId}`
  )
  const compatibleSecurityGroups = securityGroups.filter((securityGroup) =>
    isLayerSentrySecurityGroupCompatible(
      securityGroup,
      draft.isolationPolicy,
      draft.environment
    )
  )

  const update = (name) => (event) => {
    setDraft((current) => ({ ...current, [name]: event.target.value }))
    setReview(undefined)
    setError('')
  }

  const close = () => {
    if (instantiateState.isLoading) return
    setDraft(initialDraft)
    setReview(undefined)
    setCreated(undefined)
    setError('')
    onClose()
  }

  const prepareReview = () => {
    try {
      setReview(
        buildLayerSentryNetworkOverlay(
          draft,
          selectedBlueprint,
          compatibleSecurityGroups
        )
      )
      setError('')
    } catch (validationError) {
      setError(validationError.message)
    }
  }

  const submit = async () => {
    let allocatedId
    try {
      const request = buildLayerSentryNetworkOverlay(
        draft,
        selectedBlueprint,
        compatibleSecurityGroups
      )
      if (
        existingNetworks.some(
          ({ NAME }) => NAME?.trim().toLowerCase() === request.name.toLowerCase()
        )
      ) {
        throw new Error('A network with this name already exists')
      }

      const id = await instantiate({
        id: selectedBlueprint.ID,
        name: request.name,
        template: jsonToXml(request.template),
      }).unwrap()
      allocatedId = id
      let observed = await readNetwork({ id }).unwrap()
      const observedSecurityGroups = `${
        observed?.TEMPLATE?.SECURITY_GROUPS ?? ''
      }`
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      if (
        observedSecurityGroups.length !== 1 ||
        observedSecurityGroups[0] !== request.template.SECURITY_GROUPS
      ) {
        await updateNetwork({
          id,
          template: jsonToXml({
            ...(observed?.TEMPLATE ?? {}),
            SECURITY_GROUPS: request.template.SECURITY_GROUPS,
          }),
          replace: 0,
        }).unwrap()
        observed = await readNetwork({ id }).unwrap()
      }
      const observedRanges = toArray(observed?.AR_POOL?.AR)
      const observedRange = observedRanges.find(
        ({ IP, SIZE }) =>
          IP === request.template.AR.IP &&
          `${SIZE}` === `${request.template.AR.SIZE}`
      )
      if (
        `${observed?.ID}` !== `${id}` ||
        observed?.NAME !== request.name ||
        observed?.TEMPLATE?.LAYERSENTRY_ENVIRONMENT !== draft.environment ||
        `${observed?.TEMPLATE?.SECURITY_GROUPS}` !==
          `${request.template.SECURITY_GROUPS}` ||
        observed?.VN_MAD !== selectedBlueprint?.TEMPLATE?.VN_MAD ||
        !observedRange
      ) {
        throw new Error(
          `Network #${id} was accepted but authoritative readback is not yet complete`
        )
      }
      setCreated(observed)
      setError('')
      enqueueSuccess(`Network created - #${id} ${request.name}`)
    } catch (submitError) {
      setError(
        allocatedId
          ? `Network #${allocatedId} exists, but policy/readback reconciliation failed. Do not submit another create request; ask an administrator to reconcile this network.`
          : submitError?.data?.message ??
              submitError?.message ??
              'LayerSentry could not create the network.'
      )
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Create network</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {created ? (
          <Alert severity="success">
            Network {created.NAME} (#{created.ID}) is present in authoritative
            OpenNebula state.
          </Alert>
        ) : review ? (
          <Stack gap={1.25}>
            <Typography variant="h6">Review</Typography>
            <Typography>Name: {review.name}</Typography>
            <Typography>
              Blueprint: {selectedBlueprint?.NAME} (#{selectedBlueprint?.ID})
            </Typography>
            <Typography>
              Environment / tier: {review.template.LAYERSENTRY_ENVIRONMENT} /{' '}
              {review.template.LAYERSENTRY_TIER}
            </Typography>
            <Typography>
              Network: {review.template.NETWORK_ADDRESS} /{' '}
              {review.template.NETWORK_MASK}
            </Typography>
            <Typography>
              IP range: {review.template.AR.IP} ({review.template.AR.SIZE}{' '}
              addresses)
            </Typography>
            <Typography>
              Communication: {review.template.LAYERSENTRY_ISOLATION_POLICY};
              Firewall Rules #{review.template.SECURITY_GROUPS}
            </Typography>
            <Alert severity="info">
              Driver, bridge/uplink, VLAN and spoofing controls remain owned by
              the approved OpenNebula network blueprint.
            </Alert>
          </Stack>
        ) : (
          <Stack gap={2} sx={{ pt: 0.5 }}>
            {approvedTemplates.length === 0 && !templatesLoading && (
              <Alert severity="warning">
                No provider-approved network blueprint is available. An
                administrator must publish one before simple network creation.
              </Alert>
            )}
            {compatibleSecurityGroups.length === 0 &&
              !securityGroupsLoading && (
                <Alert severity="warning">
                  No approved Firewall Rules match the selected communication
                  policy. An administrator must publish an exact native policy
                  before this network can be created.
                </Alert>
              )}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2,
              }}
            >
              <Field
                label="Network name"
                value={draft.name}
                onChange={update('name')}
              />
              <Field
                select
                label="Network blueprint"
                value={draft.blueprintId}
                onChange={update('blueprintId')}
                disabled={templatesLoading}
              >
                <MenuItem value="">Select approved blueprint</MenuItem>
                {approvedTemplates.map(({ ID, NAME }) => (
                  <MenuItem key={ID} value={`${ID}`}>
                    {NAME}
                  </MenuItem>
                ))}
              </Field>
              <Field
                select
                label="Environment"
                value={draft.environment}
                onChange={update('environment')}
              >
                {environments.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Field>
              <Field
                select
                label="Tier"
                value={draft.tier}
                onChange={update('tier')}
              >
                {tiers.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Field>
              <Field
                label="CIDR"
                placeholder="10.20.30.0/24"
                value={draft.cidr}
                onChange={update('cidr')}
              />
              <Field
                label="Gateway"
                placeholder="10.20.30.1"
                value={draft.gateway}
                onChange={update('gateway')}
              />
              <Field
                label="IP range start"
                value={draft.rangeStart}
                onChange={update('rangeStart')}
              />
              <Field
                label="IP range end"
                value={draft.rangeEnd}
                onChange={update('rangeEnd')}
              />
              <Field
                label="DNS servers"
                placeholder="10.20.30.2 10.20.30.3"
                value={draft.dns}
                onChange={update('dns')}
              />
              <Field
                select
                label="Communication policy"
                value={draft.isolationPolicy}
                onChange={update('isolationPolicy')}
              >
                {policies.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Field>
              <Field
                select
                label="Firewall Rules"
                value={draft.securityGroupId}
                onChange={update('securityGroupId')}
                disabled={securityGroupsLoading}
              >
                <MenuItem value="">Select firewall rule set</MenuItem>
                {compatibleSecurityGroups.map(({ ID, NAME }) => (
                  <MenuItem key={ID} value={`${ID}`}>
                    {NAME} (#{ID})
                  </MenuItem>
                ))}
              </Field>
              <Field
                label="Description (optional)"
                value={draft.description}
                onChange={update('description')}
              />
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{created ? 'Close' : 'Cancel'}</Button>
        {!created && review && (
          <Button onClick={() => setReview(undefined)}>Back</Button>
        )}
        {!created && !review && (
          <Button variant="contained" onClick={prepareReview}>
            Review
          </Button>
        )}
        {!created && review && (
          <Button
            variant="contained"
            disabled={instantiateState.isLoading || updateState.isLoading}
            onClick={submit}
          >
            {instantiateState.isLoading || updateState.isLoading
              ? 'Creating…'
              : 'Create network'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

SimpleNetworkCreateDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
}

export default SimpleNetworkCreateDialog
