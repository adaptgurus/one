import { oneApi } from '@modules/features/OneApi/oneApi'
import {
  Actions,
  Commands,
} from 'server/routes/api/controlplaneops/routes'

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
  }),
})

export const {
  useGetControlPlaneOperationsQuery,
  useSubmitControlPlaneOperationMutation,
  useGetControlPlaneOperationQuery,
  useLazyGetControlPlaneOperationQuery,
} = controlPlaneApi

export default controlPlaneApi
