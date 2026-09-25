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
import { Actions, Commands } from 'server/routes/api/auth/routes'

import { AuthSlice, logout } from '@modules/features/Auth/slice'
import {
  ONE_RESOURCES,
  ONE_RESOURCES_POOL,
} from '@modules/features/OneApi/resources'
import { PROFILE_LABELS } from '@modules/features/OneApi/labels'
import { oneApi } from '@modules/features/OneApi/oneApi'

import { encodeLabels, jsonToXml, parseLabels } from '@UtilsModule'
import { FILTER_POOL } from '@ConstantsModule'
const { actions: authActions } = AuthSlice

const { SYSTEM } = ONE_RESOURCES
const { GROUP_POOL, ...restOfPool } = ONE_RESOURCES_POOL
const {
  ALL_RESOURCES,
  PRIMARY_GROUP_RESOURCES,
  USER_RESOURCES,
  USER_GROUPS_RESOURCES,
} = FILTER_POOL
const SUNSTONE_VIEWS_TAG = { type: SYSTEM, id: 'sunstone-views' }
const toLabelTree = (labels) => {
  const parsedLabels = parseLabels(labels ?? {})
  const isLabelTree =
    parsedLabels &&
    typeof parsedLabels === 'object' &&
    !Array.isArray(parsedLabels)

  return isLabelTree ? parsedLabels : {}
}

const authApi = oneApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuthUser: builder.query({
      /**
       * @returns {object} Information about authenticated user
       * @throws Fails when response isn't code 200
       */
      query: () => ({ command: { path: '/user/info' } }),
      transformResponse: (response) => response?.USER,
      async onQueryStarted(_, { queryFulfilled, dispatch }) {
        try {
          const { data: user } = await queryFulfilled
          dispatch(authActions.changeAuthUser(user))
          dispatch(oneApi.util.invalidateTags([PROFILE_LABELS]))
        } catch {
        } finally {
          dispatch(authActions.setSessionVerified())
        }
      },
    }),
    login: builder.mutation({
      /**
       * Login in the interface.
       *
       * @param {object} params - User credentials
       * @param {string} params.user - Username
       * @param {string} params.token - Password
       * @param {boolean} [params.remember] - Remember session
       * @param {string} [params.tfatoken] - Token for Two factor authentication
       * @returns {object} Response data from request
       * @throws Fails when response isn't code 200
       */
      query: (params) => {
        const name = Actions.AUTHENTICATION
        const command = { name, ...Commands[name] }

        return { params, command, needState: true }
      },
      transformResponse: (response, meta) => {
        const { withGroupSwitcher } = meta?.state?.general ?? {}

        return {
          ...response,
          isLoginInProgress: withGroupSwitcher,
        }
      },
    }),
    logout: builder.mutation({
      /**
       * Logout from the interface.
       * Session token is automatically sent by axios, so no need to specify any auth params for logout.
       * This route requests to invalidate early the session cookie.
       *
       * @returns {object} Response data from request
       * @throws Fails when response isn't code 200
       */
      query: () => {
        const name = Actions.LOGOUT
        const command = { name, ...Commands[name] }

        return { command }
      },
      async onQueryStarted(_, { queryFulfilled, dispatch }) {
        try {
          await queryFulfilled
        } catch {
        } finally {
          dispatch(logout())
          dispatch(oneApi.util.resetApiState())
        }
      },
    }),
    stepUp: builder.mutation({
      query: ({ tfatoken }) => {
        const name = Actions.STEP_UP

        return {
          params: { tfatoken },
          command: { name, ...Commands[name] },
        }
      },
    }),
    changeAuthGroup: builder.mutation({
      /**
       * @param {object} params - Request parameters
       * @param {string} params.group - Group id
       * @returns {Promise} Response data from request
       * @throws Fails when response isn't code 200
       */
      queryFn: async ({ group } = {}, { getState, dispatch }) => {
        try {
          if (
            group === ALL_RESOURCES ||
            group === USER_GROUPS_RESOURCES ||
            group === USER_RESOURCES
          ) {
            dispatch(authActions.changeFilterPool(group))

            return { data: '' }
          }

          const authUser = getState().auth.user
          const queryData = { id: authUser.ID, group }

          const newGroup = await dispatch(
            oneApi.endpoints.changeGroup.initiate(queryData)
          ).unwrap()

          dispatch(authActions.changeFilterPool(PRIMARY_GROUP_RESOURCES))
          dispatch(authActions.changeAuthUser({ GID: `${group}` }))

          const viewsRequest = dispatch(
            oneApi.endpoints.getSunstoneViews.initiate(undefined, {
              forceRefetch: true,
            })
          )

          try {
            await viewsRequest.unwrap()
          } finally {
            viewsRequest.unsubscribe()
          }

          return { data: newGroup }
        } catch (error) {
          return { error }
        }
      },
      invalidatesTags: (_, __, { group } = {}) =>
        group === ALL_RESOURCES ||
        group === USER_GROUPS_RESOURCES ||
        group === USER_RESOURCES
          ? [...Object.values(restOfPool)]
          : [...Object.values(restOfPool), SUNSTONE_VIEWS_TAG],
    }),
    addLabel: builder.mutation({
      /**
       * @param {object} params - Request parameters
       * @param {string} params.newLabel - Label to add
       * @returns {Promise} Response data from request
       * @throws Fails when response isn't code 200
       */
      queryFn: async ({ newLabel } = {}, { getState, dispatch }) => {
        try {
          if (!newLabel) return { data: '' }

          const authUser = getState().auth.user
          const currentLabels = toLabelTree(
            authUser?.TEMPLATE?.FIREEDGE?.LABELS ?? authUser?.TEMPLATE?.LABELS
          )
          const labelKey = newLabel.startsWith('$') ? newLabel : `$${newLabel}`

          const exists = currentLabels?.[labelKey] !== undefined
          if (exists) return { data: newLabel }

          const template = jsonToXml({
            FIREEDGE: {
              LABELS: encodeLabels({ ...currentLabels, [labelKey]: {} }),
            },
          })
          const queryData = { id: authUser.ID, template, replace: 1 }

          await dispatch(
            oneApi.endpoints.updateUser.initiate(queryData)
          ).unwrap()

          return { data: newLabel }
        } catch (error) {
          return { error }
        }
      },
    }),
    removeLabel: builder.mutation({
      /**
       * @param {object} params - Request parameters
       * @param {string} params.label - Label to remove
       * @returns {Promise} Response data from request
       * @throws Fails when response isn't code 200
       */
      queryFn: async ({ label } = {}, { getState, dispatch }) => {
        try {
          if (!label) return { data: '' }

          const authUser = getState().auth.user
          const currentLabels = toLabelTree(
            authUser?.TEMPLATE?.FIREEDGE?.LABELS ?? authUser?.TEMPLATE?.LABELS
          )
          const labelKey = label.startsWith('$') ? label : `$${label}`

          const newLabels = Object.fromEntries(
            Object.entries(currentLabels).filter(
              ([key]) => ![label, labelKey].includes(key)
            )
          )
          const template = jsonToXml({
            FIREEDGE: { LABELS: encodeLabels(newLabels) },
          })
          const queryData = {
            id: authUser.ID,
            template,
            replace: 1,
          }

          await dispatch(
            oneApi.endpoints.updateUser.initiate(queryData)
          ).unwrap()

          return { data: label }
        } catch (error) {
          return { error }
        }
      },
    }),
  }),
})

const authQueries = (({
  // Queries
  useGetAuthUserQuery,
  useLazyGetAuthUserQuery,
  // Mutations
  useLoginMutation,
  useLogoutMutation,
  useStepUpMutation,
  useChangeAuthGroupMutation,
  useAddLabelMutation,
  useRemoveLabelMutation,
}) => ({
  // Queries
  useGetAuthUserQuery,
  useLazyGetAuthUserQuery,
  // Mutations
  useLoginMutation,
  useLogoutMutation,
  useStepUpMutation,
  useChangeAuthGroupMutation,
  useAddLabelMutation,
  useRemoveLabelMutation,
}))(authApi)

export default authQueries
