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

import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Cancel, Copy } from 'iconoir-react'
import { ReactElement, useCallback, useMemo, useState } from 'react'
import { useHistory } from 'react-router'

import { Button, Image, StatusTag, Table, Tag, Text } from '@ComponentsModule'
import {
  DEFAULT_TEMPLATE_LOGO,
  PATH,
  STATIC_FILES_URL,
  T,
  TEXT_VARIANTS,
  TEXT_WEIGHTS,
  UNITS,
} from '@ConstantsModule'
import { VmAPI, useGeneralApi } from '@FeaturesModule'
import {
  getDiskSize,
  getVirtualMachineState,
  imageTable,
  vmsTable,
  vmtemplateTable,
} from '@ModelsModule'
import {
  canCloneVm,
  getTemplateImageIds,
  isLayerSentryCloneSource,
  isLayerSentryCustomerTemplate,
  parseSavedTemplateId,
  prettyBytes,
} from '@UtilsModule'
import { VirtualMachines } from '@modules/containers/VirtualMachines/VirtualMachines'
import { scale } from '@StylesModule'

const tabProps = (index) => ({
  id: `layersentry-create-vm-tab-${index}`,
  'aria-controls': `layersentry-create-vm-panel-${index}`,
})

/**
 * Displays the LayerSentry VM creation source selector.
 *
 * @returns {ReactElement} Virtual machines list with creation dialog
 */
export function CreateVm() {
  const history = useHistory()
  const { enqueueError, enqueueInfo } = useGeneralApi()
  const [tab, setTab] = useState(0)
  const [selectedCloneVm, setSelectedCloneVm] = useState()
  const [cloneTemplateName, setCloneTemplateName] = useState('')
  const [saveAsTemplate, { isLoading: isCloning }] =
    VmAPI.useSaveAsTemplateMutation()

  const {
    data: templateData = [],
    isFetching: isRefreshingTemplates,
    refetch: refreshTemplates,
  } = vmtemplateTable.useData()
  const {
    data: imageData = [],
    isFetching: isRefreshingImages,
    refetch: refreshImages,
  } = imageTable.useData()
  const {
    data: vmData = [],
    isFetching: isRefreshingVms,
    refetch: refreshVms,
  } = vmsTable.useData({ extended: 0, pageSize: 100 })

  const imageById = useMemo(
    () => new Map(imageData.map((image) => [String(image.ID), image])),
    [imageData]
  )

  const templates = useMemo(
    () =>
      templateData.filter((template) =>
        isLayerSentryCustomerTemplate(template, imageData)
      ),
    [templateData, imageData]
  )

  const cloneSources = useMemo(
    () => vmData.filter(isLayerSentryCloneSource),
    [vmData]
  )

  const templateColumns = useMemo(
    () => [
      {
        accessorKey: 'NAME',
        header: T.Name,
        truncate: true,
        cell: ({ row }) => {
          const logo = row.original?.TEMPLATE?.LOGO ?? DEFAULT_TEMPLATE_LOGO

          return (
            <Stack direction="row" alignItems="center" gap={1.25} minWidth={0}>
              <Image
                src={`${STATIC_FILES_URL}/${logo}`}
                width={scale[600]}
                height={scale[600]}
                alt="template"
              />
              <Box minWidth={0}>
                <Typography noWrap fontWeight={650}>
                  {row.original?.NAME}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Template #{row.original?.ID}
                </Typography>
              </Box>
            </Stack>
          )
        },
      },
      {
        id: 'cpu',
        header: T.CPU,
        grow: false,
        accessorFn: (row) => row?.TEMPLATE?.VCPU ?? row?.TEMPLATE?.CPU ?? 1,
      },
      {
        id: 'memory',
        header: T.Memory,
        grow: false,
        cell: ({ row }) =>
          prettyBytes(row.original?.TEMPLATE?.MEMORY ?? 0, UNITS.MB),
      },
      {
        id: 'image',
        header: 'OS image',
        truncate: true,
        cell: ({ row }) => {
          const imageId = getTemplateImageIds(row.original)[0]
          const image = imageById.get(String(imageId))

          return image?.NAME ?? `Image #${imageId}`
        },
      },
      {
        id: 'format',
        header: 'Disk format',
        grow: false,
        cell: () => <Tag title="QCOW2" status="default" />,
      },
      {
        id: 'architecture',
        header: T.Architecture,
        grow: false,
        cell: ({ row }) => row.original?.TEMPLATE?.OS?.ARCH ?? 'x86_64',
      },
    ],
    [imageById]
  )

  const cloneColumns = useMemo(
    () => [
      {
        accessorKey: 'NAME',
        header: T.Name,
        truncate: true,
        cell: ({ row }) => (
          <Box minWidth={0}>
            <Typography noWrap fontWeight={650}>
              {row.original?.NAME}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              VM #{row.original?.ID}
            </Typography>
          </Box>
        ),
      },
      {
        id: 'state',
        header: T.State,
        grow: false,
        cell: ({ row }) => {
          const state = getVirtualMachineState(row.original) ?? {}

          return (
            <StatusTag statusColor={state.color} statusName={state.name ?? '-'} />
          )
        },
      },
      {
        id: 'cpu',
        header: T.CPU,
        grow: false,
        cell: ({ row }) => row.original?.TEMPLATE?.VCPU ?? row.original?.TEMPLATE?.CPU ?? 1,
      },
      {
        id: 'memory',
        header: T.Memory,
        grow: false,
        cell: ({ row }) =>
          prettyBytes(row.original?.TEMPLATE?.MEMORY ?? 0, UNITS.MB),
      },
      {
        id: 'disk',
        header: 'Disk',
        grow: false,
        cell: ({ row }) => prettyBytes(getDiskSize(row.original), UNITS.MB),
      },
      {
        id: 'clone-state',
        header: 'Clone readiness',
        grow: false,
        cell: ({ row }) =>
          canCloneVm(row.original) ? (
            <Tag title="Ready" status="success" />
          ) : (
            <Tag title="Power off required" status="warning" />
          ),
      },
    ],
    []
  )

  const handleClose = useCallback(() => {
    history.replace(PATH.INSTANCE.VMS.LIST)
  }, [history])

  const redirectToInstantiate = useCallback(
    (template) => {
      history.push({
        pathname: PATH.TEMPLATE.VMS.INSTANTIATE,
        search: `?template=${encodeURIComponent(template.ID)}`,
        state: {
          ...template,
          navigateUrl: 'vm',
        },
      })
    },
    [history]
  )

  const handleSelectCloneVm = useCallback((vm) => {
    setSelectedCloneVm(vm)
    setCloneTemplateName(`${vm.NAME}-clone`)
  }, [])

  const handleClone = async () => {
    if (!selectedCloneVm) return
    if (!canCloneVm(selectedCloneVm)) {
      enqueueError(
        'LayerSentry requires the source VM to be powered off before a full VM clone can be created.'
      )

      return
    }

    const name = cloneTemplateName.trim()
    if (!name) {
      enqueueError('Enter a name for the clone source template.')

      return
    }

    try {
      const response = await saveAsTemplate({
        id: selectedCloneVm.ID,
        name,
        persistent: false,
      }).unwrap()
      await refreshTemplates()
      const templateId = parseSavedTemplateId(response)

      if (templateId !== undefined) {
        redirectToInstantiate({ ID: templateId, NAME: name })
      } else {
        setTab(0)
        enqueueInfo(
          'Clone template created. Select it from the Templates tab to finish VM creation.'
        )
      }
    } catch (error) {
      enqueueError(error?.data?.message ?? error?.message ?? 'VM clone failed')
    }
  }

  const handleRefresh = () => {
    if (tab === 0) {
      refreshTemplates()
      refreshImages()
    } else {
      refreshVms()
    }
  }

  return (
    <>
      <VirtualMachines />
      <Dialog
        open
        fullWidth
        maxWidth="md"
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 'min(980px, calc(100vw - 32px))',
            maxWidth: 'none',
            minHeight: { xs: 'calc(100vh - 32px)', md: 620 },
            maxHeight: 'calc(100vh - 32px)',
            borderRadius: { xs: 2, md: 3 },
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
            <Box>
              <Text
                value="Create virtual machine"
                variant={TEXT_VARIANTS.H6}
                weight={TEXT_WEIGHTS.SEMIBOLD}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Deploy from an approved QCOW2 template or prepare a clone from an existing VM.
              </Typography>
            </Box>
            <Button
              iconOnly={<Cancel />}
              type="secondary"
              title={T.Close}
              onClick={handleClose}
            />
          </Stack>
        </DialogTitle>

        <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, next) => setTab(next)} aria-label="VM creation source">
            <Tab label="From template" {...tabProps(0)} />
            <Tab label="Clone existing VM" {...tabProps(1)} />
          </Tabs>
        </Box>

        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'auto',
            px: { xs: 2, md: 3 },
            py: 2.5,
          }}
        >
          {tab === 0 ? (
            <Stack gap={2}>
              <Alert severity="info">
                Only customer VM templates backed by QCOW2 OS images are shown. Provider-managed OneKS and virtual-router templates are hidden.
              </Alert>
              <Table
                columns={templateColumns}
                data={templates}
                isLoading={isRefreshingTemplates || isRefreshingImages}
                isRowsSelectable
                isMultiRowSelection={false}
                getRowId={(row) => row.ID}
                onRowClick={redirectToInstantiate}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshingTemplates || isRefreshingImages}
                isEnableSearchBar
                isEnableSort
                searchPlaceholder="Search approved templates"
                defaultPageSize={5}
                pageSizeOptions={[5, 10, 25]}
                skeletonRows={4}
                size="medium"
              />
            </Stack>
          ) : (
            <Stack gap={2}>
              <Alert severity="warning">
                LayerSentry supports a full VM save/clone only while the source VM is powered off. Running customer VMs are listed here, but the clone action stays blocked until they are powered off.
              </Alert>
              <Table
                columns={cloneColumns}
                data={cloneSources}
                isLoading={isRefreshingVms}
                isRowsSelectable
                isMultiRowSelection={false}
                getRowId={(row) => row.ID}
                onRowClick={handleSelectCloneVm}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshingVms}
                isEnableSearchBar
                searchPlaceholder="Search existing VMs"
                defaultPageSize={5}
                pageSizeOptions={[5, 10, 25]}
                skeletonRows={4}
                size="medium"
              />

              {selectedCloneVm && (
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 2,
                  }}
                >
                  <Stack gap={2}>
                    <Box>
                      <Typography fontWeight={700}>
                        Clone {selectedCloneVm.NAME}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        A reusable template is captured first; LayerSentry then opens the normal VM creation wizard.
                      </Typography>
                    </Box>
                    <TextField
                      label="Clone source template name"
                      value={cloneTemplateName}
                      onChange={(event) => setCloneTemplateName(event.target.value)}
                      fullWidth
                      size="small"
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                      <Button
                        startIcon={<Copy />}
                        type="primary"
                        onClick={handleClone}
                        isDisabled={!canCloneVm(selectedCloneVm) || isCloning}
                      >
                        {isCloning ? 'Creating clone…' : 'Create clone and continue'}
                      </Button>
                      {!canCloneVm(selectedCloneVm) && (
                        <Button
                          type="secondary"
                          onClick={() =>
                            history.push(
                              PATH.INSTANCE.VMS.DETAIL.replace(
                                ':id',
                                selectedCloneVm.ID
                              )
                            )
                          }
                        >
                          Open VM to power off
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
