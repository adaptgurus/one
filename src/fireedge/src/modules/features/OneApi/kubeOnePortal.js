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
import { Actions, Commands } from 'server/routes/api/kubeoneportal/routes'

const kubeOnePortalApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getKubeOneClusters: builder.query({
      query: () => ({ command: Commands[Actions.LIST] }),
      providesTags: ['KUBEONE_PORTAL'],
    }),
    getKubeOneNamespaces: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.NAMESPACES],
      }),
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
    getKubeOneProvisionStatus: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.PROVISION_STATUS],
        showNotification: false,
      }),
      providesTags: (_result, _error, id) => [
        { type: 'KUBEONE_PORTAL', id: `provision-${id}` },
      ],
    }),
    provisionKubeOneCluster: builder.mutation({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.PROVISION],
      }),
      invalidatesTags: (_result, _error, id) => [
        'KUBEONE_PORTAL',
        { type: 'KUBEONE_PORTAL', id: `provision-${id}` },
      ],
    }),
    getKubeOneControlPlaneReconciliation: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.CONTROL_PLANE_RECONCILIATION_STATUS],
        showNotification: false,
      }),
      providesTags: (_result, _error, id) => [
        { type: 'KUBEONE_PORTAL', id: `control-plane-reconciliation-${id}` },
      ],
    }),
    reconcileKubeOneControlPlane: builder.mutation({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.CONTROL_PLANE_RECONCILIATION],
      }),
      invalidatesTags: (_result, _error, id) => [
        'KUBEONE_PORTAL',
        { type: 'KUBEONE_PORTAL', id: `control-plane-reconciliation-${id}` },
      ],
    }),
    getKubeOneWorkerReconciliation: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.WORKER_RECONCILIATION],
        showNotification: false,
      }),
      providesTags: (_result, _error, id) => [
        { type: 'KUBEONE_PORTAL', id: `worker-reconciliation-${id}` },
      ],
    }),
    getKubeOneApplications: builder.query({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.APPLICATIONS],
        showNotification: false,
      }),
      providesTags: (_result, _error, id) => [
        { type: 'KUBEONE_PORTAL', id: `applications-${id}` },
      ],
    }),
    installKubeOneApplication: builder.mutation({
      query: ({ id, app }) => ({
        params: { id, app },
        command: Commands[Actions.INSTALL_APPLICATION],
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'KUBEONE_PORTAL', id: `applications-${id}` },
      ],
    }),
    reconcileKubeOneWorkers: builder.mutation({
      query: (id) => ({
        params: { id },
        command: Commands[Actions.RECONCILE_WORKERS],
      }),
      invalidatesTags: (_result, _error, id) => [
        'KUBEONE_PORTAL',
        { type: 'KUBEONE_PORTAL', id: `worker-reconciliation-${id}` },
      ],
    }),
  }),
})

export const {
  useGetKubeOneClustersQuery,
  useGetKubeOneNamespacesQuery,
  useCreateKubeOneNamespaceMutation,
  useLazyGetKubeOneKubeconfigQuery,
  useGetKubeOneProvisionStatusQuery,
  useProvisionKubeOneClusterMutation,
  useGetKubeOneControlPlaneReconciliationQuery,
  useReconcileKubeOneControlPlaneMutation,
  useGetKubeOneWorkerReconciliationQuery,
  useGetKubeOneApplicationsQuery,
  useInstallKubeOneApplicationMutation,
  useReconcileKubeOneWorkersMutation,
} = kubeOnePortalApi

export default kubeOnePortalApi