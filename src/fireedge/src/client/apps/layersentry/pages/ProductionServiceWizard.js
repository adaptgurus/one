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
/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import {
  CheckCircle,
  NavArrowDown,
  NavArrowLeft,
  WarningTriangle,
} from 'iconoir-react'
import {
  PageFrame,
  StatusPill,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors, radius } from 'client/apps/layersentry/theme/tokens'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  FALLBACK_BLUEPRINTS,
  LICENSE_NOTICES,
  SERVICE_BLUEPRINT_API,
  WIZARD_STEPS,
  compilePlatformDesiredState,
  createDraft,
  getArchitecturePlan,
  getBackupProfile,
  getBlueprintById,
  getCapacityProfile,
  getCredentialProfile,
  getDefaultDependencyState,
  getDependencyErrors,
  getDrProfile,
  getDependencyOptions,
  getDependencySpecs,
  getDependencySummary,
  getEndpointOptions,
  getNetworkProfile,
  getProductConfigErrors,
  getProductConfigFields,
  getProductSummary,
  getRecommendedTopology,
  getStorageTemplate,
  getTopologyOptions,
  sanitizeDesign,
  validateDraft,
  validateStep,
} from 'client/apps/layersentry/serviceBlueprints'

const Row = ({ children, columns = 2 }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: '1fr',
        md: 'repeat(' + columns + ', minmax(0, 1fr))',
      },
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
    {helperText && <FormHelperText>{helperText}</FormHelperText>}
  </FormControl>
)

const NumberField = ({ label, value, onChange, min = 0, helperText }) => (
  <TextField
    type="number"
    label={label}
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    inputProps={{ min }}
    helperText={helperText}
    fullWidth
  />
)

const ErrorList = ({ errors }) =>
  errors.length > 0 && (
    <Alert
      severity="error"
      icon={<WarningTriangle />}
      sx={{ mt: 2 }}
      data-testid="configuration-errors"
    >
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
        Configuration required
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
        {errors.map(({ code, message }) => (
          <Box component="li" key={code} sx={{ mb: 0.25 }}>
            {message}
          </Box>
        ))}
      </Box>
    </Alert>
  )

const AdvancedSection = ({
  title,
  description,
  expanded,
  onChange,
  children,
}) => (
  <Accordion
    expanded={expanded}
    onChange={(_, next) => onChange(next)}
    disableGutters
    elevation={0}
    sx={{
      mt: 2,
      border: '1px solid ' + colors.border,
      borderRadius: radius.md + 'px !important',
      overflow: 'hidden',
      '&::before': { display: 'none' },
    }}
  >
    <AccordionSummary
      expandIcon={<NavArrowDown width={18} height={18} />}
      sx={{ px: 2 }}
    >
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{title}</Typography>
        {description && (
          <Typography sx={{ color: colors.text.muted, fontSize: 11, mt: 0.25 }}>
            {description}
          </Typography>
        )}
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ borderTop: '1px solid ' + colors.border, p: 2 }}>
      {children}
    </AccordionDetails>
  </Accordion>
)

const getRuntimeCapabilities = (payload) => {
  const responseData = payload?.data ?? payload
  const capabilities = responseData?.capabilities

  if (!capabilities || typeof capabilities !== 'object') {
    return {
      available: false,
      durableStoreReady: false,
      providerMutationEnabled: false,
      deploymentEnabled: false,
      supportedBlueprints: [],
    }
  }

  return {
    available: capabilities.available === true,
    durableStoreReady: capabilities.durableStoreReady === true,
    providerMutationEnabled: capabilities.providerMutationEnabled === true,
    deploymentEnabled: capabilities.deploymentEnabled === true,
    supportedBlueprints: Array.isArray(capabilities.supportedBlueprints)
      ? capabilities.supportedBlueprints
      : [],
  }
}

const mergeRuntimeCatalog = (payload) => {
  const responseData = payload?.data ?? payload
  const items = Array.isArray(responseData)
    ? responseData
    : Array.isArray(responseData?.items)
    ? responseData.items
    : Array.isArray(responseData?.blueprints)
    ? responseData.blueprints
    : []
  const capabilities = getRuntimeCapabilities(payload)
  const supported = new Set(capabilities.supportedBlueprints)

  if (!items.length) return null

  const merged = FALLBACK_BLUEPRINTS.map((fallback) => {
    const runtime = items.find(
      (item) =>
        item.id === fallback.id ||
        item.blueprintId === fallback.id ||
        item.name === fallback.name
    )
    if (!runtime) {
      return {
        ...fallback,
        controlPlaneAvailable: capabilities.available,
        sourceRoleAvailable:
          capabilities.available && supported.has(fallback.id),
        deploymentBackendEnabled: capabilities.deploymentEnabled,
      }
    }

    return {
      ...fallback,
      versions:
        Array.isArray(runtime.versions) && runtime.versions.length
          ? runtime.versions
          : fallback.versions,
      topologies:
        Array.isArray(runtime.topologies) && runtime.topologies.length
          ? runtime.topologies
          : fallback.topologies,
      qualification: runtime.qualification || fallback.qualification,
      productionSelectable: runtime.productionSelectable === true,
      sourceRoleAvailable:
        runtime.sourceRoleAvailable === true ||
        (capabilities.available && supported.has(fallback.id)),
      controlPlaneAvailable: capabilities.available,
      deploymentBackendEnabled: capabilities.deploymentEnabled,
      runtime: true,
    }
  })

  return merged
}

const ProductField = ({ field, draft, update }) => {
  if (field.type === 'switch') {
    return (
      <Surface sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
              {field.label}
            </Typography>
            {field.helper && (
              <Typography
                sx={{ color: colors.text.muted, fontSize: 11, mt: 0.25 }}
              >
                {field.helper}
              </Typography>
            )}
          </Box>
          <Switch
            checked={Boolean(draft[field.key])}
            onChange={(event) => update(field.key, event.target.checked)}
          />
        </Box>
      </Surface>
    )
  }

  if (field.type === 'select') {
    return (
      <SelectField
        label={field.label}
        value={draft[field.key] ?? ''}
        onChange={(value) => update(field.key, value)}
        helperText={field.helper}
      >
        {field.options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </SelectField>
    )
  }

  if (field.type === 'number') {
    return (
      <NumberField
        label={field.label}
        value={draft[field.key] ?? ''}
        onChange={(value) => update(field.key, value)}
        min={field.min ?? 0}
        helperText={field.helper}
      />
    )
  }

  return (
    <TextField
      fullWidth
      label={field.label}
      value={draft[field.key] ?? ''}
      onChange={(event) => update(field.key, event.target.value)}
      helperText={field.helper}
    />
  )
}

const ProductionServiceWizard = () => {
  const history = useHistory()
  const [catalog, setCatalog] = useState(FALLBACK_BLUEPRINTS)
  const [catalogState, setCatalogState] = useState('fallback')
  const [capabilityState, setCapabilityState] = useState(() =>
    getRuntimeCapabilities(null)
  )
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => createDraft('postgresql'))
  const [attemptedStep, setAttemptedStep] = useState(null)
  const [validated, setValidated] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [preflightState, setPreflightState] = useState({
    status: 'idle',
    result: null,
  })
  const [deploymentState, setDeploymentState] = useState({
    status: 'idle',
    result: null,
  })
  const [deploymentKey, setDeploymentKey] = useState('')

  useEffect(() => {
    let active = true

    fetch(SERVICE_BLUEPRINT_API, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('catalog unavailable')

        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const merged = mergeRuntimeCatalog(payload)
        if (merged) {
          setCatalog(merged)
          setCatalogState('runtime')
          setCapabilityState(getRuntimeCapabilities(payload))
          setDraft((current) => {
            const runtime = getBlueprintById(current.blueprintId, merged)
            if (!runtime) return current

            return {
              ...current,
              version: runtime.versions.includes(current.version)
                ? current.version
                : runtime.versions[0] || '',
            }
          })
        }
      })
      .catch(() => {
        if (active) {
          setCatalogState('fallback')
          setCapabilityState(getRuntimeCapabilities(null))
        }
      })

    return () => {
      active = false
    }
  }, [])

  const blueprint = useMemo(
    () => getBlueprintById(draft.blueprintId, catalog),
    [catalog, draft.blueprintId]
  )
  const architecture = useMemo(
    () => getArchitecturePlan(draft, blueprint),
    [draft, blueprint]
  )
  const topologyOptions = useMemo(
    () => getTopologyOptions(draft, blueprint),
    [draft, blueprint]
  )
  const endpointOptions = useMemo(
    () => getEndpointOptions(draft, blueprint),
    [draft, blueprint]
  )
  const productFields = useMemo(
    () => getProductConfigFields(draft, blueprint),
    [draft, blueprint]
  )
  const productErrors = useMemo(
    () => getProductConfigErrors(draft, blueprint),
    [draft, blueprint]
  )
  const dependencySpecs = useMemo(
    () => getDependencySpecs(draft, blueprint),
    [draft, blueprint]
  )
  const dependencyErrors = useMemo(
    () => getDependencyErrors(draft, blueprint),
    [draft, blueprint]
  )
  const credentialProfile = useMemo(
    () => getCredentialProfile(blueprint),
    [blueprint]
  )
  const backupProfile = useMemo(() => getBackupProfile(blueprint), [blueprint])
  const capacityProfile = useMemo(
    () => getCapacityProfile(blueprint),
    [blueprint]
  )
  const drProfile = useMemo(
    () => getDrProfile(draft, blueprint),
    [draft.topology, blueprint]
  )
  const networkProfile = useMemo(
    () => getNetworkProfile(draft, blueprint),
    [draft, blueprint]
  )
  const currentErrors = useMemo(
    () => validateStep(step, draft, blueprint),
    [step, draft, blueprint]
  )
  const allErrors = useMemo(
    () => validateDraft(draft, blueprint),
    [draft, blueprint]
  )

  const update = (key, value) => {
    setValidated(false)
    setPreflightState({ status: 'idle', result: null })
    setDraft((current) => {
      let next = { ...current, [key]: value }

      if (
        (key === 'edition' || key === 'blueprintId') &&
        blueprint?.id === 'mysql-family'
      ) {
        const nextBlueprint = getBlueprintById(
          next.blueprintId || current.blueprintId,
          catalog
        )
        const recommended = getRecommendedTopology(next, nextBlueprint)
        next = { ...next, topology: recommended }
      }

      if (
        key === 'topology' ||
        key === 'edition' ||
        key === 'pulsarConfigStore' ||
        key === 'promAlerting'
      ) {
        const targetBlueprint = getBlueprintById(next.blueprintId, catalog)
        const endpointChoices = getEndpointOptions(next, targetBlueprint)
        const dependencyState =
          key === 'topology' || key === 'edition'
            ? getDefaultDependencyState(next, targetBlueprint)
            : {
                dependencyModes: next.dependencyModes,
                dependencyRefs: next.dependencyRefs,
              }

        next = {
          ...next,
          ...dependencyState,
          endpointMode: endpointChoices.includes(next.endpointMode)
            ? next.endpointMode
            : endpointChoices[0] || '',
          storage: getStorageTemplate(next, targetBlueprint),
        }
      }

      if (key === 'kvPersistence' && value === 'Cache-only (no durability)') {
        next = { ...next, backupEnabled: false, pitr: false }
      }

      if (key === 'backupEnabled' && value === false) {
        next = { ...next, pitr: false }
      }

      return next
    })
  }

  const updateAdvancedOpen = (section, open) =>
    setDraft((current) => ({
      ...current,
      advancedOpen: {
        ...current.advancedOpen,
        [section]: open,
      },
    }))

  const selectBlueprint = (id) => {
    const next = createDraft(id, catalog)
    setDraft(next)
    setStep(0)
    setAttemptedStep(null)
    setValidated(false)
    setPreflightState({ status: 'idle', result: null })
  }

  const updateStorage = (index, patch) => {
    setValidated(false)
    setPreflightState({ status: 'idle', result: null })
    setDraft((current) => ({
      ...current,
      storage: current.storage.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  const updateDependencyMode = (dependency, mode) => {
    setValidated(false)
    setPreflightState({ status: 'idle', result: null })
    setDraft((current) => ({
      ...current,
      dependencyModes: {
        ...current.dependencyModes,
        [dependency.key]: mode,
      },
      dependencyRefs: {
        ...current.dependencyRefs,
        [dependency.key]: '',
      },
    }))
  }

  const updateDependencyRef = (dependency, value) => {
    setValidated(false)
    setPreflightState({ status: 'idle', result: null })
    setDraft((current) => ({
      ...current,
      dependencyRefs: {
        ...current.dependencyRefs,
        [dependency.key]: value,
      },
    }))
  }

  const productAdvancedActive =
    productErrors.length > 0 ||
    dependencyErrors.length > 0 ||
    draft.postgis === true ||
    (blueprint?.id === 'postgresql' &&
      draft.pgbouncerPlacement !== 'On PostgreSQL nodes')

  const networkAdvancedActive =
    draft.ipMode === 'Static' ||
    (networkProfile.singleEndpoint &&
      (draft.endpointMode === 'Existing load balancer' ||
        draft.portPolicy !== 'Use product default')) ||
    (networkProfile.nativeDiscovery &&
      draft.portPolicy !== 'Use product default')

  const isAdvancedOpen = (section, active) =>
    Boolean(active || draft.advancedOpen?.[section])

  const setAdvancedOpen = (section, active, next) => {
    if (active && !next) return
    updateAdvancedOpen(section, next)
  }

  const syncTopologyForEdition = (edition) => {
    setDraft((current) => {
      const withEdition = { ...current, edition }
      const currentBlueprint = getBlueprintById(current.blueprintId, catalog)
      const recommended = getRecommendedTopology(withEdition, currentBlueprint)
      const next = {
        ...withEdition,
        topology: recommended,
      }
      const endpointChoices = getEndpointOptions(next, currentBlueprint)

      return {
        ...next,
        ...getDefaultDependencyState(next, currentBlueprint),
        endpointMode: endpointChoices.includes(current.endpointMode)
          ? current.endpointMode
          : endpointChoices[0] || '',
        storage: getStorageTemplate(next, currentBlueprint),
      }
    })
    setValidated(false)
  }

  const validateAndMove = (targetStep) => {
    const errors = validateStep(step, draft, blueprint)
    if (targetStep > step && errors.length) {
      setAttemptedStep(step)

      return
    }
    setAttemptedStep(null)
    setStep(targetStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderArchitecture = () => (
    <Surface sx={{ mt: 2, overflow: 'hidden' }} data-testid="vm-footprint">
      <Box
        sx={{
          p: 2,
          backgroundColor: colors.surfaceMuted,
          borderBottom: '1px solid ' + colors.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800 }}>
            Deployment architecture
          </Typography>
          <Typography sx={{ color: colors.text.muted, fontSize: 11, mt: 0.5 }}>
            Every service-owned component and external/shared dependency is
            visible before capacity is reserved.
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 120 }}>
          <Typography
            sx={{ color: colors.brand.primary, fontSize: 24, fontWeight: 850 }}
          >
            {architecture.dedicated}
            {architecture.minimum ? '+' : ''}
          </Typography>
          <Typography sx={{ color: colors.text.muted, fontSize: 10 }}>
            new dedicated VMs
          </Typography>
        </Box>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: '1.1fr 1.6fr 0.55fr 0.55fr',
          },
        }}
      >
        {['Component', 'Placement', 'Instances', 'Adds VMs'].map((label) => (
          <Box
            key={label}
            sx={{
              display: { xs: 'none', md: 'block' },
              p: 1.25,
              backgroundColor: colors.surfaceMuted,
              borderBottom: '1px solid ' + colors.border,
              color: colors.text.muted,
              fontSize: 9,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </Box>
        ))}
        {architecture.components.map((item) => (
          <Box
            key={item.name + '-' + item.placement}
            sx={{
              display: { xs: 'grid', md: 'contents' },
              gridTemplateColumns: '1fr auto',
              borderBottom: {
                xs: '1px solid ' + colors.border,
                md: 'none',
              },
            }}
          >
            <Box
              sx={{
                p: 1.5,
                borderBottom: { md: '1px solid ' + colors.border },
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 12 }}>
                {item.name}
              </Typography>
              <Typography
                sx={{ color: colors.text.muted, fontSize: 10, mt: 0.25 }}
              >
                {item.note}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderBottom: { md: '1px solid ' + colors.border },
                fontSize: 11,
              }}
            >
              {item.placement}
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderBottom: { md: '1px solid ' + colors.border },
                fontSize: 11,
              }}
            >
              {item.instances}
            </Box>
            <Box
              sx={{
                p: 1.5,
                borderBottom: { md: '1px solid ' + colors.border },
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              {item.addsVms}
            </Box>
          </Box>
        ))}
      </Box>
      {architecture.shared.length > 0 && (
        <Alert severity="info" sx={{ m: 2 }}>
          Shared / existing dependencies: {architecture.shared.join(' · ')}
        </Alert>
      )}
    </Surface>
  )

  const renderService = () => {
    const categories = [...new Set(catalog.map(({ category }) => category))]

    return (
      <>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Choose a production service
        </Typography>
        <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
          Choose the application. Guest OS, image digest and low-level tuning
          remain qualification-controlled and are intentionally hidden.
        </Typography>
        {catalogState === 'runtime' && capabilityState.available && (
          <Alert severity="info" sx={{ mb: 2 }}>
            VM-service backend reports source-role coverage for{' '}
            {capabilityState.supportedBlueprints.length} of 27 families. Source
            coverage does not make an exact tuple production-selectable.
          </Alert>
        )}
        {catalogState === 'runtime' && !capabilityState.available && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The application catalog is available, but VM-service capability
            state could not be read. You can design a configuration, but
            authoritative preflight must succeed before Deploy is enabled.
          </Alert>
        )}
        {LICENSE_NOTICES[draft.blueprintId] && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {LICENSE_NOTICES[draft.blueprintId]}
          </Alert>
        )}
        {categories.map((category) => (
          <Box key={category} sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1 }}>
              {category}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  lg: 'repeat(3, 1fr)',
                },
                gap: 1.25,
              }}
            >
              {catalog
                .filter((item) => item.category === category)
                .map((item) => (
                  <Surface
                    key={item.id}
                    component="button"
                    type="button"
                    data-testid={'service-' + item.id}
                    onClick={() => selectBlueprint(item.id)}
                    sx={{
                      p: 1.75,
                      textAlign: 'left',
                      cursor: 'pointer',
                      border:
                        '1px solid ' +
                        (draft.blueprintId === item.id
                          ? colors.brand.primary
                          : colors.border),
                      backgroundColor:
                        draft.blueprintId === item.id
                          ? colors.status.infoSoft
                          : colors.surface,
                      '&:hover': {
                        borderColor: colors.focus,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: radius.sm + 'px',
                        display: 'grid',
                        placeItems: 'center',
                        color: colors.brand.primary,
                        backgroundColor: colors.status.infoSoft,
                        fontWeight: 850,
                        fontSize: 12,
                        mb: 1,
                      }}
                    >
                      {item.icon}
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
                      {item.name}
                    </Typography>
                    <Typography
                      sx={{ color: colors.text.muted, fontSize: 11, mt: 0.5 }}
                    >
                      {item.description}
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.75,
                        flexWrap: 'wrap',
                        mt: 1,
                      }}
                    >
                      <StatusPill
                        label={
                          item.controlPlaneAvailable
                            ? item.sourceRoleAvailable
                              ? 'Ansible role available'
                              : 'Role not available'
                            : 'Role status unknown'
                        }
                        tone={
                          item.controlPlaneAvailable
                            ? item.sourceRoleAvailable
                              ? 'success'
                              : 'warning'
                            : 'info'
                        }
                      />
                      <StatusPill
                        label={item.qualification}
                        tone={item.productionSelectable ? 'success' : 'warning'}
                      />
                    </Box>
                  </Surface>
                ))}
            </Box>
          </Box>
        ))}
      </>
    )
  }

  const renderDependencies = () =>
    dependencySpecs.length > 0 && (
      <Surface sx={{ mt: 2, p: 2 }} data-testid="dependency-plan">
        <Typography sx={{ fontWeight: 800 }}>
          Required dependency plan
        </Typography>
        <Typography
          sx={{ color: colors.text.muted, fontSize: 11, mt: 0.25, mb: 1.5 }}
        >
          Dependencies are not silently assumed to exist. Provisioned linked
          service VMs are included in the total VM footprint; existing
          dependencies require an explicit reference.
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {dependencySpecs.map((dependency) => {
            const mode =
              draft.dependencyModes?.[dependency.key] ||
              getDependencyOptions(dependency)[0]
            const requiresReference = mode === dependency.existingLabel
            const addsVms =
              dependency.kind === 'service' &&
              mode === dependency.provisionLabel
                ? Number(dependency.vmEstimate || 0)
                : 0

            return (
              <Surface key={dependency.key} sx={{ p: 1.5 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 2,
                    mb: 1.25,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
                      {dependency.label}
                    </Typography>
                    <Typography
                      sx={{ color: colors.text.muted, fontSize: 11, mt: 0.25 }}
                    >
                      {dependency.note}
                    </Typography>
                  </Box>
                  <StatusPill
                    label={
                      addsVms
                        ? '+' + addsVms + ' linked VMs'
                        : 'external/shared'
                    }
                    tone={addsVms ? 'success' : 'info'}
                  />
                </Box>
                <Row>
                  <SelectField
                    label="Dependency handling"
                    value={mode}
                    onChange={(value) =>
                      updateDependencyMode(dependency, value)
                    }
                  >
                    {getDependencyOptions(dependency).map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </SelectField>
                  {requiresReference && (
                    <TextField
                      label={dependency.refLabel}
                      value={draft.dependencyRefs?.[dependency.key] || ''}
                      onChange={(event) =>
                        updateDependencyRef(dependency, event.target.value)
                      }
                      helperText="Reference only. Do not paste raw credentials."
                      fullWidth
                    />
                  )}
                </Row>
              </Surface>
            )
          })}
        </Box>
        <ErrorList
          errors={dependencyErrors.map((message, index) => ({
            code: 'DEPENDENCY_' + String(index + 1),
            message,
          }))}
        />
      </Surface>
    )

  const renderDeployment = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Version & Deployment
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Select application release and topology. The VM footprint below shows
        all service-owned components before infrastructure is reserved.
      </Typography>
      <Row columns={blueprint?.editions ? 3 : 2}>
        {blueprint?.editions && (
          <SelectField
            label="Edition"
            value={draft.edition}
            onChange={syncTopologyForEdition}
          >
            {blueprint.editions.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SelectField>
        )}
        <SelectField
          label="Version"
          value={draft.version}
          onChange={(value) => update('version', value)}
        >
          {(blueprint?.versions || []).map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </SelectField>
        <SelectField
          label="Deployment topology"
          value={draft.topology}
          onChange={(value) => update('topology', value)}
        >
          {topologyOptions.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </SelectField>
      </Row>

      {renderArchitecture()}
      {renderDependencies()}

      {productFields.length > 0 && (
        <AdvancedSection
          title="Application configuration"
          description="Product-level inputs that materially change readiness. Required fields remain visible until configured."
          expanded={isAdvancedOpen('product', productAdvancedActive)}
          onChange={(next) =>
            setAdvancedOpen('product', productAdvancedActive, next)
          }
        >
          <Row>
            {productFields.map((field) => (
              <ProductField
                key={field.key}
                field={field}
                draft={draft}
                update={update}
              />
            ))}
          </Row>
          <ErrorList
            errors={productErrors.map((message, index) => ({
              code: 'PRODUCT_' + String(index + 1),
              message,
            }))}
          />
        </AdvancedSection>
      )}
      {attemptedStep === step && <ErrorList errors={currentErrors} />}
    </>
  )

  const renderCapacity = () => {
    const presets = {
      Small: { vcpu: 2, memoryGiB: 8 },
      Medium: { vcpu: 8, memoryGiB: 32 },
      Large: { vcpu: 16, memoryGiB: 64 },
    }

    const choosePreset = (preset) => {
      if (preset === 'Custom') {
        update('capacityPreset', 'Custom')

        return
      }
      const sizing = presets[preset]
      setDraft((current) => ({
        ...current,
        capacityPreset: preset,
        vcpu: sizing.vcpu,
        memoryGiB: sizing.memoryGiB,
      }))
      setValidated(false)
    }

    return (
      <>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Capacity
        </Typography>
        <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
          CPU and memory are per primary service node. Auxiliary components
          shown in the VM footprint are sized separately by their qualified
          component profile.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 1,
            mb: 2,
          }}
        >
          {['Small', 'Medium', 'Large', 'Custom'].map((preset) => (
            <Button
              key={preset}
              variant={
                draft.capacityPreset === preset ? 'contained' : 'outlined'
              }
              onClick={() => choosePreset(preset)}
              sx={{ textTransform: 'none' }}
            >
              {preset}
            </Button>
          ))}
        </Box>
        <Row>
          <NumberField
            label="vCPU per primary service node"
            value={draft.vcpu}
            onChange={(value) => update('vcpu', value)}
            min={1}
          />
          <NumberField
            label="Memory per primary service node (GiB)"
            value={draft.memoryGiB}
            onChange={(value) => update('memoryGiB', value)}
            min={1}
          />
          {capacityProfile.data && (
            <NumberField
              label={capacityProfile.dataLabel}
              value={draft.expectedDataGiB}
              onChange={(value) => update('expectedDataGiB', value)}
            />
          )}
          {capacityProfile.load && (
            <NumberField
              label={capacityProfile.loadLabel}
              value={draft.expectedConnections}
              onChange={(value) => update('expectedConnections', value)}
            />
          )}
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
          {capacityProfile.growth && (
            <NumberField
              label="Expected annual growth (%)"
              value={draft.expectedGrowthPercent}
              onChange={(value) => update('expectedGrowthPercent', value)}
            />
          )}
        </Row>
        <Alert severity="info" sx={{ mt: 2 }}>
          Current design: {architecture.dedicated}
          {architecture.minimum ? '+' : ''} new dedicated VMs. LayerSentry uses
          these inputs for safe baseline sizing; it does not rewrite application
          schemas, indexes or business logic.
        </Alert>
        {attemptedStep === step && <ErrorList errors={currentErrors} />}
      </>
    )
  }

  const renderStorage = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Storage
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Storage is application-aware. Only service-owned persistent volumes are
        shown here; recovery repositories and linked dependencies are configured
        in their native workflow sections.
      </Typography>
      {(draft.storage || []).length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This service has no application-local persistent volume in the
          selected profile. Authoritative state is owned by the linked
          dependency plan or immutable configuration/artifacts.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {(draft.storage || []).map((item, index) => (
          <Surface key={item.role + '-' + index} sx={{ p: 2 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
                mb: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{item.role}</Typography>
                <Typography sx={{ color: colors.text.muted, fontSize: 11 }}>
                  {item.scope}
                </Typography>
              </Box>
              {item.dependency && (
                <Chip size="small" label="linked dependency" />
              )}
            </Box>
            {item.dependency ? (
              <TextField
                fullWidth
                label={item.role + ' reference'}
                value={item.attachmentRef || ''}
                onChange={(event) =>
                  updateStorage(index, {
                    attachmentRef: event.target.value,
                  })
                }
                helperText="Reference an existing service, endpoint, object store or approved dependency. Raw credentials do not belong here."
              />
            ) : (
              <Row columns={3}>
                <TextField
                  label="Storage pool / repository"
                  value={item.storagePool}
                  onChange={(event) =>
                    updateStorage(index, {
                      storagePool: event.target.value,
                    })
                  }
                />
                <NumberField
                  label="Size (GiB)"
                  value={item.sizeGiB}
                  onChange={(value) => updateStorage(index, { sizeGiB: value })}
                  min={1}
                />
                <SelectField
                  label="Layout"
                  value={item.layout}
                  onChange={(value) =>
                    updateStorage(index, {
                      layout: value,
                    })
                  }
                >
                  {['Single disk', 'Existing SAN / LUN', 'Existing mount'].map(
                    (value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    )
                  )}
                </SelectField>
                {item.layout !== 'Existing mount' && (
                  <TextField
                    label="Native mount path"
                    value={item.mountpoint || ''}
                    disabled
                    helperText="Resolved by the application blueprint; filesystem is selected by the qualified OS tuple."
                  />
                )}
                {(item.layout === 'Existing SAN / LUN' ||
                  item.layout === 'Existing mount') && (
                  <TextField
                    label="Existing storage reference"
                    value={item.attachmentRef || ''}
                    onChange={(event) =>
                      updateStorage(index, {
                        attachmentRef: event.target.value,
                      })
                    }
                    helperText="Use an approved LUN/WWN/target/export reference; never guess disk ownership."
                  />
                )}
                {item.layout === 'Existing mount' && (
                  <TextField
                    label="Mount path"
                    value={item.mountpoint || ''}
                    onChange={(event) =>
                      updateStorage(index, {
                        mountpoint: event.target.value,
                      })
                    }
                    placeholder="/srv/application"
                  />
                )}
              </Row>
            )}
          </Surface>
        ))}
      </Box>

      {attemptedStep === step && <ErrorList errors={currentErrors} />}
    </>
  )

  const renderNetwork = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Network & Availability
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Configure node identity and the application&apos;s native access model.
        DNS automation and scheduler placement are operational integrations, not
        customer toggles in this workflow.
      </Typography>
      <Row>
        <TextField
          label="Service name"
          value={draft.serviceName}
          onChange={(event) => update('serviceName', event.target.value)}
        />
        <TextField
          label="Node DNS domain"
          value={draft.domain}
          onChange={(event) => update('domain', event.target.value)}
          placeholder="prod.example.internal"
        />
        {networkProfile.singleEndpoint && (
          <TextField
            label="Desired service FQDN"
            value={draft.serviceFqdn}
            onChange={(event) => update('serviceFqdn', event.target.value)}
            placeholder="service.prod.example.internal"
            helperText="Desired endpoint identity; external DNS publication is handled outside this blueprint until a DNS provider is connected."
          />
        )}
        {networkProfile.singleEndpoint && endpointOptions.length > 1 && (
          <SelectField
            label="Service endpoint"
            value={draft.endpointMode}
            onChange={(value) => update('endpointMode', value)}
          >
            {endpointOptions.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </SelectField>
        )}
        {networkProfile.singleEndpoint && endpointOptions.length === 1 && (
          <TextField
            label="Service endpoint"
            value={endpointOptions[0] || ''}
            disabled
          />
        )}
        {networkProfile.nativeDiscovery && (
          <TextField
            label="Native discovery model"
            value={endpointOptions[0] || draft.endpointMode}
            disabled
            helperText="Clients use the application's native node/bootstrap discovery; no synthetic load-balancer endpoint is created."
          />
        )}
        {networkProfile.mode === 'none' && (
          <Alert severity="info">
            This blueprint has no customer-facing service endpoint. The domain
            is used only for managed node identity.
          </Alert>
        )}
        <SelectField
          label="Node IP assignment"
          value={draft.ipMode}
          onChange={(value) => update('ipMode', value)}
        >
          <MenuItem value="Automatic">Automatic</MenuItem>
          <MenuItem value="Static">Static</MenuItem>
        </SelectField>
      </Row>

      {(networkProfile.customerTraffic || draft.ipMode === 'Static') && (
        <AdvancedSection
          title="Advanced network"
          description="Static node addresses, external endpoint references and qualified non-default service ports."
          expanded={isAdvancedOpen('network', networkAdvancedActive)}
          onChange={(next) =>
            setAdvancedOpen('network', networkAdvancedActive, next)
          }
        >
          <Row>
            {draft.ipMode === 'Static' && (
              <TextField
                multiline
                minRows={3}
                label="Static node IP addresses"
                value={draft.staticIps}
                onChange={(event) => update('staticIps', event.target.value)}
                helperText={
                  'Exactly ' +
                  String(
                    architecture.addressableNodes || architecture.dedicated
                  ) +
                  ' addresses are required for the service-owned VM footprint.'
                }
              />
            )}

            {networkProfile.singleEndpoint &&
              draft.endpointMode === 'Existing load balancer' && (
                <TextField
                  label="Existing VIP / endpoint reference"
                  value={draft.externalEndpoint}
                  onChange={(event) =>
                    update('externalEndpoint', event.target.value)
                  }
                  helperText="Reference an already managed/qualified external endpoint; LayerSentry does not create it in this workflow."
                />
              )}

            {networkProfile.customerTraffic && (
              <SelectField
                label="Service port policy"
                value={draft.portPolicy}
                onChange={(value) => update('portPolicy', value)}
              >
                <MenuItem value="Use product default">
                  Use product default
                </MenuItem>
                <MenuItem value="Custom qualified port">
                  Custom qualified port
                </MenuItem>
              </SelectField>
            )}
            {networkProfile.customerTraffic &&
              draft.portPolicy === 'Custom qualified port' && (
                <NumberField
                  label="Custom service port"
                  value={draft.customPort}
                  onChange={(value) => update('customPort', value)}
                  min={1}
                />
              )}
          </Row>
        </AdvancedSection>
      )}
      {attemptedStep === step && <ErrorList errors={currentErrors} />}
    </>
  )

  const renderBackup = () => {
    const directBackup = backupProfile.mode === 'direct'

    return (
      <>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Backup & Recovery
        </Typography>
        <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
          Replication and VM snapshots are not labelled as application backup.
          Recovery ownership is specific to the selected application.
        </Typography>

        {directBackup ? (
          <>
            <Surface sx={{ p: 2, mb: 2 }}>
              <Typography sx={{ fontWeight: 800 }}>
                {backupProfile.engine}
              </Typography>
              <Typography
                sx={{ color: colors.text.muted, fontSize: 11, mt: 0.5 }}
              >
                {backupProfile.note}
              </Typography>
            </Surface>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.backupEnabled}
                  onChange={(event) =>
                    update('backupEnabled', event.target.checked)
                  }
                />
              }
              label="Application-aware backup"
            />
            {draft.backupEnabled && (
              <Row>
                <TextField
                  label="Backup repository reference"
                  value={draft.backupRepositoryRef}
                  onChange={(event) =>
                    update('backupRepositoryRef', event.target.value)
                  }
                  helperText="Object store, backup service, repository or other approved target."
                />
                <NumberField
                  label="Retention (days)"
                  value={draft.retentionDays}
                  onChange={(value) => update('retentionDays', value)}
                  min={1}
                />
                {blueprint?.supportsPitr && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={draft.pitr}
                        onChange={(event) =>
                          update('pitr', event.target.checked)
                        }
                      />
                    }
                    label="Point-in-time recovery"
                  />
                )}
                {blueprint?.supportsPitr && draft.pitr && (
                  <NumberField
                    label="PITR recovery window (hours)"
                    value={draft.pitrWindowHours}
                    onChange={(value) => update('pitrWindowHours', value)}
                    min={1}
                  />
                )}
              </Row>
            )}
          </>
        ) : (
          <Alert
            severity={backupProfile.mode === 'dependency' ? 'info' : 'warning'}
          >
            <Typography sx={{ fontWeight: 800 }}>
              {backupProfile.mode === 'dependency'
                ? 'Recovery is owned by linked dependencies'
                : 'No generic application backup is advertised'}
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 12 }}>
              {backupProfile.engine}. {backupProfile.note}
            </Typography>
          </Alert>
        )}

        <Alert severity="warning" sx={{ mt: 2 }}>
          VM/storage snapshots are not treated as application backup. Production
          promotion requires a real restore test for the exact service tuple.
        </Alert>

        {drProfile.configuredByTopology && (
          <AdvancedSection
            title="Native Disaster Recovery"
            description={
              (drProfile.label || 'Application-native DR') +
              ' is implied by the selected topology. Configure only the target and recovery objectives.'
            }
            expanded={isAdvancedOpen('backup', true)}
            onChange={(next) => setAdvancedOpen('backup', true, next)}
          >
            <Alert severity="info" sx={{ mb: 2 }}>
              DR is enabled by the selected native application topology; there
              is no separate generic DR switch.
            </Alert>
            <Row>
              <TextField
                label="DR target site / profile"
                value={draft.drTarget}
                onChange={(event) => update('drTarget', event.target.value)}
              />
              <NumberField
                label="RPO (minutes)"
                value={draft.rpoMinutes}
                onChange={(value) => update('rpoMinutes', value)}
              />
              <NumberField
                label="RTO (minutes)"
                value={draft.rtoMinutes}
                onChange={(value) => update('rtoMinutes', value)}
              />
            </Row>
          </AdvancedSection>
        )}
        {attemptedStep === step && <ErrorList errors={currentErrors} />}
      </>
    )
  }

  const renderSecurity = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Security & Observability
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Production security, OS access and observability policy are
        backend-owned. This page collects only external secret/package
        references that the execution backend can actually consume.
      </Typography>

      <Surface sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 800 }}>
          Enforced production policy
        </Typography>
        <Typography
          sx={{ color: colors.text.secondary, fontSize: 12, mt: 0.75 }}
        >
          Managed SSH-key bootstrap · standard production hardening ·
          tuple-qualified monitoring/logging. These are not optional customer
          toggles.
        </Typography>
      </Surface>

      <Surface sx={{ p: 2, mt: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>
          TLS and application credential references
        </Typography>
        {networkProfile.customerTraffic ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            TLS is mandatory for the production service endpoint. The current
            backend accepts existing secret:// certificate bundles; managed PKI
            generation is not advertised until a provider is implemented.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            This blueprint exposes no customer service endpoint, so no inbound
            service certificate is requested here. Any outbound TLS trust
            belongs to the application configuration bundle.
          </Alert>
        )}
        <Row>
          {networkProfile.customerTraffic && (
            <TextField
              label="TLS certificate secret:// reference"
              value={draft.tlsCertificateRef}
              onChange={(event) =>
                update('tlsCertificateRef', event.target.value)
              }
              helperText="Existing secret bundle only; never paste certificate/private-key material."
              fullWidth
            />
          )}
          {credentialProfile.required && (
            <TextField
              label={credentialProfile.refLabel}
              value={draft.credentialRef}
              onChange={(event) => update('credentialRef', event.target.value)}
              helperText="Existing secret bundle only; raw passwords/tokens are never persisted in the design."
              fullWidth
            />
          )}
        </Row>
      </Surface>

      <Surface sx={{ p: 2, mt: 2 }}>
        <Typography sx={{ fontWeight: 800 }}>Package source</Typography>
        <Typography
          sx={{ color: colors.text.secondary, fontSize: 12, mt: 0.75 }}
        >
          Current executable path: tuple-qualified managed repositories with
          direct network access. Local mirror, air-gap and proxy modes remain
          fail-closed until their repository transports are fully implemented
          and qualified.
        </Typography>
      </Surface>
      {attemptedStep === step && <ErrorList errors={currentErrors} />}
    </>
  )

  const runAuthoritativePreflight = async () => {
    if (allErrors.length > 0) {
      setValidated(false)
      setAttemptedStep(step)
      setPreflightState({ status: 'local-error', result: null })

      return
    }

    setValidated(false)
    setPreflightState({ status: 'loading', result: null })

    try {
      const response = await fetch(`${SERVICE_BLUEPRINT_API}/preflight`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueprintId: draft.blueprintId,
          version: draft.version,
          edition: draft.edition || undefined,
          topology: draft.topology,
          desiredState: sanitizeDesign(draft, blueprint),
          platformDesiredState: compilePlatformDesiredState(draft, blueprint),
        }),
      })
      const payload = await response.json()
      const result = payload?.data ?? payload
      const deployable = response.ok && result?.deployable === true

      setValidated(deployable)
      setPreflightState({
        status: deployable ? 'passed' : 'blocked',
        result,
      })
      setDeploymentState({ status: 'idle', result: null })
      setDeploymentKey(
        deployable
          ? 'vm-' + Date.now() + '-' + Math.random().toString(36).slice(2)
          : ''
      )
    } catch (error) {
      setValidated(false)
      setDeploymentKey('')
      setDeploymentState({ status: 'idle', result: null })
      setPreflightState({
        status: 'error',
        result: {
          blockers: [
            {
              code: 'SERVICE_BLUEPRINT_PREFLIGHT_UNAVAILABLE',
              message:
                error?.message ||
                'Authoritative production-service preflight is unavailable.',
            },
          ],
        },
      })
    }
  }

  const runAuthoritativeDeploy = async () => {
    if (
      !validated ||
      preflightState.status !== 'passed' ||
      allErrors.length > 0 ||
      !deploymentKey
    ) {
      return
    }

    setDeploymentState({ status: 'loading', result: null })

    try {
      const response = await fetch(`${SERVICE_BLUEPRINT_API}/deploy`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blueprintId: draft.blueprintId,
          version: draft.version,
          edition: draft.edition || undefined,
          topology: draft.topology,
          serviceId: draft.serviceName,
          idempotencyKey: deploymentKey,
          desiredState: sanitizeDesign(draft, blueprint),
          platformDesiredState: compilePlatformDesiredState(draft, blueprint),
        }),
      })
      const payload = await response.json()
      const result = payload?.data ?? payload

      if (!response.ok || result?.accepted !== true) {
        throw new Error(
          result?.message || 'Authoritative deployment admission was rejected.'
        )
      }

      setDeploymentState({ status: 'accepted', result })
    } catch (error) {
      setDeploymentState({
        status: 'error',
        result: {
          message:
            error?.message || 'Authoritative deployment admission failed.',
        },
      })
    }
  }

  const renderReview = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Review
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Review the desired state. No deployment is allowed until the
        authoritative backend returns a promoted exact tuple and preflight
        passes.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
          gap: 1.5,
        }}
      >
        {[
          ['Service', blueprint?.name, draft.version + ' · ' + draft.topology],
          [
            'VM footprint',
            String(architecture.dedicated) +
              (architecture.minimum ? '+' : '') +
              ' new dedicated VMs',
            architecture.shared.length
              ? 'Shared/existing: ' + architecture.shared.join(' · ')
              : 'No uncounted service-owned VM dependency',
          ],
          [
            'Application configuration',
            getProductSummary(draft, blueprint),
            'Product-specific inputs were validated independently of VM settings.',
          ],
          [
            'Execution source',
            blueprint?.sourceRoleAvailable
              ? 'Application Ansible role available'
              : blueprint?.controlPlaneAvailable
              ? 'Application role unavailable'
              : 'Backend role status unavailable',
            blueprint?.productionSelectable
              ? 'The selected family reports a production-selectable runtime entry.'
              : 'Exact tuple promotion and capability evidence are still required before deployment.',
          ],
          [
            'Dependencies',
            getDependencySummary(draft, blueprint),
            'Linked dependencies are immutable references to separately managed qualified services/storage; they add no hidden VMs.',
          ],
          [
            'Credential ownership',
            credentialProfile.required
              ? 'Existing secret reference'
              : credentialProfile.label,
            credentialProfile.required
              ? 'Credential secret reference configured: ' +
                (draft.credentialRef ? 'yes' : 'no')
              : 'No application credential is owned by this blueprint.',
          ],
          [
            'Capacity',
            draft.vcpu +
              ' vCPU · ' +
              draft.memoryGiB +
              ' GiB RAM per primary service node',
            [
              capacityProfile.data
                ? draft.expectedDataGiB + ' GiB · ' + capacityProfile.dataLabel
                : null,
              capacityProfile.load
                ? draft.expectedConnections + ' · ' + capacityProfile.loadLabel
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No additional application load sizing input',
          ],
          [
            'Network',
            networkProfile.singleEndpoint
              ? draft.serviceFqdn || 'FQDN not configured'
              : networkProfile.nativeDiscovery
              ? 'Native discovery / node list'
              : 'No customer service endpoint',
            networkProfile.mode + ' · ' + draft.ipMode + ' node addressing',
          ],
          [
            'Backup / DR',
            backupProfile.mode === 'direct'
              ? draft.backupEnabled
                ? 'Backup enabled · ' +
                  draft.retentionDays +
                  ' day retention · ' +
                  backupProfile.engine
                : 'Direct backup disabled · ' + backupProfile.engine
              : backupProfile.mode === 'dependency'
              ? 'Dependency-owned recovery · ' + backupProfile.engine
              : 'No generic application backup · ' + backupProfile.engine,
            (draft.pitr && backupProfile.mode === 'direct'
              ? 'PITR enabled'
              : 'PITR not enabled here') +
              ' · ' +
              (drProfile.configuredByTopology
                ? 'Native DR topology configured'
                : 'DR not applicable to this topology'),
          ],
          [
            'Security / observability',
            networkProfile.customerTraffic
              ? 'TLS enforced'
              : 'No customer service TLS endpoint',
            'Managed SSH-key bootstrap · standard production hardening · tuple-qualified monitoring/logging',
          ],
          [
            'Package / Internet path',
            'Tuple-qualified managed repositories',
            'Direct network access only in the current executable contract; mirror/air-gap/proxy stay fail-closed.',
          ],
        ].map(([label, title, detail]) => (
          <Surface key={label} sx={{ p: 2 }}>
            <Typography
              sx={{
                color: colors.text.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 9,
                fontWeight: 800,
              }}
            >
              {label}
            </Typography>
            <Typography sx={{ fontWeight: 800, mt: 0.75 }}>{title}</Typography>
            <Typography
              sx={{ color: colors.text.secondary, fontSize: 11, mt: 0.5 }}
            >
              {detail}
            </Typography>
          </Surface>
        ))}
      </Box>

      {allErrors.length === 0 ? (
        <Alert severity="success" icon={<CheckCircle />} sx={{ mt: 2 }}>
          Frontend desired-state validation passed. Run authoritative preflight
          to verify that the exact tuple is promoted before deployment.
        </Alert>
      ) : (
        <ErrorList errors={allErrors} />
      )}

      {preflightState.status === 'loading' && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Running authoritative production-service preflight…
        </Alert>
      )}
      {preflightState.status === 'passed' && (
        <Alert severity="success" icon={<CheckCircle />} sx={{ mt: 2 }}>
          Authoritative preflight passed for this exact tuple.
        </Alert>
      )}
      {(preflightState.status === 'blocked' ||
        preflightState.status === 'error') && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
            Authoritative preflight blocked
          </Typography>
          {(preflightState.result?.blockers || []).map((blocker) => (
            <Typography key={blocker.code} sx={{ fontSize: 12 }}>
              {blocker.code} — {blocker.message}
            </Typography>
          ))}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          disabled={preflightState.status === 'loading'}
          onClick={runAuthoritativePreflight}
          sx={{ textTransform: 'none' }}
        >
          {preflightState.status === 'loading'
            ? 'Validating…'
            : 'Validate configuration'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setReviewOpen(true)}
          sx={{ textTransform: 'none' }}
        >
          Review Configuration
        </Button>
        <Button
          variant="contained"
          disabled={
            !validated ||
            preflightState.status !== 'passed' ||
            allErrors.length > 0 ||
            deploymentState.status === 'loading' ||
            deploymentState.status === 'accepted'
          }
          title={
            preflightState.status !== 'passed'
              ? 'The exact tuple must pass authoritative preflight before deployment.'
              : ''
          }
          onClick={runAuthoritativeDeploy}
          sx={{ textTransform: 'none' }}
        >
          {deploymentState.status === 'loading' ? 'Deploying…' : 'Deploy'}
        </Button>
      </Box>

      {deploymentState.status === 'accepted' && (
        <Alert severity="success" icon={<CheckCircle />} sx={{ mt: 2 }}>
          Deployment accepted. Operation {deploymentState.result?.operation_id}
          {' · '}stage {deploymentState.result?.stage}.
        </Alert>
      )}
      {deploymentState.status === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {deploymentState.result?.message || 'Deployment admission failed.'}
        </Alert>
      )}
      {preflightState.status !== 'passed' && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          This exact tuple is not production-selectable until authoritative
          preflight confirms an immutable promoted tuple. Browser validation and
          family-level catalog visibility cannot promote a service.
        </Alert>
      )}
    </>
  )

  const panels = [
    renderService,
    renderDeployment,
    renderCapacity,
    renderStorage,
    renderNetwork,
    renderBackup,
    renderSecurity,
    renderReview,
  ]

  return (
    <PageFrame
      title="Create Production Service"
      description="Application-aware production service design with explicit VM footprint, dependencies, recovery, DNS and secure package access."
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
      <Alert
        severity={catalogState === 'runtime' ? 'success' : 'info'}
        sx={{ mt: 2 }}
      >
        {catalogState === 'runtime'
          ? 'Authoritative service catalog connected. Only backend-promoted tuples can enable deployment.'
          : 'Design catalog fallback is active. Deployment remains disabled until the authoritative service catalog is available and promotes an exact tuple.'}
      </Alert>

      <Surface sx={{ mt: 2, p: 1.5, overflowX: 'auto' }}>
        <Stepper
          activeStep={step}
          alternativeLabel
          sx={{ minWidth: 900 }}
          data-testid="production-service-stepper"
        >
          {WIZARD_STEPS.map((label, index) => (
            <Step
              key={label}
              completed={
                index < step &&
                validateStep(index, draft, blueprint).length === 0
              }
            >
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Surface>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            xl: 'minmax(0, 1fr) 300px',
          },
          gap: 2,
          mt: 2,
          alignItems: 'start',
        }}
      >
        <Surface sx={{ overflow: 'hidden' }}>
          <Box
            data-testid={'wizard-step-' + String(step + 1)}
            sx={{ p: { xs: 2, md: 3 }, minHeight: 560 }}
          >
            {panels[step]()}
          </Box>
          <Divider />
          <Box
            sx={{
              px: { xs: 2, md: 3 },
              py: 1.5,
              backgroundColor: colors.surfaceMuted,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Button
              disabled={step === 0}
              onClick={() => validateAndMove(step - 1)}
              sx={{ textTransform: 'none' }}
            >
              ← Previous
            </Button>
            {step < WIZARD_STEPS.length - 1 && (
              <Button
                variant="contained"
                onClick={() => validateAndMove(step + 1)}
                sx={{ textTransform: 'none' }}
              >
                Next →
              </Button>
            )}
          </Box>
        </Surface>

        <Surface
          sx={{
            p: 2,
            position: { xl: 'sticky' },
            top: { xl: 88 },
            display: { xs: 'none', xl: 'block' },
          }}
        >
          <Typography sx={{ fontWeight: 800 }}>Current design</Typography>
          <Typography sx={{ color: colors.text.muted, fontSize: 11, mt: 0.25 }}>
            Live desired-state summary
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          {[
            ['Service', blueprint?.name || '—'],
            ['Version', draft.version || '—'],
            ['Topology', draft.topology || '—'],
            [
              'VMs',
              String(architecture.dedicated) +
                (architecture.minimum ? '+' : '') +
                ' (' +
                String(
                  architecture.primaryDedicated ?? architecture.dedicated
                ) +
                ' service + ' +
                String(architecture.linkedDedicated || 0) +
                ' linked)',
            ],
            [
              'Endpoint',
              networkProfile.singleEndpoint
                ? draft.serviceFqdn || 'Not configured'
                : networkProfile.nativeDiscovery
                ? 'Native discovery'
                : 'No customer endpoint',
            ],
            ['Node domain', draft.domain || 'Not configured'],
            ['Backup', draft.backupEnabled ? 'Enabled' : 'Disabled'],
            [
              'DR',
              drProfile.configuredByTopology
                ? 'Native topology'
                : 'Not applicable',
            ],
          ].map(([label, value]) => (
            <Box
              key={label}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
                py: 0.85,
                borderBottom: '1px solid ' + colors.surfaceAlt,
              }}
            >
              <Typography sx={{ color: colors.text.muted, fontSize: 11 }}>
                {label}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 750,
                  fontSize: 11,
                  textAlign: 'right',
                  maxWidth: 170,
                }}
              >
                {value}
              </Typography>
            </Box>
          ))}
          <Box sx={{ mt: 1.5 }}>
            <StatusPill
              label={
                blueprint?.productionSelectable
                  ? 'Production selectable'
                  : 'Qualification gated'
              }
              tone={blueprint?.productionSelectable ? 'success' : 'warning'}
            />
          </Box>
        </Surface>
      </Box>

      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Configuration Review</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Secret values are never rendered. This review contains only secret
            references and non-secret desired-state metadata.
          </Alert>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: radius.md + 'px',
              backgroundColor: colors.surfaceAlt,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(sanitizeDesign(draft, blueprint), null, 2)}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </PageFrame>
  )
}

export default ProductionServiceWizard
