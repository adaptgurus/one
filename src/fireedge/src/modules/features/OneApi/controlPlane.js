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
import { oneApi } from '@modules/features/OneApi/oneApi'
import { Actions, Commands } from 'server/routes/api/controlplaneops/routes'

const controlPlaneApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getControlPlaneOperations: builder.query({
      query: ({ limit = 100 } = {}) => ({
        params: { limit },
        command: Commands[Actions.LIST],
        showNotification: false,
      }),
      providesTags: ['LAYERSENTRY_OPERATIONS'],
    }),
    getControlPlaneEvents: builder.query({
      query: ({ limit = 100 } = {}) => ({
        params: { limit },
        command: Commands[Actions.EVENTS],
        showNotification: false,
      }),
      providesTags: ['LAYERSENTRY_OPERATIONS'],
    }),
    submitControlPlaneOperation: builder.mutation({
      query: (params) => ({
        params,
        command: Commands[Actions.SUBMIT],
      }),
      invalidatesTags: ['LAYERSENTRY_OPERATIONS'],
    }),
    getControlPlaneOperation: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.GET],
        showNotification: false,
      }),
      providesTags: (_result, _error, id) => [
        { type: 'LAYERSENTRY_OPERATIONS', id },
      ],
    }),
    approveControlPlaneOperation: builder.mutation({
      query: ({ id, planHash }) => ({
        params: { id, planHash },
        command: Commands[Actions.APPROVE],
      }),
      invalidatesTags: (_result, _error, { id }) => [
        'LAYERSENTRY_OPERATIONS',
        { type: 'LAYERSENTRY_OPERATIONS', id },
      ],
    }),
  }),
})

export const {
  useGetControlPlaneOperationsQuery,
  useGetControlPlaneEventsQuery,
  useSubmitControlPlaneOperationMutation,
  useGetControlPlaneOperationQuery,
  useLazyGetControlPlaneOperationQuery,
  useApproveControlPlaneOperationMutation,
} = controlPlaneApi

export default controlPlaneApi
