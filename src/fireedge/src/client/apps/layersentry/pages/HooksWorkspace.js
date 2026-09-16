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
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Lock, Plus, RefreshDouble, Trash, Unlock } from 'iconoir-react'
import { useEffect, useMemo, useState } from 'react'
import { HookAPI, useGeneralApi } from '@FeaturesModule'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const dialogCopy = {
  create: ['Create hook', 'Paste a valid OpenNebula Hook template.'],
  update: ['Update hook', 'Submit template attributes to merge or replace.'],
  rename: ['Rename hook', 'Enter the new Hook name.'],
  retry: ['Retry execution', 'Enter the failed Hook execution ID.'],
}
const HooksWorkspace = () => {
  const { enqueueError, enqueueSuccess } = useGeneralApi()
  const hooksQuery = HookAPI.useGetHooksQuery()
  const hooks = useMemo(() => hooksQuery.data ?? [], [hooksQuery.data])
  const [selectedId, setSelectedId] = useState()
  const [dialog, setDialog] = useState()
  const [value, setValue] = useState('')
  const [replace, setReplace] = useState(false)

  useEffect(() => {
    if (selectedId === undefined && hooks[0]?.ID !== undefined)
      setSelectedId(hooks[0].ID)
    if (
      selectedId !== undefined &&
      !hooks.some(({ ID }) => `${ID}` === `${selectedId}`)
    ) {
      setSelectedId(hooks[0]?.ID)
    }
  }, [hooks, selectedId])

  const selected = hooks.find(({ ID }) => `${ID}` === `${selectedId}`)
  const detailQuery = HookAPI.useGetHookQuery(
    { id: selectedId, decrypt: false },
    { skip: selectedId === undefined }
  )
  const logQuery = HookAPI.useGetHookLogQuery(
    { minTs: -1, maxTs: -1, hookId: selectedId, rcHook: 0 },
    { skip: selectedId === undefined }
  )
  const executionLog = logQuery.data ?? []
  const [allocateHook, allocateState] = HookAPI.useAllocateHookMutation()
  const [updateHook, updateState] = HookAPI.useUpdateHookMutation()
  const [deleteHook, deleteState] = HookAPI.useDeleteHookMutation()
  const [renameHook, renameState] = HookAPI.useRenameHookMutation()
  const [lockHook, lockState] = HookAPI.useLockHookMutation()
  const [unlockHook, unlockState] = HookAPI.useUnlockHookMutation()
  const [retryHook, retryState] = HookAPI.useRetryHookMutation()
  const busy = [
    allocateState,
    updateState,
    deleteState,
    renameState,
    lockState,
    unlockState,
    retryState,
  ].some(({ isLoading }) => isLoading)

  const openDialog = (mode) => {
    setDialog(mode)
    setReplace(false)
    setValue(mode === 'rename' ? selected?.NAME ?? '' : '')
  }

  const closeDialog = () => {
    setDialog(undefined)
    setValue('')
    setReplace(false)
  }

  const refresh = async () => {
    await hooksQuery.refetch()
    if (selectedId !== undefined) {
      await Promise.all([detailQuery.refetch(), logQuery.refetch()])
    }
  }

  const perform = async (promise, success) => {
    try {
      await promise.unwrap()
      enqueueSuccess(success)
      closeDialog()
      await refresh()
    } catch (error) {
      enqueueError(error?.data ?? error?.message ?? 'Hook operation failed')
    }
  }
  const submitDialog = () => {
    if (!value.trim()) return
    if (dialog === 'create') {
      perform(allocateHook({ template: value }), 'Hook created')
    } else if (dialog === 'update') {
      perform(
        updateHook({
          id: selectedId,
          template: value,
          replace: replace ? 1 : 0,
        }),
        'Hook updated'
      )
    } else if (dialog === 'rename') {
      perform(
        renameHook({ id: selectedId, name: value.trim() }),
        'Hook renamed'
      )
    } else if (dialog === 'retry') {
      const execution = Number(value)
      if (!Number.isInteger(execution) || execution < 0) {
        enqueueError('Execution ID must be a non-negative integer')

        return
      }
      perform(
        retryHook({ id: selectedId, execution }),
        'Hook execution retried'
      )
    }
  }

  const remove = async () => {
    if (
      selectedId === undefined ||
      selectedId === null ||
      !window.confirm(`Delete Hook ${selected?.NAME ?? selectedId}?`)
    )
      return

    try {
      await deleteHook({ id: selectedId }).unwrap()
      enqueueSuccess('Hook deleted')
      setSelectedId(undefined)
      await hooksQuery.refetch()
    } catch (error) {
      enqueueError(error?.data ?? error?.message ?? 'Hook delete failed')
    }
  }

  return (
    <PageFrame
      title="Automation Hooks"
      description="Create and operate OpenNebula Hooks through the native authenticated XML-RPC lifecycle."
      actions={
        <Button
          variant="contained"
          startIcon={<Plus />}
          onClick={() => openDialog('create')}
        >
          Create Hook
        </Button>
      }
    >
      {' '}
      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Hooks"
          description="Select a Hook to inspect or operate it. Backend ACLs remain authoritative."
        />
        <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
          <Box sx={{ flex: '0 0 320px', display: 'grid', gap: 0.75 }}>
            {hooksQuery.isLoading && <Typography>Loading Hooks…</Typography>}
            {!hooksQuery.isLoading && hooks.length === 0 && (
              <Alert severity="info">No Hooks are defined.</Alert>
            )}
            {hooks.map((hook) => (
              <Button
                key={hook.ID}
                variant={
                  `${hook.ID}` === `${selectedId}` ? 'contained' : 'outlined'
                }
                onClick={() => setSelectedId(hook.ID)}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                #{hook.ID} · {hook.NAME ?? 'Unnamed Hook'}
              </Button>
            ))}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selected && (
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
                <Button disabled={busy} onClick={() => openDialog('update')}>
                  Update
                </Button>
                <Button disabled={busy} onClick={() => openDialog('rename')}>
                  Rename
                </Button>
                <Button
                  disabled={busy}
                  startIcon={<Lock />}
                  onClick={() =>
                    perform(lockHook({ id: selectedId }), 'Hook locked')
                  }
                >
                  Lock
                </Button>
                <Button
                  disabled={busy}
                  startIcon={<Unlock />}
                  onClick={() =>
                    perform(unlockHook({ id: selectedId }), 'Hook unlocked')
                  }
                >
                  Unlock
                </Button>
                <Button
                  disabled={busy}
                  startIcon={<RefreshDouble />}
                  onClick={() => openDialog('retry')}
                >
                  Retry execution
                </Button>
                <Button
                  disabled={busy}
                  color="error"
                  startIcon={<Trash />}
                  onClick={remove}
                >
                  Delete
                </Button>
              </Stack>
            )}
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                minHeight: 220,
                overflow: 'auto',
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
                backgroundColor: colors.surfaceMuted,
                fontSize: 11.5,
              }}
            >
              {selectedId === undefined
                ? 'Select a Hook.'
                : detailQuery.isFetching
                ? 'Loading Hook details…'
                : JSON.stringify(detailQuery.data ?? selected ?? {}, null, 2)}
            </Box>
            {selectedId !== undefined && (
              <>
                <Typography
                  sx={{ mt: 2, mb: 0.75, fontSize: 13, fontWeight: 750 }}
                >
                  Execution log
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    maxHeight: 320,
                    overflow: 'auto',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 1.5,
                    backgroundColor: colors.surfaceMuted,
                    fontSize: 11.5,
                  }}
                >
                  {logQuery.isFetching
                    ? 'Loading Hook execution log…'
                    : executionLog.length
                    ? JSON.stringify(executionLog, null, 2)
                    : 'No execution records match this Hook.'}
                </Box>
              </>
            )}
          </Box>
        </Stack>
      </Surface>
      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{dialogCopy[dialog]?.[0]}</DialogTitle>
        <DialogContent>
          <Typography
            sx={{ mb: 1.5, fontSize: 12, color: colors.text.secondary }}
          >
            {dialogCopy[dialog]?.[1]}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline={dialog === 'create' || dialog === 'update'}
            minRows={dialog === 'create' || dialog === 'update' ? 10 : 1}
            label={
              dialog === 'retry'
                ? 'Execution ID'
                : dialog === 'rename'
                ? 'Hook name'
                : 'Hook template'
            }
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {dialog === 'update' && (
            <Button
              sx={{ mt: 1 }}
              onClick={() => setReplace((current) => !current)}
            >
              {replace ? 'Replace mode: ON' : 'Replace mode: OFF (merge)'}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy || !value.trim()}
            onClick={submitDialog}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </PageFrame>
  )
}

export default HooksWorkspace
