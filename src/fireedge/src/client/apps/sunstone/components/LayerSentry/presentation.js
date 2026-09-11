/* LayerSentry self-service presentation. SPDX-License-Identifier: Apache-2.0 */

// Presentation only. This preference is never an authorization decision.
export const APPEARANCE_KEY = 'layersentry.selfService.appearance.v1'
export const SCOPE_ATTRIBUTE = 'data-layersentry-self-service'
export const ENABLE_SELF_SERVICE_APPEARANCE = true

const LABELS = Object.freeze({
  '/dashboard': 'Overview',
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

/** Pure, fail-closed view boundary. Never broaden this to role-name matching. */
export const isSelfServiceView = (view, isLogged, disableLayout = false) =>
  isLogged === true && view === 'cloud' && disableLayout === false

/** Copy display labels only AFTER native endpoint filtering. */
export const presentEndpoints = (endpoints, enabled) => {
  if (!enabled) return endpoints
  if (!Array.isArray(endpoints)) return endpoints

  return endpoints.map((endpoint) => {
    if (!endpoint || typeof endpoint !== 'object') return endpoint
    const label = LABELS[endpoint.path] ?? SECTION_LABELS[endpoint.title]

    return {
      ...endpoint,
      ...(label ? { displayTitle: label } : {}),
      ...(Array.isArray(endpoint.routes)
        ? { routes: presentEndpoints(endpoint.routes, true) }
        : {}),
    }
  })
}

/** A URL override can disable appearance, never grant access or enable a view. */
export const classicRequested = (search = '') => {
  try {
    return new URLSearchParams(search).get('layersentry-ui') === 'classic'
  } catch {
    return false
  }
}

/** Blocked/private-mode storage must not prevent the native app from loading. */
export const readAppearance = (storage) => {
  try {
    return storage?.getItem(APPEARANCE_KEY) !== 'classic'
  } catch {
    return true
  }
}

export const writeAppearance = (storage, enabled) => {
  try {
    storage?.setItem(APPEARANCE_KEY, enabled ? 'layersentry' : 'classic')
    return Boolean(storage)
  } catch {
    return false
  }
}

/** Scoped DOM decoration with cleanup for sign-out, view changes and consoles. */
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
