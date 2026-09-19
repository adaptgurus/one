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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { HardDrive, Plus, RefreshDouble, Trash } from 'iconoir-react'
import { useMemo, useState } from 'react'
import {
  DatastoreAPI,
  ImageAPI,
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
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
    ? value
    : [value]
const asNumber = (value) => Number.parseInt(value, 10) || 0
const mbToGb = (value) => Math.max(1, Math.ceil(asNumber(value) / 1024))

const StorageWorkspace = ({ endpoints }) => {
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const capabilityModel = getCapabilityModel()
  const canAttach = isCapabilityEnabled(
    CAPABILITY_IDS.STORAGE_DISK_ATTACH,
    capabilityModel
  )
  const canResize = isCapabilityEnabled(
    CAPABILITY_IDS.STORAGE_DISK_RESIZE,
    capabilityModel
  )
  const canDetach = isCapabilityEnabled(
    CAPABILITY_IDS.STORAGE_DISK_DETACH,
    capabilityModel
  )
  const canDeleteImage = isCapabilityEnabled(
    CAPABILITY_IDS.STORAGE_IMAGE_DELETE,
    capabilityModel
  )
  const { enqueueSuccess, enqueueError } = useGeneralApi()
  const vmQuery = VmAPI.useGetVmsQuery({ extended: true })
  const imageQuery = ImageAPI.useGetImagesQuery()
  const datastoreQuery = DatastoreAPI.useGetDatastoresQuery(undefined, {
    skip: false,
  })
  const [allocateImage, allocateState] = ImageAPI.useAllocateImageMutation()
  const [removeImage, removeState] = ImageAPI.useRemoveImageMutation()
  const [attachDisk, attachState] = VmAPI.useAttachDiskMutation()
  const [detachDisk, detachState] = VmAPI.useDetachDiskMutation()
  const [resizeDisk, resizeState] = VmAPI.useResizeDiskMutation()

  const vms = toArray(vmQuery.data)
  const images = toArray(imageQuery.data).filter(
    ({ TYPE }) =>
      String(TYPE) === '1' || String(TYPE).toUpperCase() === 'DATABLOCK'
  )
  const datastores = toArray(datastoreQuery.data).filter(
    ({ TYPE }) =>
      String(TYPE) === '0' || String(TYPE).toUpperCase() === 'IMAGE_DS'
  )

  const [tab, setTab] = useState(0)
  const [vmId, setVmId] = useState('')
  const [mode, setMode] = useState('new')
  const [sizeGb, setSizeGb] = useState(100)
  const [imageId, setImageId] = useState('')
  const [datastoreId, setDatastoreId] = useState('')
  const [resizeValues, setResizeValues] = useState({})

  const vm = useMemo(
    () => vms.find(({ ID }) => String(ID) === String(vmId)),
    [vms, vmId]
  )
  const disks = toArray(vm?.TEMPLATE?.DISK)
  const busy =
    allocateState.isLoading ||
    attachState.isLoading ||
    detachState.isLoading ||
    resizeState.isLoading ||
    removeState.isLoading

  const runAttach = async () => {
    if (!vm?.ID) return enqueueError('Select a virtual machine first.')
    try {
      let selectedImage = imageId
      if (mode === 'new') {
        const targetDatastore = datastoreId || datastores[0]?.ID
        if (!targetDatastore) {
          enqueueError(
            'No image storage is available for a new persistent disk.'
          )

          return
        }
        const name = `${vm.NAME || `vm-${vm.ID}`}-data-${Date.now()}`
        selectedImage = await allocateImage({
          datastore: targetDatastore,
          template: jsonToXml({
            NAME: name,
            TYPE: 'DATABLOCK',
            SIZE: Math.max(1, asNumber(sizeGb)) * 1024,
            PERSISTENT: 'YES',
          }),
        }).unwrap()
      }
      if (!selectedImage) {
        enqueueError('Select an existing disk image.')

        return
      }
      await attachDisk({
        id: vm.ID,
        template: jsonToXml({ DISK: { IMAGE_ID: selectedImage } }),
      }).unwrap()
      enqueueSuccess('Disk attach requested successfully.')
      setImageId('')
      vmQuery.refetch()
      imageQuery.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not attach disk.'
      )
    }
  }

  const runDetach = async (disk) => {
    const label = disk?.IMAGE ?? disk?.TARGET ?? `disk ${disk?.DISK_ID}`
    if (
      !window.confirm(
        `Detach ${label} from ${vm?.NAME}? The disk image is not deleted.`
      )
    ) {
      return
    }
    try {
      await detachDisk({ id: vm.ID, disk: disk.DISK_ID }).unwrap()
      enqueueSuccess('Disk detach requested. The disk image is preserved.')
      vmQuery.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not detach disk.'
      )
    }
  }

  const runResize = async (disk) => {
    const nextGb = Math.max(
      mbToGb(disk.SIZE),
      asNumber(resizeValues[disk.DISK_ID] ?? mbToGb(disk.SIZE))
    )
    try {
      await resizeDisk({
        id: vm.ID,
        disk: disk.DISK_ID,
        size: String(nextGb * 1024),
      }).unwrap()
      enqueueSuccess(`Disk resize requested to ${nextGb} GB.`)
      vmQuery.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not resize disk.'
      )
    }
  }

  const deleteImage = async (image) => {
    const typed = window.prompt(
      `Permanent deletion cannot be undone. Type ${image.NAME} to delete this disk image.`
    )
    if (typed !== image.NAME) return
    try {
      await removeImage({ id: image.ID }).unwrap()
      enqueueSuccess('Disk image deleted permanently.')
      imageQuery.refetch()
    } catch (error) {
      enqueueError(
        error?.data?.message ?? error?.message ?? 'Could not delete disk image.'
      )
    }
  }

  return (
    <PageFrame
      title="Storage"
      description="Authoritative disk inventory with storage mutations shown only after their production path is qualified."
      actions={
        <Button
          variant="outlined"
          startIcon={<RefreshDouble width={17} height={17} />}
          onClick={() => {
            vmQuery.refetch()
            imageQuery.refetch()
          }}
          sx={{ textTransform: 'none' }}
        >
          Refresh
        </Button>
      }
    >
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="VM disks" />
        <Tab label="Disk images" />
        {isAdmin && <Tab label="Storage pools" />}
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
          <Surface sx={{ p: 2.5 }}>
            <SectionHeader
              title="Virtual machine"
              description="Choose the server whose storage you want to manage."
            />
            <FormControl fullWidth size="small">
              <InputLabel id="storage-vm-label">Virtual machine</InputLabel>
              <Select
                labelId="storage-vm-label"
                label="Virtual machine"
                value={vmId}
                onChange={(event) => setVmId(event.target.value)}
              >
                {vms.map((item) => (
                  <MenuItem key={item.ID} value={String(item.ID)}>
                    {item.NAME || `VM ${item.ID}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Surface>

          {vm && (
            <Surface sx={{ p: 2.5 }}>
              <SectionHeader
                title="Attached disks"
                description="Detach preserves persistent disk images. Permanent deletion is a separate action."
              />
              <Box sx={{ display: 'grid', gap: 1 }}>
                {disks.length === 0 && (
                  <Alert severity="info">No disks reported.</Alert>
                )}
                {disks.map((disk) => (
                  <Box
                    key={disk.DISK_ID ?? disk.TARGET}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: '2fr 1fr 1fr auto',
                      },
                      gap: 1.25,
                      alignItems: 'center',
                      p: 1.5,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 1.5,
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                        {disk.IMAGE ?? disk.TARGET ?? `Disk ${disk.DISK_ID}`}
                      </Typography>
                      <Typography
                        sx={{ fontSize: 11, color: colors.text.muted }}
                      >
                        Guest device {disk.TARGET ?? 'assigned automatically'} ·{' '}
                        {mbToGb(disk.SIZE)} GB
                      </Typography>
                    </Box>
                    <TextField
                      size="small"
                      type="number"
                      label="New size (GB)"
                      value={resizeValues[disk.DISK_ID] ?? mbToGb(disk.SIZE)}
                      inputProps={{ min: mbToGb(disk.SIZE) }}
                      onChange={(event) =>
                        setResizeValues((current) => ({
                          ...current,
                          [disk.DISK_ID]: event.target.value,
                        }))
                      }
                    />
                    {canResize && (
                      <Button
                        disabled={busy}
                        onClick={() => runResize(disk)}
                        sx={{ textTransform: 'none' }}
                      >
                        Resize
                      </Button>
                    )}
                    {canDetach && (
                      <Button
                        disabled={busy}
                        color="warning"
                        onClick={() => runDetach(disk)}
                        sx={{ textTransform: 'none' }}
                      >
                        Detach
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            </Surface>
          )}

          {vm && canAttach && (
            <Surface sx={{ p: 2.5 }}>
              <SectionHeader
                title="Add disk"
                description="Create a persistent data disk or attach an existing disk image."
              />
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant={mode === 'new' ? 'contained' : 'outlined'}
                    startIcon={<Plus width={16} height={16} />}
                    onClick={() => setMode('new')}
                    sx={{ textTransform: 'none' }}
                  >
                    Create new disk
                  </Button>
                  <Button
                    variant={mode === 'existing' ? 'contained' : 'outlined'}
                    startIcon={<HardDrive width={16} height={16} />}
                    onClick={() => setMode('existing')}
                    sx={{ textTransform: 'none' }}
                  >
                    Attach existing disk
                  </Button>
                </Box>

                {mode === 'new' ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <TextField
                      size="small"
                      type="number"
                      label="Disk size (GB)"
                      value={sizeGb}
                      inputProps={{ min: 1 }}
                      onChange={(event) => setSizeGb(event.target.value)}
                    />
                    <FormControl fullWidth size="small">
                      <InputLabel id="storage-pool-label">Storage</InputLabel>
                      <Select
                        labelId="storage-pool-label"
                        label="Storage"
                        value={datastoreId || String(datastores[0]?.ID ?? '')}
                        onChange={(event) => setDatastoreId(event.target.value)}
                      >
                        {datastores.map((store) => (
                          <MenuItem key={store.ID} value={String(store.ID)}>
                            {store.NAME || 'Shared Storage'}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                ) : (
                  <FormControl fullWidth size="small">
                    <InputLabel id="existing-disk-label">
                      Existing disk
                    </InputLabel>
                    <Select
                      labelId="existing-disk-label"
                      label="Existing disk"
                      value={imageId}
                      onChange={(event) => setImageId(event.target.value)}
                    >
                      {images.map((image) => (
                        <MenuItem key={image.ID} value={String(image.ID)}>
                          {image.NAME || `Disk ${image.ID}`}{' '}
                          {image.SIZE ? `· ${mbToGb(image.SIZE)} GB` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <Alert severity="info">
                  New disks are created as persistent disk images. Detaching
                  them does not delete their data.
                </Alert>
                <Box>
                  <Button
                    variant="contained"
                    disabled={busy || (mode === 'existing' && !imageId)}
                    onClick={runAttach}
                    sx={{ textTransform: 'none' }}
                  >
                    Attach disk
                  </Button>
                </Box>
              </Box>
            </Surface>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Surface sx={{ mt: 2, p: 2.5 }}>
          <SectionHeader
            title="Disk images"
            description="Persistent disks remain here after they are detached from compute."
          />
          <Box sx={{ display: 'grid', gap: 1 }}>
            {images.map((image) => (
              <Box
                key={image.ID}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  p: 1.5,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 1.5,
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                    {image.NAME}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                    {image.SIZE
                      ? `${mbToGb(image.SIZE)} GB`
                      : 'Size unavailable'}{' '}
                    · persistent disk image
                  </Typography>
                </Box>
                {canDeleteImage && (
                  <Button
                    color="error"
                    disabled={busy}
                    startIcon={<Trash width={16} height={16} />}
                    onClick={() => deleteImage(image)}
                    sx={{ textTransform: 'none' }}
                  >
                    Delete permanently
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        </Surface>
      )}

      {isAdmin && tab === 2 && (
        <Surface sx={{ mt: 2, p: 2 }}>
          <ResourceBridge endpoints={endpoints} legacyPath="/datastore" />
        </Surface>
      )}
    </PageFrame>
  )
}

StorageWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
StorageWorkspace.defaultProps = { endpoints: [] }
export default StorageWorkspace
