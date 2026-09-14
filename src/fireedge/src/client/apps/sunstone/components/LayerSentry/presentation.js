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

// Presentation only. This preference is never an authorization decision.
export const APPEARANCE_KEY = 'layersentry.selfService.appearance.v1'
export const SCOPE_ATTRIBUTE = 'data-layersentry-self-service'
export const ENABLE_SELF_SERVICE_APPEARANCE = true

const LABELS = Object.freeze({
  '/dashboard': 'Overview',
  '/attention': 'Alerts & attention',
  '/vm': 'Virtual machines',
  '/vm-template': 'VM templates',
  '/image': 'Disk images',
  '/file': 'Files and installation media',
  '/virtual-network': 'Networks and addresses',
  '/network-template': 'Network templates',
  '/security-group': 'Traffic rules',
  '/service': 'VM applications',
  '/service-template': 'Application templates',
  '/vrouter': 'Virtual routers',
  '/vrouter-template': 'Router templates',
  '/backup': 'Backups',
  '/backupjobs': 'Backup jobs and schedules',
  '/vm-group': 'VM placement groups',
  '/marketplace-app': 'Application catalog',
  '/kubernetes': 'Kubernetes clusters',
  '/user': 'My account and usage',
  '/settings': 'My preferences',
  '/support': 'Help and support',
})

const SECTION_LABELS = Object.freeze({
  Instances: 'Compute',
  Templates: 'Catalog and templates',
  Storage: 'Storage and protection',
  Networks: 'Network and security',
  System: 'Account',
  Support: 'Help and support',
})

/**
 * Test the exact native cloud-view presentation boundary.
 *
 * @param {string} view - Current native view identifier
 * @param {boolean} isLogged - Whether an authenticated session exists
 * @param {boolean} disableLayout - Whether the current route disables layout
 * @returns {boolean} Whether LayerSentry presentation may be applied
 */
export const isSelfServiceView = (view, isLogged, disableLayout = false) =>
  isLogged === true && view === 'cloud' && disableLayout === false

/**
 * Copy display labels only after native endpoint filtering.
 *
 * @param {Array} endpoints - Native endpoint definitions
 * @param {boolean} enabled - Whether presentation labels are enabled
 * @returns {Array} Presented endpoints, or the original input when disabled
 */
export const presentEndpoints = (endpoints, enabled) => {
  if (!enabled) return endpoints
  if (!Array.isArray(endpoints)) return endpoints

  return endpoints.map((endpoint) => {
    if (!endpoint || typeof endpoint !== 'object') return endpoint
    const label = LABELS[endpoint.path] ?? SECTION_LABELS[endpoint.title]
    const cloudOnlyPresentation =
      endpoint.path === '/attention' ? { sidebar: true } : {}

    return {
      ...endpoint,
      ...cloudOnlyPresentation,
      ...(label ? { displayTitle: label } : {}),
      ...(Array.isArray(endpoint.routes)
        ? { routes: presentEndpoints(endpoint.routes, true) }
        : {}),
    }
  })
}

/**
 * Read the emergency appearance override from the URL.
 *
 * @param {string} search - URL search string
 * @returns {boolean} Whether classic presentation was explicitly requested
 */
export const classicRequested = (search = '') => {
  try {
    return new URLSearchParams(search).get('layersentry-ui') === 'classic'
  } catch {
    return false
  }
}

/**
 * Read the non-secret presentation preference without blocking app startup.
 *
 * @param {Storage} storage - Browser storage implementation
 * @returns {boolean} Whether LayerSentry presentation is enabled
 */
export const readAppearance = (storage) => {
  try {
    return storage?.getItem(APPEARANCE_KEY) !== 'classic'
  } catch {
    return true
  }
}

/**
 * Persist the non-secret presentation preference when storage is available.
 *
 * @param {Storage} storage - Browser storage implementation
 * @param {boolean} enabled - Whether LayerSentry presentation is enabled
 * @returns {boolean} Whether a storage object was available and written
 */
export const writeAppearance = (storage, enabled) => {
  try {
    storage?.setItem(APPEARANCE_KEY, enabled ? 'layersentry' : 'classic')

    return Boolean(storage)
  } catch {
    return false
  }
}

/**
 * Decorate the native document root with scoped presentation state.
 *
 * @param {HTMLElement} root - Native document root
 * @param {string} mode - Supported light or dark presentation mode
 * @returns {Function} Cleanup callback
 */
export const installScope = (root, mode) => {
  if (!root || !['light', 'dark'].includes(mode)) return () => {}

  const previous = root.getAttribute(SCOPE_ATTRIBUTE)
  root.setAttribute(SCOPE_ATTRIBUTE, mode)

  return () => {
    if (root.getAttribute(SCOPE_ATTRIBUTE) !== mode) return
    if (previous === null) root.removeAttribute(SCOPE_ATTRIBUTE)
    else root.setAttribute(SCOPE_ATTRIBUTE, previous)
  }
}
