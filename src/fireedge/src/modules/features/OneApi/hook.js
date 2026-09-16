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
import { Actions, Commands } from 'server/utils/constants/commands/hook'
import { oneApi } from '@modules/features/OneApi/oneApi'

const hookApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getHooks: builder.query({
      query: (params = {}) => {
        const name = Actions.HOOK_POOL_INFO
        const command = { name, ...Commands[name] }

        return {
          params: { filter: -2, start: -1, end: -1, ...params },
          command,
        }
      },
      transformResponse: (data) => [data?.HOOK_POOL?.HOOK ?? []].flat(),
    }),
    getHook: builder.query({
      query: ({ id, decrypt = false }) => {
        const name = Actions.HOOK_INFO

        return { params: { id, decrypt }, command: { name, ...Commands[name] } }
      },
      transformResponse: (data) => data?.HOOK,
    }),
    getHookLog: builder.query({
      query: ({ minTs = -1, maxTs = -1, hookId = -1, rcHook = 0 } = {}) => {
        const name = Actions.HOOK_LOG_INFO

        return {
          params: {
            min_ts: minTs,
            max_ts: maxTs,
            hook_id: hookId,
            rc_hook: rcHook,
          },
          command: { name, ...Commands[name] },
        }
      },
      transformResponse: (data) =>
        [data?.HOOKLOG?.HOOK_EXECUTION_RECORD ?? []].flat().filter(Boolean),
    }),
    allocateHook: builder.mutation({
      query: ({ template }) => {
        const name = Actions.HOOK_ALLOCATE

        return { params: { template }, command: { name, ...Commands[name] } }
      },
    }),
    updateHook: builder.mutation({
      query: ({ id, template, replace = 0 }) => {
        const name = Actions.HOOK_UPDATE

        return {
          params: { id, template, replace },
          command: { name, ...Commands[name] },
        }
      },
    }),
    deleteHook: builder.mutation({
      query: ({ id }) => {
        const name = Actions.HOOK_DELETE

        return { params: { id }, command: { name, ...Commands[name] } }
      },
    }),
    renameHook: builder.mutation({
      query: ({ id, name: nextName }) => {
        const name = Actions.HOOK_RENAME

        return {
          params: { id, name: nextName },
          command: { name, ...Commands[name] },
        }
      },
    }),
    lockHook: builder.mutation({
      query: ({ id, lock = 4 }) => {
        const name = Actions.HOOK_LOCK

        return { params: { id, lock }, command: { name, ...Commands[name] } }
      },
    }),
    unlockHook: builder.mutation({
      query: ({ id }) => {
        const name = Actions.HOOK_UNLOCK

        return { params: { id }, command: { name, ...Commands[name] } }
      },
    }),
    retryHook: builder.mutation({
      query: ({ id, execution }) => {
        const name = Actions.HOOK_RETRY

        return {
          params: { id, execution },
          command: { name, ...Commands[name] },
        }
      },
    }),
  }),
})

const HookAPI = (({
  useGetHooksQuery,
  useGetHookQuery,
  useGetHookLogQuery,
  useAllocateHookMutation,
  useUpdateHookMutation,
  useDeleteHookMutation,
  useRenameHookMutation,
  useLockHookMutation,
  useUnlockHookMutation,
  useRetryHookMutation,
}) => ({
  useGetHooksQuery,
  useGetHookQuery,
  useGetHookLogQuery,
  useAllocateHookMutation,
  useUpdateHookMutation,
  useDeleteHookMutation,
  useRenameHookMutation,
  useLockHookMutation,
  useUnlockHookMutation,
  useRetryHookMutation,
}))(hookApi)

export default HookAPI
