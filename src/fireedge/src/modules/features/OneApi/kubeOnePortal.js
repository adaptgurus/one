import { oneApi } from '@modules/features/OneApi/oneApi'
import { Actions, Commands } from 'server/routes/api/kubeoneportal/routes'

const kubeOnePortalApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getKubeOneClusters: builder.query({
      query: () => ({ command: Commands[Actions.LIST] }),
      providesTags: ['KUBEONE_PORTAL'],
    }),
    getKubeOneNamespaces: builder.query({
      query: (id) => ({ params: { id }, command: Commands[Actions.NAMESPACES] }),
      providesTags: (_result, _error, id) => [
        { type: 'KUBEONE_PORTAL', id: `namespaces-${id}` },
      ],
    }),
    createKubeOneNamespace: builder.mutation({
      query: ({ id, name }) => ({
        params: { id, name },
        command: Commands[Actions.CREATE_NAMESPACE],
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'KUBEONE_PORTAL', id: `namespaces-${id}` },
      ],
    }),
    getKubeOneKubeconfig: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.KUBECONFIG],
        showNotification: false,
      }),
    }),
  }),
})

export const {
  useGetKubeOneClustersQuery,
  useGetKubeOneNamespacesQuery,
  useCreateKubeOneNamespaceMutation,
  useLazyGetKubeOneKubeconfigQuery,
} = kubeOnePortalApi

export default kubeOnePortalApi
