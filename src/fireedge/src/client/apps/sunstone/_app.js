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
import AuthLayout from 'client/apps/sunstone/components/AuthLayout'
import ModalHost from 'client/apps/sunstone/components/ModalHost'
import Notifier, {
  NotifierUpload,
} from 'client/apps/sunstone/components/Notifier'
import LayerSentryPortal from 'client/apps/layersentry'
import { isDevelopment, processTabManifest } from '@UtilsModule'
import { Sidebar } from '@ComponentsModule'
import { ENDPOINTS, getEndpointsByView } from 'client/apps/sunstone/routes'
import Router from 'client/router'
import { ENDPOINTS as DEV_ENDPOINTS } from 'client/router/dev'
import { ReactElement, useEffect, useMemo } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { _APPS, SERVER_CONFIG } from '@ConstantsModule'
import {
  oneApi,
  SupportAPI,
  SystemAPI,
  useAuth,
  useGeneralApi,
  useViews,
} from '@FeaturesModule'

export const APP_NAME = _APPS.sunstone

const showSupportTab = (routes = [], find = true) => {
  if (find === true) return routes

  const supportTab = routes.findIndex((route) => route?.path === '/support')
  if (supportTab >= 0) routes.splice(supportTab, 1)

  return routes
}

const isDisabledLayoutRoute = (pathname, routes = []) => {
  const matchDisabledRoute = ({ path, disableLayout } = {}) =>
    disableLayout && path && matchPath(pathname, { path, exact: true })

  return routes.some(({ routes: subRoutes, ...route }) =>
    Array.isArray(subRoutes)
      ? subRoutes.some((subRoute) =>
          matchDisabledRoute({
            ...subRoute,
            disableLayout: subRoute.disableLayout ?? route.disableLayout,
          })
        )
      : matchDisabledRoute(route)
  )
}

const nativeSunstoneRequested = (search = '') => {
  try {
    return new URLSearchParams(search).get('native') === '1'
  } catch {
    return false
  }
}

/**
 * FireEdge application shell.
 * LayerSentry is the default authenticated product experience.
 *
 * @returns {ReactElement} App rendered.
 */
const SunstoneApp = () => {
  const [getSupport, { isSuccess: isSupportSuccess }] =
    SupportAPI.useLazyCheckOfficialSupportQuery()
  const { pathname, search } = useLocation()
  const { changeAppTitle } = useGeneralApi()
  const { isLogged, externalRedirect } = useAuth()
  const { views, view } = useViews()

  const {
    data: tabManifest = {},
    isSuccess: isManifestLoaded,
    isLoading: isManifestLoading,
  } = SystemAPI.useGetTabManifestQuery()

  useEffect(() => {
    changeAppTitle(APP_NAME)
  }, [])

  useEffect(() => {
    if (view && SERVER_CONFIG?.token_remote_support) getSupport()
  }, [view, getSupport])

  const endpoints = useMemo(() => {
    const fixedEndpoints = [
      ...ENDPOINTS,
      ...(isDevelopment() ? DEV_ENDPOINTS : []),
    ]

    if (!view) return fixedEndpoints

    const viewEndpoints = getEndpointsByView(
      views?.[view],
      processTabManifest(tabManifest)
    )

    return showSupportTab(
      fixedEndpoints.concat(viewEndpoints),
      isSupportSuccess
    )
  }, [
    tabManifest,
    view,
    views,
    isSupportSuccess,
    isManifestLoaded,
    isManifestLoading,
  ])

  const isLayoutDisabled = useMemo(
    () => isDisabledLayoutRoute(pathname, endpoints),
    [endpoints, pathname]
  )

  const allowNativeSunstone = view === 'admin'
  const useNativeSunstone =
    allowNativeSunstone && nativeSunstoneRequested(search) && !isLayoutDisabled
  const useLayerSentryPortal =
    isLogged && !isLayoutDisabled && !useNativeSunstone
  const redirectWhenAuth = externalRedirect || '/overview'

  return (
    <AuthLayout
      subscriptions={[
        oneApi.endpoints.getOneConfig,
        oneApi.endpoints.getSunstoneViews,
      ]}
    >
      {' '}
      {isLogged && (
        <>
          {useLayerSentryPortal ? (
            <LayerSentryPortal endpoints={endpoints} />
          ) : (
            <>
              {!isLayoutDisabled && <Sidebar endpoints={endpoints} />}
              <Router
                redirectWhenAuth={redirectWhenAuth}
                endpoints={endpoints}
              />
            </>
          )}
          <Notifier />
          <NotifierUpload />
          <ModalHost />
        </>
      )}
      {!isLogged && (
        <Router redirectWhenAuth={redirectWhenAuth} endpoints={endpoints} />
      )}
    </AuthLayout>
  )
}

SunstoneApp.displayName = '_SunstoneApp'

export default SunstoneApp
