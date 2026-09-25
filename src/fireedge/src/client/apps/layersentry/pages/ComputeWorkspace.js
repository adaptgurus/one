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
  Checkbox,
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material'
import {
  Db,
  HardDrive,
  NetworkAlt,
  Packages,
  Plus,
  Server,
} from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import {
  DatastoreAPI,
  HostAPI,
  VmAPI,
  useGeneralApi,
  useViews,
} from '@FeaturesModule'
import { jsonToXml } from '@UtilsModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
import {
  MetricCard,
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const getLastVmHistory = (vm) => {
  const history = toArray(vm?.HISTORY_RECORDS?.HISTORY)

  return history[history.length - 1] ?? {}
}

const COMPUTE_QUICK_ACTIONS = [
  {
    label: 'Create VM',
    path: PRODUCT_PATHS.COMPUTE_CREATE,
    icon: Plus,
    primary: true,
    capability: CAPABILITY_IDS.VM_CREATE,
    mutation: true,
  },
  {
    label: 'DBaaS',
    path: PRODUCT_PATHS.DBAAS,
    icon: Db,
    always: true,
  },
  {
    label: 'APaaS',
    path: PRODUCT_PATHS.APAAS,
    icon: Packages,
    always: true,
  },
  {
    label: 'Affinity Groups',
    path: PRODUCT_PATHS.COMPUTE_AFFINITY,
    icon: Server,
    capability: CAPABILITY_IDS.AFFINITY,
  },
  {
    label: 'Disk Images',
    path: PRODUCT_PATHS.STORAGE_IMAGES,
    icon: HardDrive,
    capability: CAPABILITY_IDS.STORAGE_IMAGES,
  },
  {
    label: 'Networks',
    path: PRODUCT_PATHS.NETWORK,
    icon: NetworkAlt,
    capability: CAPABILITY_IDS.NETWORK,
  },
]

const ComputeWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const query = VmAPI.useGetVmsQuery({ extended: true })
  const vms = toArray(query.data)
  const running = vms.filter(({ STATE }) => String(STATE) === '3').length
  const totalCpu = vms.reduce(
    (sum, vm) => sum + Number(vm?.TEMPLATE?.VCPU ?? vm?.TEMPLATE?.CPU ?? 0),
    0
  )
  const totalMemoryMb = vms.reduce(
    (sum, vm) => sum + Number(vm?.TEMPLATE?.MEMORY ?? 0),
    0
  )
  const capabilityModel = getCapabilityModel(endpoints)
  const canCreateVm = isCapabilityEnabled(
    CAPABILITY_IDS.VM_CREATE,
    capabilityModel
  )
  const quickActions = COMPUTE_QUICK_ACTIONS.filter(
    ({ always, capability, mutation }) =>
      always === true ||
      (mutation
        ? isCapabilityEnabled(capability, capabilityModel)
        : isCapabilityVisible(capability, capabilityModel))
  )

  const { view } = useViews()
  const isAdmin = view === 'admin'
  const { enqueueSuccess, enqueueError } = useGeneralApi()
  const canResizeVm =
    isAdmin && isCapabilityEnabled(CAPABILITY_IDS.VM_RESIZE, capabilityModel)
  const canUpdateVm =
    isAdmin &&
    isCapabilityEnabled(CAPABILITY_IDS.VM_UPDATE_CONFIG, capabilityModel)
  const canMigrateVm =
    isAdmin && isCapabilityEnabled(CAPABILITY_IDS.VM_MIGRATE, capabilityModel)
  const hostQuery = HostAPI.useGetHostsQuery(undefined, { skip: !canMigrateVm })
  const datastoreQuery = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: !canMigrateVm,
  })
  const [resizeVm, resizeState] = VmAPI.useResizeMutation()
  const [migrateVm, migrateState] = VmAPI.useMigrateMutation()
  const [renameVm, renameState] = VmAPI.useRenameVmMutation()
  const [updateUserTemplate, updateState] =
    VmAPI.useUpdateUserTemplateMutation()
  const [selectedVmId, setSelectedVmId] = useState('')
  const [editName, setEditName] = useState('')
  const [editVcpu, setEditVcpu] = useState('')
  const [editMemoryGb, setEditMemoryGb] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [targetHostId, setTargetHostId] = useState('')
  const [targetDatastoreId, setTargetDatastoreId] = useState('')
  const [liveStorageMove, setLiveStorageMove] = useState(true)
  const [migrationStatus, setMigrationStatus] = useState('')
  const selectedVm = useMemo(
    () => vms.find(({ ID }) => String(ID) === String(selectedVmId)),
    [selectedVmId, vms]
  )
  const selectedStorageGb = useMemo(
    () =>
      toArray(selectedVm?.TEMPLATE?.DISK).reduce(
        (sum, disk) => sum + (Number(disk?.SIZE) || 0),
        0
      ) / 1024,
    [selectedVm]
  )
  const editorBusy =
    resizeState.isLoading ||
    renameState.isLoading ||
    updateState.isLoading ||
    migrateState.isLoading
  const currentLocation = selectedVm ? getLastVmHistory(selectedVm) : {}
  const allSystemDatastores = toArray(datastoreQuery.data).filter(
    ({ TYPE }) => String(TYPE) === '1' || String(TYPE).toUpperCase() === 'SYSTEM_DS'
  )
  const currentDatastore = allSystemDatastores.find(
    ({ ID }) => String(ID) === String(currentLocation?.DS_ID)
  )
  const currentTransferDriver =
    currentDatastore?.TM_MAD ?? currentDatastore?.TEMPLATE?.TM_MAD
  const systemDatastores = allSystemDatastores.filter((datastore) => {
    const transferDriver = datastore?.TM_MAD ?? datastore?.TEMPLATE?.TM_MAD

    return !currentTransferDriver || transferDriver === currentTransferDriver
  })
  const availableHosts = toArray(hostQuery.data).filter(
    ({ STATE }) => String(STATE) === '2' || String(STATE).toUpperCase() === 'MONITORED'
  )

  const selectVmForEdit = (id) => {
    const vm = vms.find(({ ID }) => String(ID) === String(id))
    setSelectedVmId(String(id))
    setEditName(vm?.NAME ?? '')
    setEditVcpu(String(vm?.TEMPLATE?.VCPU ?? vm?.TEMPLATE?.CPU ?? ''))
    setEditMemoryGb(
      vm?.TEMPLATE?.MEMORY
        ? String(Math.max(1, Math.round(Number(vm.TEMPLATE.MEMORY) / 1024)))
        : ''
    )
    setEditDescription(vm?.USER_TEMPLATE?.DESCRIPTION ?? '')
    const location = getLastVmHistory(vm)
    setTargetHostId(String(location?.HID ?? ''))
    setTargetDatastoreId('')
    setMigrationStatus('')
  }

  const moveVmStorage = async () => {
    if (!selectedVm?.ID || !targetHostId || !targetDatastoreId) return
    if (String(currentLocation?.DS_ID) === String(targetDatastoreId)) {
      setMigrationStatus('Choose a destination storage pool different from the current pool.')
      return
    }
    if (liveStorageMove && String(selectedVm.STATE) !== '3') {
      setMigrationStatus('Live storage migration requires a running virtual machine.')
      return
    }

    try {
      await migrateVm({
        id: selectedVm.ID,
        host: Number(targetHostId),
        datastore: Number(targetDatastoreId),
        live: liveStorageMove,
        enforce: true,
        type: liveStorageMove ? 0 : 1,
      }).unwrap()
      setMigrationStatus(
        'OpenNebula accepted the storage move. Completion is shown only after the refreshed VM location reports the destination pool.'
      )
      await query.refetch()
    } catch (error) {
      const message =
        error?.data?.message ?? error?.message ?? 'Could not move VM storage.'
      setMigrationStatus(message)
      enqueueError(message)
    }
  }

  const applyVmSpecs = async () => {
    if (!selectedVm?.ID) return
    const vcpu = Math.max(1, Number(editVcpu) || 1)
    const memoryGb = Math.max(1, Number(editMemoryGb) || 1)
    try {
      await resizeVm({
        id: selectedVm.ID,
        template: jsonToXml({
          CPU: String(vcpu),
          VCPU: String(vcpu),
          MEMORY: String(memoryGb * 1024),
        }),
        enforce: true,
      }).unwrap()
      enqueueSuccess(
        'VM resize requested. Current values will refresh after the infrastructure accepts the change.'
      )
      query.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not resize VM.'
      )
    }
  }

  const applyVmDetails = async () => {
    if (!selectedVm?.ID) return
    try {
      if (editName.trim() && editName.trim() !== selectedVm.NAME) {
        await renameVm({ id: selectedVm.ID, name: editName.trim() }).unwrap()
      }
      if (
        String(editDescription ?? '') !==
        String(selectedVm?.USER_TEMPLATE?.DESCRIPTION ?? '')
      ) {
        await updateUserTemplate({
          id: selectedVm.ID,
          template: jsonToXml({ DESCRIPTION: editDescription.trim() }),
          replace: 1,
        }).unwrap()
      }
      enqueueSuccess('VM details updated successfully.')
      query.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not update VM details.'
      )
    }
  }

  return (
    <PageFrame
      title="Compute"
      description="View virtual machines through the LayerSentry infrastructure API. Mutating actions appear only after their production path is qualified."
      actions={
        canCreateVm ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push(PRODUCT_PATHS.COMPUTE_CREATE)}
            sx={{ textTransform: 'none' }}
          >
            Create VM
          </Button>
        ) : null
      }
    >
      {query.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Compute summary could not be loaded. The inventory below contains its
          own API error state so the LayerSentry shell remains usable.
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 1.5,
          mt: 2,
        }}
      >
        <MetricCard
          label="Virtual Machines"
          value={query.isLoading ? '…' : query.isError ? '—' : vms.length}
          icon={Server}
        />
        <MetricCard
          label="Running"
          value={query.isLoading ? '…' : query.isError ? '—' : running}
          detail="Running state"
          icon={Server}
          accent={colors.status.success}
        />
        <MetricCard
          label="Allocated vCPU"
          value={query.isLoading ? '…' : query.isError ? '—' : totalCpu || '—'}
          detail="Across visible VMs"
          icon={Server}
        />
        <MetricCard
          label="Allocated Memory"
          value={
            query.isLoading || query.isError
              ? query.isLoading
                ? '…'
                : '—'
              : totalMemoryMb
              ? `${Math.round(totalMemoryMb / 1024)} GB`
              : '—'
          }
          detail="Across visible VMs"
          icon={Server}
          accent={colors.brand.accent}
        />
      </Box>

      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Compute actions"
          description="Only qualified actions are shown. Unqualified create and Day-2 operations stay hidden rather than presenting a working-looking control."
        />
        <Box
          data-layersentry-compute-actions
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(5, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {quickActions.map(({ label, path, icon: Icon, primary }) => (
            <Button
              key={path}
              variant={primary ? 'contained' : 'outlined'}
              startIcon={<Icon width={17} height={17} />}
              onClick={() => history.push(path)}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                minHeight: 42,
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Surface>

      {isAdmin && (canResizeVm || canUpdateVm || canMigrateVm) && (
        <Surface sx={{ mt: 2, p: 2.5 }} data-layersentry-vm-admin-editor>
          <SectionHeader
            title="Super Admin VM editor"
            description="Select a VM to review its current specifications before applying a qualified change. Resize may require a powered-off VM depending on the backend state."
          />
          <FormControl fullWidth size="small">
            <InputLabel id="vm-admin-editor-label">Virtual machine</InputLabel>
            <Select
              labelId="vm-admin-editor-label"
              label="Virtual machine"
              value={selectedVmId}
              onChange={(event) => selectVmForEdit(event.target.value)}
            >
              {vms.map((vm) => (
                <MenuItem key={vm.ID} value={String(vm.ID)}>
                  {vm.NAME || 'VM ' + vm.ID}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {selectedVm && (
            <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
                  gap: 1,
                }}
              >
                {[
                  [
                    'Current vCPU',
                    selectedVm?.TEMPLATE?.VCPU ??
                      selectedVm?.TEMPLATE?.CPU ??
                      '—',
                  ],
                  [
                    'Current memory',
                    selectedVm?.TEMPLATE?.MEMORY
                      ? Math.round(Number(selectedVm.TEMPLATE.MEMORY) / 1024) +
                        ' GB'
                      : '—',
                  ],
                  [
                    'Attached storage',
                    selectedStorageGb
                      ? Math.round(selectedStorageGb) + ' GB'
                      : '—',
                  ],
                  [
                    'State',
                    String(selectedVm.STATE) === '3'
                      ? 'Running'
                      : String(selectedVm.STATE),
                  ],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{
                      p: 1.25,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 1.5,
                    }}
                  >
                    <Typography sx={{ fontSize: 10, color: colors.text.muted }}>
                      {label}
                    </Typography>
                    <Typography
                      sx={{ mt: 0.25, fontSize: 14, fontWeight: 800 }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' },
                  gap: 1.25,
                }}
              >
                <TextField
                  size="small"
                  label="VM name"
                  value={editName}
                  disabled={!canUpdateVm}
                  onChange={(event) => setEditName(event.target.value)}
                />
                <TextField
                  size="small"
                  type="number"
                  label="vCPU"
                  value={editVcpu}
                  disabled={!canResizeVm}
                  inputProps={{ min: 1 }}
                  onChange={(event) => setEditVcpu(event.target.value)}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Memory (GB)"
                  value={editMemoryGb}
                  disabled={!canResizeVm}
                  inputProps={{ min: 1 }}
                  onChange={(event) => setEditMemoryGb(event.target.value)}
                />
              </Box>
              <TextField
                size="small"
                label="Description"
                value={editDescription}
                disabled={!canUpdateVm}
                onChange={(event) => setEditDescription(event.target.value)}
                helperText="Current value is loaded before editing; LayerSentry only merges this qualified metadata field."
              />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {canResizeVm && (
                  <Button
                    variant="contained"
                    disabled={editorBusy}
                    onClick={applyVmSpecs}
                    sx={{ textTransform: 'none' }}
                  >
                    Apply vCPU / RAM
                  </Button>
                )}
                {canUpdateVm && (
                  <Button
                    variant="outlined"
                    disabled={editorBusy}
                    onClick={applyVmDetails}
                    sx={{ textTransform: 'none' }}
                  >
                    Update VM details
                  </Button>
                )}
              </Box>
              {canMigrateVm && (
                <Box
                  sx={{
                    mt: 1,
                    p: 2,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                  }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
                    Move storage
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}>
                    Current host: {currentLocation?.HOSTNAME ?? '—'} · Current storage pool:{' '}
                    {currentLocation?.DS_ID ?? '—'}. OpenNebula performs the native migration;
                    LayerSentry never copies disk files directly.
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      gap: 1.25,
                      mt: 1.5,
                    }}
                  >
                    <FormControl fullWidth size="small">
                      <InputLabel id="storage-move-host-label">Destination host</InputLabel>
                      <Select
                        labelId="storage-move-host-label"
                        label="Destination host"
                        value={targetHostId}
                        onChange={(event) => setTargetHostId(event.target.value)}
                      >
                        {availableHosts.map((host) => (
                          <MenuItem key={host.ID} value={String(host.ID)}>
                            {host.NAME || `Host ${host.ID}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth size="small">
                      <InputLabel id="storage-move-datastore-label">
                        Destination storage pool
                      </InputLabel>
                      <Select
                        labelId="storage-move-datastore-label"
                        label="Destination storage pool"
                        value={targetDatastoreId}
                        onChange={(event) => setTargetDatastoreId(event.target.value)}
                      >
                        {systemDatastores.map((datastore) => (
                          <MenuItem
                            key={datastore.ID}
                            value={String(datastore.ID)}
                            disabled={String(datastore.ID) === String(currentLocation?.DS_ID)}
                          >
                            {datastore.NAME || `Storage ${datastore.ID}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <FormControlLabel
                    sx={{ mt: 0.75 }}
                    control={
                      <Checkbox
                        checked={liveStorageMove}
                        onChange={(event) => setLiveStorageMove(event.target.checked)}
                      />
                    }
                    label="Keep the running VM online (live migration)"
                  />
                  {systemDatastores.every(
                    ({ ID }) => String(ID) === String(currentLocation?.DS_ID)
                  ) && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      No compatible destination storage pool is available. OpenNebula
                      requires the source and destination to use the same transfer driver.
                    </Alert>
                  )}
                  {!liveStorageMove && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Warm migration powers off the VM during the storage move. Review the
                      workload maintenance window first.
                    </Alert>
                  )}
                  {migrationStatus && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      {migrationStatus}
                    </Alert>
                  )}
                  <Button
                    variant="contained"
                    disabled={
                      editorBusy || !targetHostId || !targetDatastoreId
                    }
                    onClick={moveVmStorage}
                    sx={{ mt: 1.25, textTransform: 'none' }}
                  >
                    {migrateState.isLoading ? 'Requesting move…' : 'Move storage'}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Surface>
      )}

      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Virtual machines"
          description="Read-only authoritative inventory. VM Day-2 controls remain hidden until each mutation path has API, readback, RBAC and recovery evidence."
        />
        <ResourceBridge endpoints={endpoints} legacyPath="/vm" />
      </Surface>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
          Storage safety
        </Typography>
        <Typography
          sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
        >
          Use the Storage workspace only for qualified persistent-disk actions.
          Detach preserves the disk image; permanent deletion remains a separate
          confirmed action.
        </Typography>
      </Surface>
    </PageFrame>
  )
}

ComputeWorkspace.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
ComputeWorkspace.defaultProps = { endpoints: [] }
export default ComputeWorkspace
