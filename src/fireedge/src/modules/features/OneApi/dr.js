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
import { http } from '@UtilsModule'
import { oneApi } from '@modules/features/OneApi/oneApi'

const request = async ({ url, method = 'GET', data }) => {
  try {
    const response = await http.request({ url, method, data })

    return { data: response.data }
  } catch (axiosError) {
    const { response } = axiosError

    return {
      error: {
        status: response?.status,
        data: response?.data ?? { message: axiosError?.message },
      },
    }
  }
}

const drApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getDrCapabilities: builder.query({
      queryFn: () => request({ url: '/api/dr/capabilities' }),
    }),
    getRemoteSites: builder.query({
      queryFn: () => request({ url: '/api/dr/sites' }),
    }),
    createRemoteSite: builder.mutation({
      queryFn: (site) =>
        request({
          url: '/api/dr/sites',
          method: 'POST',
          data: { site },
        }),
    }),
    getSitePairs: builder.query({
      queryFn: () => request({ url: '/api/dr/site-pairs' }),
    }),
    createSitePair: builder.mutation({
      queryFn: (pair) =>
        request({
          url: '/api/dr/site-pairs',
          method: 'POST',
          data: { pair },
        }),
    }),
    getEnvironmentNetworks: builder.query({
      queryFn: (siteId) =>
        request({
          url: `/api/dr/environment-networks/${encodeURIComponent(siteId)}`,
        }),
    }),
    allocateEnvironmentNetworks: builder.mutation({
      queryFn: ({ siteId, allocation }) =>
        request({
          url: `/api/dr/environment-networks/${encodeURIComponent(
            siteId
          )}/allocate`,
          method: 'POST',
          data: { allocation },
        }),
    }),
    provisionEnvironmentNetworks: builder.mutation({
      queryFn: (siteId) =>
        request({
          url: `/api/dr/environment-networks/${encodeURIComponent(
            siteId
          )}/provision`,
          method: 'POST',
        }),
    }),
    getSiteVms: builder.query({
      queryFn: (siteId) =>
        request({
          url: `/api/dr/sites/${encodeURIComponent(siteId)}/vms`,
        }),
    }),
    getVmCheckpoints: builder.query({
      queryFn: ({ siteId, workloadId }) =>
        request({
          url: `/api/dr/sites/${encodeURIComponent(
            siteId
          )}/vms/${encodeURIComponent(workloadId)}/checkpoints`,
        }),
    }),
    getRecoveryMapping: builder.query({
      queryFn: ({ groupId, siteId }) =>
        request({
          url: `/api/dr/protection-domains/${encodeURIComponent(
            groupId
          )}/recovery-mappings/${encodeURIComponent(siteId)}`,
        }),
    }),
    putRecoveryMapping: builder.mutation({
      queryFn: ({ groupId, siteId, mapping }) =>
        request({
          url: `/api/dr/protection-domains/${encodeURIComponent(
            groupId
          )}/recovery-mappings/${encodeURIComponent(siteId)}`,
          method: 'PUT',
          data: { mapping },
        }),
    }),
    enableNdr: builder.mutation({
      queryFn: ({ groupId, config }) =>
        request({
          url: `/api/dr/protection-domains/${encodeURIComponent(
            groupId
          )}/enable-ndr`,
          method: 'POST',
          data: { config },
        }),
    }),
    getManagementBackups: builder.query({
      queryFn: (pairId) =>
        request({
          url: `/api/dr/site-pairs/${encodeURIComponent(
            pairId
          )}/management-backups`,
        }),
    }),
    runManagementBackup: builder.mutation({
      queryFn: (pairId) =>
        request({
          url: `/api/dr/site-pairs/${encodeURIComponent(
            pairId
          )}/management-backup`,
          method: 'POST',
        }),
    }),
    getProtectionDomains: builder.query({
      queryFn: () => request({ url: '/api/dr/protection-domains' }),
    }),
    createProtectionDomain: builder.mutation({
      queryFn: (domain) =>
        request({
          url: '/api/dr/protection-domains',
          method: 'POST',
          data: { domain },
        }),
    }),
    getProtectionDomainRecoveryPoints: builder.query({
      queryFn: (id) =>
        request({
          url: `/api/dr/protection-domains/${encodeURIComponent(
            id
          )}/recovery-points`,
        }),
    }),
    runProtectionCheckpoint: builder.mutation({
      queryFn: (id) =>
        request({
          url: `/api/dr/protection-domains/${encodeURIComponent(
            id
          )}/checkpoint`,
          method: 'POST',
        }),
    }),
  }),
})

const {
  useGetDrCapabilitiesQuery,
  useGetRemoteSitesQuery,
  useCreateRemoteSiteMutation,
  useGetSitePairsQuery,
  useCreateSitePairMutation,
  useGetEnvironmentNetworksQuery,
  useAllocateEnvironmentNetworksMutation,
  useProvisionEnvironmentNetworksMutation,
  useGetSiteVmsQuery,
  useGetVmCheckpointsQuery,
  useGetRecoveryMappingQuery,
  usePutRecoveryMappingMutation,
  useEnableNdrMutation,
  useGetManagementBackupsQuery,
  useRunManagementBackupMutation,
  useGetProtectionDomainsQuery,
  useCreateProtectionDomainMutation,
  useGetProtectionDomainRecoveryPointsQuery,
  useRunProtectionCheckpointMutation,
} = drApi

export default {
  useRunManagementBackupMutation,
  useGetManagementBackupsQuery,
  useEnableNdrMutation,
  usePutRecoveryMappingMutation,
  useGetRecoveryMappingQuery,
  useGetVmCheckpointsQuery,
  useGetSiteVmsQuery,
  useProvisionEnvironmentNetworksMutation,
  useAllocateEnvironmentNetworksMutation,
  useGetEnvironmentNetworksQuery,
  useCreateSitePairMutation,
  useGetSitePairsQuery,
  useGetDrCapabilitiesQuery,
  useGetRemoteSitesQuery,
  useCreateRemoteSiteMutation,
  useGetProtectionDomainsQuery,
  useCreateProtectionDomainMutation,
  useGetProtectionDomainRecoveryPointsQuery,
  useRunProtectionCheckpointMutation,
}
