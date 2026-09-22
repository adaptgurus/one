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
  useGetProtectionDomainsQuery,
  useCreateProtectionDomainMutation,
  useGetProtectionDomainRecoveryPointsQuery,
  useRunProtectionCheckpointMutation,
} = drApi

export default {
  useGetDrCapabilitiesQuery,
  useGetProtectionDomainsQuery,
  useCreateProtectionDomainMutation,
  useGetProtectionDomainRecoveryPointsQuery,
  useRunProtectionCheckpointMutation,
}
