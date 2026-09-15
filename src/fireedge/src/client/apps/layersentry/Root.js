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
/* eslint-disable jsdoc/require-param, jsdoc/require-param-description, jsdoc/require-param-type */
import '@mui/material'
import 'core-js'
import PropTypes from 'prop-types'
import { JSXElementConstructor } from 'react'
import { Provider as ReduxProvider } from 'react-redux'
import { BrowserRouter, StaticRouter } from 'react-router-dom'
import { Providers } from '@StylesModule'
import { TranslationProvider } from '@ProvidersModule'
import { buildTranslationLocale } from '@UtilsModule'
import { SnackbarProvider } from '@ComponentsModule'
import App, { APP_NAME } from 'client/apps/layersentry/AppRoot'
import { APP_URL } from '@ConstantsModule'

buildTranslationLocale()

/**
 * @param root0
 * @param root0.store
 * @param root0.location
 * @returns {JSXElementConstructor} LayerSentry root providers.
 */
const LayerSentry = ({ store = {}, location = '' }) => (
  <Providers.PreloadConfigProvider>
    <ReduxProvider store={store}>
      <Providers.MuiThemeProvider>
        <TranslationProvider>
          <SnackbarProvider>
            {location ? (
              <StaticRouter location={location}>
                <App />
              </StaticRouter>
            ) : (
              <BrowserRouter basename={`${APP_URL}/${APP_NAME}`}>
                <App />
              </BrowserRouter>
            )}
          </SnackbarProvider>
        </TranslationProvider>
      </Providers.MuiThemeProvider>
    </ReduxProvider>
  </Providers.PreloadConfigProvider>
)

LayerSentry.propTypes = {
  location: PropTypes.string,
  store: PropTypes.object,
}
LayerSentry.displayName = 'LayerSentryRoot'
export default LayerSentry
