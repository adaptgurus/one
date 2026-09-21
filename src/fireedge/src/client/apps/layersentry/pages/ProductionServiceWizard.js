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
  getCredentialProfile,
  getDefaultDependencyState,
  getDependencyErrors,
  getDependencyOptions,
  getDependencySpecs,
  getDependencySummary,
  getEndpointOptions,
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

const mergeRuntimeCatalog = (payload) => {
  const responseData = payload?.data ?? payload
  const items = Array.isArray(responseData)
    ? responseData
    : Array.isArray(responseData?.items)
    ? responseData.items
    : Array.isArray(responseData?.blueprints)
    ? responseData.blueprints
    : []

  if (!items.length) return null

  const merged = FALLBACK_BLUEPRINTS.map((fallback) => {
    const runtime = items.find(
      (item) =>
        item.id === fallback.id ||
        item.blueprintId === fallback.id ||
        item.name === fallback.name
    )
    if (!runtime) return fallback

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
        if (active) setCatalogState('fallback')
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
      (draft.dcsPlacement !== 'Shared LayerSentry etcd DCS' ||
        draft.pgbouncerPlacement !== 'On PostgreSQL nodes' ||
        draft.barmanPlacement !== 'Shared Barman service'))

  const storageAdvancedActive =
    draft.placementPolicy === 'Use qualified dedicated pool' ||
    (draft.storage || []).some(
      (item) =>
        item.layout === 'Existing SAN / LUN' ||
        item.layout === 'Existing mount' ||
        item.dependency
    )

  const networkAdvancedActive =
    draft.ipMode === 'Static' ||
    draft.endpointMode === 'Existing load balancer' ||
    draft.dnsRegistration !== 'Automatic' ||
    draft.portPolicy !== 'Use product default'

  const backupAdvancedActive = draft.drEnabled

  const securityAdvancedActive =
    draft.packageSourceMode !== 'Managed repositories' ||
    draft.internetAccess === 'HTTP(S) Proxy'

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
                    <StatusPill
                      label={item.qualification}
                      tone={item.productionSelectable ? 'success' : 'warning'}
                    />
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
      <Row columns={blueprint?.editions ? 4 : 3}>
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
        <SelectField
          label="Environment"
          value={draft.environment}
          onChange={(value) => update('environment', value)}
        >
          {['Production', 'Staging', 'Development'].map((value) => (
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
          <NumberField
            label="Expected logical data (GiB)"
            value={draft.expectedDataGiB}
            onChange={(value) => update('expectedDataGiB', value)}
          />
          <NumberField
            label="Expected client connections"
            value={draft.expectedConnections}
            onChange={(value) => update('expectedConnections', value)}
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
          <NumberField
            label="Expected annual growth (%)"
            value={draft.expectedGrowthPercent}
            onChange={(value) => update('expectedGrowthPercent', value)}
          />
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
        Storage is application-aware. Per-node data volumes, shared recovery
        repositories and linked dependencies are shown separately.
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
                  {[
                    'Single disk',
                    'LVM',
                    'Striped managed disks',
                    'Existing SAN / LUN',
                    'Existing mount',
                    'Repository-managed',
                    'Shared filesystem/object storage',
                  ].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </SelectField>
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
      <AdvancedSection
        title="Advanced storage placement"
        description="Use only when placement must target a specifically qualified pool."
        expanded={isAdvancedOpen('storage', storageAdvancedActive)}
        onChange={(next) =>
          setAdvancedOpen('storage', storageAdvancedActive, next)
        }
      >
        <SelectField
          label="Placement policy"
          value={draft.placementPolicy}
          onChange={(value) => update('placementPolicy', value)}
        >
          <MenuItem value="Spread across qualified failure domains">
            Spread across qualified failure domains
          </MenuItem>
          <MenuItem value="Use qualified dedicated pool">
            Use qualified dedicated pool
          </MenuItem>
        </SelectField>
        {draft.placementPolicy === 'Use qualified dedicated pool' && (
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Qualified pool / placement-policy reference"
            value={draft.dedicatedPool}
            onChange={(event) => update('dedicatedPool', event.target.value)}
          />
        )}
      </AdvancedSection>
      {attemptedStep === step && <ErrorList errors={currentErrors} />}
    </>
  )

  const renderNetwork = () => (
    <>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Network & Availability
      </Typography>
      <Typography sx={{ color: colors.text.secondary, mb: 2 }}>
        Define the customer-facing name and availability intent. Raw OpenNebula
        network internals stay hidden from normal users.
      </Typography>
      <Row>
        <TextField
          label="Service name"
          value={draft.serviceName}
          onChange={(event) => update('serviceName', event.target.value)}
        />
        <TextField
          label="DNS domain"
          value={draft.domain}
          onChange={(event) => update('domain', event.target.value)}
          placeholder="prod.example.internal"
        />
        <TextField
          label="Service FQDN"
          value={draft.serviceFqdn}
          onChange={(event) => update('serviceFqdn', event.target.value)}
          placeholder="service.prod.example.internal"
        />
        <SelectField
          label="Availability"
          value={draft.availability}
          onChange={(value) => update('availability', value)}
        >
          <MenuItem value="Separate failure domains">
            Separate failure domains
          </MenuItem>
          <MenuItem value="Single failure domain">
            Single failure domain
          </MenuItem>
        </SelectField>
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
        <SelectField
          label="Node IP assignment"
          value={draft.ipMode}
          onChange={(value) => update('ipMode', value)}
        >
          <MenuItem value="Automatic">Automatic</MenuItem>
          <MenuItem value="Static">Static</MenuItem>
        </SelectField>
      </Row>

      <AdvancedSection
        title="Advanced network"
        description="Static addresses, manual DNS, external endpoints and non-default ports."
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
                'At least ' +
                String(
                  architecture.addressableNodes || architecture.dedicated
                ) +
                ' addresses are required for this footprint.'
              }
            />
          )}

          {draft.endpointMode === 'Existing load balancer' && (
            <TextField
              label="Existing VIP / endpoint reference"
              value={draft.externalEndpoint}
              onChange={(event) =>
                update('externalEndpoint', event.target.value)
              }
            />
          )}

          <SelectField
            label="DNS registration"
            value={draft.dnsRegistration}
            onChange={(value) => update('dnsRegistration', value)}
          >
            <MenuItem value="Automatic">Automatic</MenuItem>
            <MenuItem value="Existing DNS workflow">
              Existing DNS workflow
            </MenuItem>
            <MenuItem value="Manual DNS records">Manual DNS records</MenuItem>
          </SelectField>

          {draft.dnsRegistration === 'Existing DNS workflow' && (
            <TextField
              label="DNS workflow / integration reference"
              value={draft.dnsWorkflowRef}
              onChange={(event) => update('dnsWorkflowRef', event.target.value)}
            />
          )}

          {draft.dnsRegistration === 'Manual DNS records' && (
            <>
              <TextField
                label="DNS zone"
                value={draft.dnsZone}
                onChange={(event) => update('dnsZone', event.target.value)}
                placeholder="prod.example.internal"
              />
              <SelectField
                label="DNS record type"
                value={draft.dnsRecordType}
                onChange={(value) => update('dnsRecordType', value)}
              >
                <MenuItem value="A/AAAA">A / AAAA</MenuItem>
                <MenuItem value="CNAME">CNAME</MenuItem>
              </SelectField>
              <NumberField
                label="DNS TTL (seconds)"
                value={draft.dnsTtl}
                onChange={(value) => update('dnsTtl', value)}
                min={30}
              />
              <SelectField
                label="DNS target"
                value={draft.dnsTargetMode}
                onChange={(value) => update('dnsTargetMode', value)}
              >
                <MenuItem value="Use generated service endpoint">
                  Use generated service endpoint
                </MenuItem>
                <MenuItem value="Specify DNS target now">
                  Specify DNS target now
                </MenuItem>
              </SelectField>
              {draft.dnsTargetMode === 'Specify DNS target now' && (
                <TextField
                  label="DNS target IP / FQDN"
                  value={draft.dnsTarget}
                  onChange={(event) => update('dnsTarget', event.target.value)}
                />
              )}
            </>
          )}

          <SelectField
            label="Service port policy"
            value={draft.portPolicy}
            onChange={(value) => update('portPolicy', value)}
          >
            <MenuItem value="Use product default">Use product default</MenuItem>
            <MenuItem value="Custom qualified port">
              Custom qualified port
            </MenuItem>
          </SelectField>
          {draft.portPolicy === 'Custom qualified port' && (
            <NumberField
              label="Custom service port"
              value={draft.customPort}
              onChange={(value) => update('customPort', value)}
              min={1}
            />
          )}
        </Row>
        <Alert severity="info" sx={{ mt: 2 }}>
          Backend preflight must still validate subnet membership, duplicate IP,
          DNS conflicts, gateway reachability, address capacity, failure-domain
          placement and endpoint ownership before VM creation.
        </Alert>
      </AdvancedSection>
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

        <AdvancedSection
          title="Disaster Recovery"
          description="Enable only when a qualified DR target and explicit RPO/RTO are available."
          expanded={isAdvancedOpen('backup', backupAdvancedActive)}
          onChange={(next) =>
            setAdvancedOpen('backup', backupAdvancedActive, next)
          }
        >
          <FormControlLabel
            control={
              <Switch
                checked={draft.drEnabled}
                onChange={(event) => update('drEnabled', event.target.checked)}
              />
            }
            label="Configure a qualified DR topology"
          />
          {draft.drEnabled && (
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
          )}
        </AdvancedSection>
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
        Secure defaults are automatic. Low-level SELinux/AppArmor, firewall,
        kernel, sysctl and ulimit settings remain internal qualified policy.
      </Typography>
      <Row>
        <FormControlLabel
          control={
            <Switch
              checked={draft.tls}
              onChange={(event) => update('tls', event.target.checked)}
            />
          }
          label="TLS enabled"
        />
        <FormControlLabel
          control={
            <Switch
              checked={draft.monitoring}
              onChange={(event) => update('monitoring', event.target.checked)}
            />
          }
          label="Monitoring enabled"
        />
        <FormControlLabel
          control={
            <Switch
              checked={draft.logging}
              onChange={(event) => update('logging', event.target.checked)}
            />
          }
          label="Central logging enabled"
        />
        <SelectField
          label="OS access"
          value={draft.accessMode}
          onChange={(value) => update('accessMode', value)}
        >
          <MenuItem value="SSH key / managed access">
            SSH key / managed access
          </MenuItem>
          <MenuItem value="Managed access only">Managed access only</MenuItem>
        </SelectField>
        <SelectField
          label="Hardening profile"
          value={draft.hardeningProfile}
          onChange={(value) => update('hardeningProfile', value)}
        >
          <MenuItem value="Standard production hardening">
            Standard production hardening
          </MenuItem>
          <MenuItem value="CIS-aligned qualified profile">
            CIS-aligned qualified profile
          </MenuItem>
        </SelectField>
      </Row>

      <Surface sx={{ p: 2, mt: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>
          TLS certificate and application credential ownership
        </Typography>
        <Row>
          {draft.tls && (
            <SelectField
              label="TLS certificate source"
              value={draft.tlsCertificateMode}
              onChange={(value) => update('tlsCertificateMode', value)}
            >
              <MenuItem value="LayerSentry managed certificate / internal PKI">
                LayerSentry managed certificate / internal PKI
              </MenuItem>
              <MenuItem value="Existing certificate / secret reference">
                Existing certificate / secret reference
              </MenuItem>
            </SelectField>
          )}
          {draft.tls &&
            draft.tlsCertificateMode ===
              'Existing certificate / secret reference' && (
              <TextField
                label="Certificate / secret reference"
                value={draft.tlsCertificateRef}
                onChange={(event) =>
                  update('tlsCertificateRef', event.target.value)
                }
                helperText="Reference only; never paste private-key material."
                fullWidth
              />
            )}
          {credentialProfile.required && (
            <SelectField
              label={credentialProfile.label}
              value={draft.credentialMode}
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  credentialMode: value,
                  credentialRef: '',
                }))
                setValidated(false)
              }}
            >
              <MenuItem value={credentialProfile.generated}>
                {credentialProfile.generated}
              </MenuItem>
              <MenuItem value={credentialProfile.existing}>
                {credentialProfile.existing}
              </MenuItem>
            </SelectField>
          )}
          {credentialProfile.required &&
            draft.credentialMode === credentialProfile.existing && (
              <TextField
                label={credentialProfile.refLabel}
                value={draft.credentialRef}
                onChange={(event) =>
                  update('credentialRef', event.target.value)
                }
                helperText="Secret reference only; raw passwords/tokens are not persisted in the design."
                fullWidth
              />
            )}
        </Row>
      </Surface>

      <AdvancedSection
        title="Package Source / Internet Access"
        description="Configure local/offline repositories or an HTTP(S) proxy without exposing credentials in the saved design."
        expanded={isAdvancedOpen('security', securityAdvancedActive)}
        onChange={(next) =>
          setAdvancedOpen('security', securityAdvancedActive, next)
        }
      >
        <Row>
          <SelectField
            label="Installation source"
            value={draft.packageSourceMode}
            onChange={(value) => update('packageSourceMode', value)}
          >
            <MenuItem value="Managed repositories">
              Managed repositories
            </MenuItem>
            <MenuItem value="Local repository / mirror">
              Local repository / mirror
            </MenuItem>
            <MenuItem value="Air-gapped bundle">Air-gapped bundle</MenuItem>
          </SelectField>

          {draft.packageSourceMode === 'Local repository / mirror' && (
            <TextField
              label="Internal repository URL / FQDN"
              value={draft.repoUrl}
              onChange={(event) => update('repoUrl', event.target.value)}
            />
          )}

          {draft.packageSourceMode === 'Air-gapped bundle' && (
            <TextField
              label="Qualified bundle ID"
              value={draft.bundleId}
              onChange={(event) => update('bundleId', event.target.value)}
            />
          )}

          {draft.packageSourceMode === 'Managed repositories' && (
            <SelectField
              label="Internet access"
              value={draft.internetAccess}
              onChange={(value) => update('internetAccess', value)}
            >
              <MenuItem value="Direct Internet">Direct Internet</MenuItem>
              <MenuItem value="HTTP(S) Proxy">HTTP(S) Proxy</MenuItem>
            </SelectField>
          )}

          {draft.packageSourceMode === 'Managed repositories' &&
            draft.internetAccess === 'HTTP(S) Proxy' && (
              <>
                <TextField
                  label="Proxy URL"
                  value={draft.proxyUrl}
                  onChange={(event) => update('proxyUrl', event.target.value)}
                  placeholder="http://proxy.example.internal:3128"
                />
                <TextField
                  label="Proxy username (optional)"
                  value={draft.proxyUsername}
                  onChange={(event) =>
                    update('proxyUsername', event.target.value)
                  }
                />
                <TextField
                  type="password"
                  label="Proxy password (optional)"
                  value={draft.proxyPassword}
                  onChange={(event) =>
                    update('proxyPassword', event.target.value)
                  }
                  autoComplete="new-password"
                  helperText="Never rendered in Review or persisted in the design. Production backend must store a secret reference instead."
                />
                <TextField
                  label="no_proxy"
                  value={draft.proxyNoProxy}
                  onChange={(event) =>
                    update('proxyNoProxy', event.target.value)
                  }
                />
                <TextField
                  label="Proxy CA / trust reference (optional)"
                  value={draft.proxyCaRef}
                  onChange={(event) => update('proxyCaRef', event.target.value)}
                />
              </>
            )}
        </Row>
        {draft.packageSourceMode !== 'Managed repositories' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Public repository fallback must be disabled. Backend preflight must
            verify signatures/checksums and all exact dependencies before VM
            creation.
          </Alert>
        )}
      </AdvancedSection>
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
          desiredState: sanitizeDesign(draft),
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
          desiredState: sanitizeDesign(draft),
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

  const renderReview = () => {
    const safeDesign = sanitizeDesign(draft)

    return (
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
            [
              'Service',
              blueprint?.name,
              draft.version + ' · ' + draft.topology,
            ],
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
              'Dependencies',
              getDependencySummary(draft, blueprint),
              'Provisioned linked VMs are included in the VM footprint; existing dependencies use references only.',
            ],
            [
              'Credential ownership',
              credentialProfile.required
                ? draft.credentialMode
                : credentialProfile.label,
              credentialProfile.required &&
              draft.credentialMode === credentialProfile.existing
                ? 'Existing secret reference configured: ' +
                  (draft.credentialRef ? 'yes' : 'no')
                : 'Raw credential values are not persisted in the design.',
            ],
            [
              'Capacity',
              draft.vcpu +
                ' vCPU · ' +
                draft.memoryGiB +
                ' GiB RAM per primary service node',
              draft.expectedDataGiB +
                ' GiB expected logical data · ' +
                draft.expectedConnections +
                ' client connections',
            ],
            [
              'Network',
              draft.serviceFqdn || 'FQDN not configured',
              draft.endpointMode +
                ' · ' +
                draft.ipMode +
                ' addressing · DNS ' +
                draft.dnsRegistration,
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
                (draft.drEnabled ? 'DR configured' : 'DR disabled'),
            ],
            [
              'Security / observability',
              (draft.tls ? 'TLS' : 'TLS disabled') +
                ' · ' +
                (draft.monitoring ? 'Monitoring' : 'Monitoring disabled') +
                ' · ' +
                (draft.logging
                  ? 'Central logging'
                  : 'Central logging disabled'),
              draft.hardeningProfile,
            ],
            [
              'Package / Internet path',
              draft.packageSourceMode,
              draft.packageSourceMode === 'Managed repositories'
                ? draft.internetAccess === 'HTTP(S) Proxy'
                  ? draft.proxyUrl +
                    ' · ' +
                    (safeDesign.proxyPasswordPresent
                      ? 'optional proxy credential supplied'
                      : 'no proxy password supplied')
                  : 'Direct Internet'
                : 'Public fallback disabled',
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
              <Typography sx={{ fontWeight: 800, mt: 0.75 }}>
                {title}
              </Typography>
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
            Frontend desired-state validation passed. Run authoritative
            preflight to verify that the exact tuple is promoted before
            deployment.
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
            Deployment accepted. Operation{' '}
            {deploymentState.result?.operation_id}
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
            preflight confirms an immutable promoted tuple. Browser validation
            and family-level catalog visibility cannot promote a service.
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
            ['FQDN', draft.serviceFqdn || 'Not configured'],
            ['DNS', draft.dnsRegistration],
            ['Backup', draft.backupEnabled ? 'Enabled' : 'Disabled'],
            ['DR', draft.drEnabled ? 'Enabled' : 'Disabled'],
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
            Secret values are excluded. In particular, proxy passwords are never
            rendered in this review payload.
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
            {JSON.stringify(sanitizeDesign(draft), null, 2)}
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
