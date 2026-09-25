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
import { BackupJobAPI, DatastoreAPI, VmAPI } from '@FeaturesModule'
import { jsonToXml } from '@UtilsModule'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import {
  BACKUP_PLAN_PROFILES,
  backupPlanReadbackMatches,
  compileBackupPlanTemplate,
  defaultBackupPlanDraft,
  effectiveBackupProfile,
  validateBackupPlanDraft,
} from 'client/apps/layersentry/backupPlan'

const steps = ['Plan', 'Virtual machines', 'Schedule & storage', 'Review']
const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
const isBackupStorage = (store) =>
  String(store?.TYPE) === '3' ||
  String(store?.TYPE_STRING ?? store?.TEMPLATE?.TYPE ?? '')
    .toLowerCase()
    .includes('backup')

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

const BackupPlanCreateWizard = () => {
  const history = useHistory()
  const [draft, setDraft] = useState(defaultBackupPlanDraft)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const vmsQuery = VmAPI.useGetVmsQuery({ extended: true })
  const storesQuery = DatastoreAPI.useGetDatastoresQuery()
  const [createPlan] = BackupJobAPI.useCreateBackupJobMutation()
  const [readPlan] = BackupJobAPI.useLazyGetBackupJobQuery()
  const vms = toArray(vmsQuery.data)
  const stores = toArray(storesQuery.data).filter(isBackupStorage)
  const errors = useMemo(() => validateBackupPlanDraft(draft), [draft])
  const profile = effectiveBackupProfile(draft)

  const update = (name) => (event) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setDraft((current) => {
      const next = { ...current, [name]: value }
      const preset = BACKUP_PLAN_PROFILES[value]
      if (name === 'profile' && preset?.keepLast) {
        next.keepLast = String(preset.keepLast)
        next.intervalHours = String(preset.intervalHours)
        next.fsFreeze = preset.fsFreeze
      }

      return next
    })
  }

  const toggleVm = (id) => () =>
    setDraft((current) => ({
      ...current,
      vmIds: current.vmIds.includes(String(id))
        ? current.vmIds.filter((value) => value !== String(id))
        : [...current.vmIds, String(id)],
    }))

  const submit = async () => {
    if (Object.keys(errors).length) {
      setError(
        'Review the highlighted settings before creating this Backup Plan.'
      )

      return
    }
    setSubmitting(true)
    setError('')
    try {
      const expected = compileBackupPlanTemplate(draft)
      const id = await createPlan({ template: jsonToXml(expected) }).unwrap()
      let reconciled = false
      let lastReadError
      for (let attempt = 0; attempt < 5 && !reconciled; attempt += 1) {
        try {
          const observed = await readPlan({ id }, false).unwrap()
          reconciled = backupPlanReadbackMatches(observed, expected)
        } catch (reason) {
          lastReadError = reason
        }
        if (!reconciled && attempt < 4) await wait(350 * (attempt + 1))
      }
      if (!reconciled) {
        throw new Error(
          lastReadError?.data?.message ??
            `Backup Plan #${id} was accepted, but native readback did not match its VM, destination, schedule or retention assignment.`
        )
      }
      history.push(PRODUCT_PATHS.PROTECTION_BACKUP_PLANS)
    } catch (reason) {
      setError(
        reason?.data?.message ??
          reason?.message ??
          'LayerSentry could not create and reconcile this Backup Plan.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageFrame
      title="Create Backup Plan"
      description="Assign a native VM backup schedule, retention policy and qualified destination."
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
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Field
              label="Plan name"
              value={draft.name}
              onChange={update('name')}
              error={errors.name}
            />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                gap: 1.5,
              }}
            >
              {Object.entries(BACKUP_PLAN_PROFILES).map(([id, item]) => (
                <Button
                  key={id}
                  variant={draft.profile === id ? 'contained' : 'outlined'}
                  onClick={() => update('profile')({ target: { value: id } })}
                  sx={{
                    p: 2,
                    textTransform: 'none',
                    display: 'block',
                    textAlign: 'left',
                  }}
                >
                  <Typography sx={{ fontWeight: 750 }}>{item.label}</Typography>
                  <Typography sx={{ fontSize: 12 }}>{item.summary}</Typography>
                </Button>
              ))}
            </Box>
          </Box>
        )}
        {step === 1 && (
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="h6">Assign virtual machines</Typography>
            {vmsQuery.isLoading && (
              <Typography>Loading virtual machines…</Typography>
            )}
            {vmsQuery.isError && (
              <Alert severity="error">
                Virtual machines could not be loaded for this account.
              </Alert>
            )}
            {!vmsQuery.isLoading && !vmsQuery.isError && vms.length === 0 && (
              <Alert severity="warning">
                No virtual machines are available to this account.
              </Alert>
            )}
            {vms.map((vm) => (
              <FormControlLabel
                key={vm.ID}
                control={
                  <Checkbox
                    checked={draft.vmIds.includes(String(vm.ID))}
                    onChange={toggleVm(vm.ID)}
                  />
                }
                label={`${vm.NAME ?? 'Virtual machine'} (#${vm.ID})`}
              />
            ))}
            {errors.vmIds && <Alert severity="warning">{errors.vmIds}</Alert>}
          </Box>
        )}
        {step === 2 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Alert severity="info">
              Effective schedule: every {profile.intervalHours} hours · keep{' '}
              {profile.keepLast} usable restore points.
            </Alert>
            <SelectField
              label="Backup Storage"
              value={draft.datastoreId}
              onChange={update('datastoreId')}
              options={stores.map((store) => [
                String(store.ID),
                `${store.NAME ?? 'Backup Storage'} (#${store.ID})`,
              ])}
            />
            {storesQuery.isError && (
              <Alert severity="error">
                Qualified Backup Storage could not be loaded.
              </Alert>
            )}
            {!storesQuery.isLoading && stores.length === 0 && (
              <Alert severity="warning">
                No qualified native Backup Storage is available to this account.
              </Alert>
            )}
            {errors.datastoreId && (
              <Alert severity="warning">{errors.datastoreId}</Alert>
            )}
            <Field
              label="First run (optional)"
              type="datetime-local"
              value={draft.startTime}
              onChange={update('startTime')}
              InputLabelProps={{ shrink: true }}
              error={errors.startTime}
            />
            {draft.profile === 'CUSTOM' && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 2,
                }}
              >
                <Field
                  label="Keep restore points"
                  type="number"
                  value={draft.keepLast}
                  onChange={update('keepLast')}
                  error={errors.keepLast}
                />
                <Field
                  label="Run every (hours)"
                  type="number"
                  value={draft.intervalHours}
                  onChange={update('intervalHours')}
                  error={errors.intervalHours}
                />
              </Box>
            )}
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
                data-layersentry-backup-advanced
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 2,
                }}
              >
                <SelectField
                  label="Guest consistency"
                  value={draft.fsFreeze}
                  onChange={update('fsFreeze')}
                  options={[
                    ['AGENT', 'QEMU guest agent freeze'],
                    ['SUSPEND', 'Suspend VM'],
                    ['NONE', 'Crash consistent'],
                  ]}
                />
                <SelectField
                  label="VM execution"
                  value={draft.execution}
                  onChange={update('execution')}
                  options={[
                    ['SEQUENTIAL', 'Sequential'],
                    ['PARALLEL', 'Parallel'],
                  ]}
                />
                <SelectField
                  label="Increment mode"
                  value={draft.incrementMode}
                  onChange={update('incrementMode')}
                  options={[
                    ['CBT', 'Changed block tracking'],
                    ['SNAPSHOT', 'Snapshot'],
                  ]}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={draft.backupVolatile}
                      onChange={update('backupVolatile')}
                    />
                  }
                  label="Include volatile disks"
                />
              </Box>
            )}
          </Box>
        )}
        {step === 3 && (
          <Box
            data-layersentry-backup-plan-review
            sx={{ display: 'grid', gap: 1 }}
          >
            <Typography variant="h6">Review</Typography>
            <Typography>
              <strong>Plan:</strong> {BACKUP_PLAN_PROFILES[draft.profile].label}{' '}
              · {draft.name}
            </Typography>
            <Typography>
              <strong>Schedule:</strong> every {profile.intervalHours} hours
            </Typography>
            <Typography>
              <strong>Retention:</strong> keep {profile.keepLast} usable restore
              points
            </Typography>
            <Typography>
              <strong>Destination:</strong> Backup Storage #{draft.datastoreId}
            </Typography>
            <Typography>
              <strong>Virtual machines:</strong> {draft.vmIds.join(', ')}
            </Typography>
            {draft.advanced && (
              <Typography>
                <strong>Advanced:</strong> {draft.fsFreeze} · {draft.execution}{' '}
                · {draft.incrementMode}
                {draft.backupVolatile ? ' · volatile disks' : ''}
              </Typography>
            )}
            <Alert severity="info">
              The plan is reported as created only after native readback
              confirms its profile, VM assignment, destination and retention.
            </Alert>
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            onClick={() =>
              step === 0
                ? history.push(PRODUCT_PATHS.PROTECTION_BACKUP_PLANS)
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
                (step === 0 && Boolean(errors.name)) ||
                (step === 1 && Boolean(errors.vmIds)) ||
                (step === 2 &&
                  Boolean(
                    errors.datastoreId ||
                      errors.keepLast ||
                      errors.intervalHours ||
                      errors.startTime
                  ))
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
              {submitting ? 'Creating and reconciling…' : 'Create Backup Plan'}
            </Button>
          )}
        </Box>
      </Surface>
    </PageFrame>
  )
}

export default BackupPlanCreateWizard
