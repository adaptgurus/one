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
import { SERVER_CONFIG } from '@ConstantsModule'

export const CAPABILITY_IDS = Object.freeze({
  COMPUTE: 'COMPUTE',
  VM_CREATE: 'VM_CREATE',
  VM_RESIZE: 'VM_RESIZE',
  VM_UPDATE_CONFIG: 'VM_UPDATE_CONFIG',
  BLUEPRINTS: 'BLUEPRINTS',
  AFFINITY: 'AFFINITY',
  AFFINITY_CREATE: 'AFFINITY_CREATE',
  KUBERNETES: 'KUBERNETES',
  KUBERNETES_CREATE: 'KUBERNETES_CREATE',
  APPLICATIONS_ONEFLOW: 'APPLICATIONS_ONEFLOW',
  APPLICATIONS_DEPLOY: 'APPLICATIONS_DEPLOY',
  APPLICATIONS_ONEFLOW_CREATE: 'APPLICATIONS_ONEFLOW_CREATE',
  STORAGE: 'STORAGE',
  STORAGE_IMAGES: 'STORAGE_IMAGES',
  STORAGE_FILES: 'STORAGE_FILES',
  STORAGE_ONBOARDING: 'STORAGE_ONBOARDING',
  STORAGE_DISK_ATTACH: 'STORAGE_DISK_ATTACH',
  STORAGE_DISK_RESIZE: 'STORAGE_DISK_RESIZE',
  STORAGE_DISK_DETACH: 'STORAGE_DISK_DETACH',
  STORAGE_IMAGE_DELETE: 'STORAGE_IMAGE_DELETE',
  NETWORK: 'NETWORK',
  NETWORK_CREATE: 'NETWORK_CREATE',
  NETWORK_TEMPLATES: 'NETWORK_TEMPLATES',
  VIRTUAL_ROUTERS: 'VIRTUAL_ROUTERS',
  FIREWALL_RULES: 'FIREWALL_RULES',
  FIREWALL_RULES_CREATE: 'FIREWALL_RULES_CREATE',
  BACKUP_RECOVERY: 'BACKUP_RECOVERY',
  BACKUP_RECOVERY_CREATE: 'BACKUP_RECOVERY_CREATE',
  SITE_RECOVERY_DR: 'SITE_RECOVERY_DR',
  OPERATIONS: 'OPERATIONS',
  BACKUP_STORAGE: 'BACKUP_STORAGE',
  BACKUP_STORAGE_CREATE: 'BACKUP_STORAGE_CREATE',
  INFRA_HOSTS: 'INFRA_HOSTS',
  INFRA_HOSTS_CREATE: 'INFRA_HOSTS_CREATE',
  INFRA_CLUSTERS: 'INFRA_CLUSTERS',
  INFRA_CLUSTERS_CREATE: 'INFRA_CLUSTERS_CREATE',
  INFRA_STORAGE: 'INFRA_STORAGE',
  INFRA_DRIVERS: 'INFRA_DRIVERS',
  INFRA_ZONES: 'INFRA_ZONES',
  PROVIDERS_ONEFORM: 'PROVIDERS_ONEFORM',
  PROVIDERS_ONEFORM_CREATE: 'PROVIDERS_ONEFORM_CREATE',
  ACCESS_USERS: 'ACCESS_USERS',
  ACCESS_USERS_CREATE: 'ACCESS_USERS_CREATE',
  ACCESS_TEAMS: 'ACCESS_TEAMS',
  ACCESS_TEAMS_CREATE: 'ACCESS_TEAMS_CREATE',
  ACCESS_PROJECTS: 'ACCESS_PROJECTS',
  ACCESS_PROJECTS_CREATE: 'ACCESS_PROJECTS_CREATE',
  ACCESS_ROLES: 'ACCESS_ROLES',
  ACCESS_LIMITS: 'ACCESS_LIMITS',
  ACCESS_RULES: 'ACCESS_RULES',
  ACCESS_RULES_CREATE: 'ACCESS_RULES_CREATE',
  PLATFORM_IMAGES: 'PLATFORM_IMAGES',
  PLATFORM_IMAGES_CREATE: 'PLATFORM_IMAGES_CREATE',
  PLATFORM_TEMPLATES: 'PLATFORM_TEMPLATES',
  PLATFORM_TEMPLATES_CREATE: 'PLATFORM_TEMPLATES_CREATE',
  PLATFORM_ROUTER_TEMPLATES: 'PLATFORM_ROUTER_TEMPLATES',
  MARKETPLACES: 'MARKETPLACES',
  MARKETPLACE_APPS: 'MARKETPLACE_APPS',
  MARKETPLACE_APPS_CREATE: 'MARKETPLACE_APPS_CREATE',
  SUPPORT_TICKETING: 'SUPPORT_TICKETING',
})

export const CAPABILITY_VISIBILITY = Object.freeze({
  VISIBLE_ENABLED: 'VISIBLE_ENABLED',
  VISIBLE_READ_ONLY: 'VISIBLE_READ_ONLY',
  VISIBLE_DISABLED: 'VISIBLE_DISABLED',
  HIDDEN_NOT_INSTALLED: 'HIDDEN_NOT_INSTALLED',
  HIDDEN_NOT_CONFIGURED: 'HIDDEN_NOT_CONFIGURED',
  HIDDEN_NOT_AUTHORIZED: 'HIDDEN_NOT_AUTHORIZED',
  HIDDEN_NOT_QUALIFIED: 'HIDDEN_NOT_QUALIFIED',
  HIDDEN_INCOMPATIBLE: 'HIDDEN_INCOMPATIBLE',
  ENGINEERING_ONLY: 'ENGINEERING_ONLY',
})

const DATA_SAFETY_REQUIRED = new Set([
  CAPABILITY_IDS.BACKUP_RECOVERY,
  CAPABILITY_IDS.BACKUP_RECOVERY_CREATE,
  CAPABILITY_IDS.SITE_RECOVERY_DR,
  CAPABILITY_IDS.BACKUP_STORAGE,
  CAPABILITY_IDS.BACKUP_STORAGE_CREATE,
  CAPABILITY_IDS.STORAGE_ONBOARDING,
  CAPABILITY_IDS.STORAGE_DISK_ATTACH,
  CAPABILITY_IDS.STORAGE_DISK_RESIZE,
  CAPABILITY_IDS.STORAGE_DISK_DETACH,
  CAPABILITY_IDS.STORAGE_IMAGE_DELETE,
])

const READ_ONLY_SAFE = new Set([
  CAPABILITY_IDS.COMPUTE,
  CAPABILITY_IDS.BLUEPRINTS,
  CAPABILITY_IDS.AFFINITY,
  CAPABILITY_IDS.STORAGE,
  CAPABILITY_IDS.NETWORK,
  CAPABILITY_IDS.BACKUP_RECOVERY,
  CAPABILITY_IDS.APPLICATIONS_ONEFLOW,
  CAPABILITY_IDS.INFRA_HOSTS,
  CAPABILITY_IDS.INFRA_CLUSTERS,
  CAPABILITY_IDS.INFRA_STORAGE,
  CAPABILITY_IDS.INFRA_DRIVERS,
  CAPABILITY_IDS.INFRA_ZONES,
  CAPABILITY_IDS.PROVIDERS_ONEFORM,
  CAPABILITY_IDS.ACCESS_USERS,
  CAPABILITY_IDS.ACCESS_TEAMS,
  CAPABILITY_IDS.ACCESS_PROJECTS,
  CAPABILITY_IDS.ACCESS_ROLES,
  CAPABILITY_IDS.ACCESS_LIMITS,
  CAPABILITY_IDS.ACCESS_RULES,
  CAPABILITY_IDS.PLATFORM_IMAGES,
  CAPABILITY_IDS.PLATFORM_TEMPLATES,
  CAPABILITY_IDS.PLATFORM_ROUTER_TEMPLATES,
  CAPABILITY_IDS.MARKETPLACES,
  CAPABILITY_IDS.MARKETPLACE_APPS,
])

const SOURCE_UNIMPLEMENTED = new Set([CAPABILITY_IDS.SITE_RECOVERY_DR])

const MUTATING_CAPABILITIES = new Set([
  CAPABILITY_IDS.VM_CREATE,
  CAPABILITY_IDS.VM_RESIZE,
  CAPABILITY_IDS.VM_UPDATE_CONFIG,
  CAPABILITY_IDS.AFFINITY_CREATE,
  CAPABILITY_IDS.KUBERNETES_CREATE,
  CAPABILITY_IDS.APPLICATIONS_DEPLOY,
  CAPABILITY_IDS.APPLICATIONS_ONEFLOW_CREATE,
  CAPABILITY_IDS.STORAGE_ONBOARDING,
  CAPABILITY_IDS.STORAGE_DISK_ATTACH,
  CAPABILITY_IDS.STORAGE_DISK_RESIZE,
  CAPABILITY_IDS.STORAGE_DISK_DETACH,
  CAPABILITY_IDS.STORAGE_IMAGE_DELETE,
  CAPABILITY_IDS.NETWORK_CREATE,
  CAPABILITY_IDS.FIREWALL_RULES_CREATE,
  CAPABILITY_IDS.BACKUP_RECOVERY_CREATE,
  CAPABILITY_IDS.BACKUP_STORAGE_CREATE,
  CAPABILITY_IDS.INFRA_HOSTS_CREATE,
  CAPABILITY_IDS.INFRA_CLUSTERS_CREATE,
  CAPABILITY_IDS.PROVIDERS_ONEFORM_CREATE,
  CAPABILITY_IDS.ACCESS_USERS_CREATE,
  CAPABILITY_IDS.ACCESS_TEAMS_CREATE,
  CAPABILITY_IDS.ACCESS_PROJECTS_CREATE,
  CAPABILITY_IDS.ACCESS_RULES_CREATE,
  CAPABILITY_IDS.PLATFORM_IMAGES_CREATE,
  CAPABILITY_IDS.PLATFORM_TEMPLATES_CREATE,
  CAPABILITY_IDS.MARKETPLACE_APPS_CREATE,
  CAPABILITY_IDS.SUPPORT_TICKETING,
])

const CAPABILITY_PATHS = Object.freeze([
  ['/compute/create', CAPABILITY_IDS.VM_CREATE],
  ['/compute/blueprints', CAPABILITY_IDS.BLUEPRINTS],
  ['/compute/affinity', CAPABILITY_IDS.AFFINITY],
  ['/compute', CAPABILITY_IDS.COMPUTE],
  ['/kubernetes/create', CAPABILITY_IDS.KUBERNETES_CREATE],
  ['/kubernetes', CAPABILITY_IDS.KUBERNETES],
  ['/applications/deploy', CAPABILITY_IDS.APPLICATIONS_DEPLOY],
  ['/applications', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/storage/images', CAPABILITY_IDS.STORAGE_IMAGES],
  ['/storage/files', CAPABILITY_IDS.STORAGE_FILES],
  ['/storage', CAPABILITY_IDS.STORAGE],
  ['/network/create', CAPABILITY_IDS.NETWORK_CREATE],
  ['/network/templates', CAPABILITY_IDS.NETWORK_TEMPLATES],
  ['/network/routers', CAPABILITY_IDS.VIRTUAL_ROUTERS],
  ['/network', CAPABILITY_IDS.NETWORK],
  ['/security/create', CAPABILITY_IDS.FIREWALL_RULES_CREATE],
  ['/security', CAPABILITY_IDS.FIREWALL_RULES],
  ['/protection/site-recovery', CAPABILITY_IDS.SITE_RECOVERY_DR],
  ['/protection/recovery-points', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/protection/backup-plans', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/protection/create', CAPABILITY_IDS.BACKUP_RECOVERY_CREATE],
  ['/protection', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/operations', CAPABILITY_IDS.OPERATIONS],
  ['/infrastructure/hosts/create', CAPABILITY_IDS.INFRA_HOSTS_CREATE],
  ['/infrastructure/hosts', CAPABILITY_IDS.INFRA_HOSTS],
  ['/infrastructure/clusters/create', CAPABILITY_IDS.INFRA_CLUSTERS_CREATE],
  ['/infrastructure/clusters', CAPABILITY_IDS.INFRA_CLUSTERS],
  ['/infrastructure/storage/create', CAPABILITY_IDS.STORAGE_ONBOARDING],
  ['/infrastructure/storage', CAPABILITY_IDS.INFRA_STORAGE],
  [
    '/infrastructure/backup-storage/create',
    CAPABILITY_IDS.BACKUP_STORAGE_CREATE,
  ],
  ['/infrastructure/backup-storage', CAPABILITY_IDS.BACKUP_STORAGE],
  ['/infrastructure/drivers', CAPABILITY_IDS.INFRA_DRIVERS],
  ['/infrastructure/zones', CAPABILITY_IDS.INFRA_ZONES],
  ['/infrastructure/providers/create', CAPABILITY_IDS.PROVIDERS_ONEFORM_CREATE],
  ['/infrastructure/providers', CAPABILITY_IDS.PROVIDERS_ONEFORM],
  ['/access/users/create', CAPABILITY_IDS.ACCESS_USERS_CREATE],
  ['/access/users', CAPABILITY_IDS.ACCESS_USERS],
  ['/access/teams/create', CAPABILITY_IDS.ACCESS_TEAMS_CREATE],
  ['/access/teams', CAPABILITY_IDS.ACCESS_TEAMS],
  ['/access/projects/create', CAPABILITY_IDS.ACCESS_PROJECTS_CREATE],
  ['/access/projects', CAPABILITY_IDS.ACCESS_PROJECTS],
  ['/access/roles', CAPABILITY_IDS.ACCESS_ROLES],
  ['/access/limits', CAPABILITY_IDS.ACCESS_LIMITS],
  ['/access/rules/create', CAPABILITY_IDS.ACCESS_RULES_CREATE],
  ['/access/rules', CAPABILITY_IDS.ACCESS_RULES],
  ['/platform/images/create', CAPABILITY_IDS.PLATFORM_IMAGES_CREATE],
  ['/platform/images', CAPABILITY_IDS.PLATFORM_IMAGES],
  ['/platform/templates/create', CAPABILITY_IDS.PLATFORM_TEMPLATES_CREATE],
  ['/platform/templates', CAPABILITY_IDS.PLATFORM_TEMPLATES],
  ['/platform/applications/create', CAPABILITY_IDS.APPLICATIONS_ONEFLOW_CREATE],
  ['/platform/applications', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/platform/service-templates', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/platform/router-templates', CAPABILITY_IDS.PLATFORM_ROUTER_TEMPLATES],
  ['/platform/marketplaces', CAPABILITY_IDS.MARKETPLACES],
  ['/platform/marketplace-apps/create', CAPABILITY_IDS.MARKETPLACE_APPS_CREATE],
  ['/platform/marketplace-apps', CAPABILITY_IDS.MARKETPLACE_APPS],
  ['/support/create', CAPABILITY_IDS.SUPPORT_TICKETING],
  ['/vm/create', CAPABILITY_IDS.VM_CREATE],
  ['/vm-template/instantiate', CAPABILITY_IDS.VM_CREATE],
  ['/vm-template', CAPABILITY_IDS.BLUEPRINTS],
  ['/vm-group/create', CAPABILITY_IDS.AFFINITY_CREATE],
  ['/vm-group', CAPABILITY_IDS.AFFINITY],
  ['/vm', CAPABILITY_IDS.COMPUTE],
  ['/image', CAPABILITY_IDS.STORAGE_IMAGES],
  ['/file', CAPABILITY_IDS.STORAGE_FILES],
  ['/virtual-network/create', CAPABILITY_IDS.NETWORK_CREATE],
  ['/virtual-network', CAPABILITY_IDS.NETWORK],
  ['/network-template', CAPABILITY_IDS.NETWORK_TEMPLATES],
  ['/vrouter', CAPABILITY_IDS.VIRTUAL_ROUTERS],
  ['/security-group/create', CAPABILITY_IDS.FIREWALL_RULES_CREATE],
  ['/security-group', CAPABILITY_IDS.FIREWALL_RULES],
  ['/backupjobs/create', CAPABILITY_IDS.BACKUP_RECOVERY_CREATE],
  ['/backupjobs', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/backup', CAPABILITY_IDS.BACKUP_RECOVERY],
  ['/service-template/instantiate', CAPABILITY_IDS.APPLICATIONS_DEPLOY],
  ['/service-template', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/service', CAPABILITY_IDS.APPLICATIONS_ONEFLOW],
  ['/attention', CAPABILITY_IDS.OPERATIONS],
])

const ALWAYS_AVAILABLE_PATHS = new Set([
  '/',
  '/overview',
  '/dashboard',
  '/search',
  '/support',
  '/settings',
  '/dbaas',
  '/apaas',
  '/applications',
  '/applications/deploy',
])

const hidden = (visibility, reason) => ({
  visibility,
  enabled: false,
  reason,
})

const CAPABILITY_ENDPOINT_REQUIREMENTS = Object.freeze({
  [CAPABILITY_IDS.COMPUTE]: ['/vm'],
  [CAPABILITY_IDS.VM_CREATE]: ['/vm/create', '/vm-template/instantiate'],
  [CAPABILITY_IDS.VM_RESIZE]: ['/vm'],
  [CAPABILITY_IDS.VM_UPDATE_CONFIG]: ['/vm'],
  [CAPABILITY_IDS.BLUEPRINTS]: ['/vm-template'],
  [CAPABILITY_IDS.AFFINITY]: ['/vm-group'],
  [CAPABILITY_IDS.AFFINITY_CREATE]: ['/vm-group/create'],
  [CAPABILITY_IDS.KUBERNETES]: ['/kubernetes'],
  [CAPABILITY_IDS.KUBERNETES_CREATE]: ['/kubernetes/create'],
  [CAPABILITY_IDS.APPLICATIONS_ONEFLOW]: ['/service', '/service-template'],
  [CAPABILITY_IDS.APPLICATIONS_DEPLOY]: ['/service-template/instantiate'],
  [CAPABILITY_IDS.APPLICATIONS_ONEFLOW_CREATE]: ['/service-template/create'],
  [CAPABILITY_IDS.STORAGE]: ['/vm', '/image'],
  [CAPABILITY_IDS.STORAGE_IMAGES]: ['/image'],
  [CAPABILITY_IDS.STORAGE_FILES]: ['/file'],
  [CAPABILITY_IDS.STORAGE_DISK_ATTACH]: ['/vm', '/image'],
  [CAPABILITY_IDS.STORAGE_DISK_RESIZE]: ['/vm'],
  [CAPABILITY_IDS.STORAGE_DISK_DETACH]: ['/vm'],
  [CAPABILITY_IDS.STORAGE_IMAGE_DELETE]: ['/image'],
  [CAPABILITY_IDS.NETWORK]: ['/virtual-network'],
  [CAPABILITY_IDS.NETWORK_CREATE]: ['/virtual-network/create'],
  [CAPABILITY_IDS.NETWORK_TEMPLATES]: ['/network-template'],
  [CAPABILITY_IDS.VIRTUAL_ROUTERS]: ['/vrouter'],
  [CAPABILITY_IDS.FIREWALL_RULES]: ['/security-group'],
  [CAPABILITY_IDS.FIREWALL_RULES_CREATE]: ['/security-group/create'],
  [CAPABILITY_IDS.BACKUP_RECOVERY]: ['/backupjobs', '/backup'],
  [CAPABILITY_IDS.BACKUP_RECOVERY_CREATE]: ['/backupjobs/create'],
  [CAPABILITY_IDS.OPERATIONS]: ['/attention'],
  [CAPABILITY_IDS.INFRA_HOSTS]: ['/host'],
  [CAPABILITY_IDS.INFRA_HOSTS_CREATE]: ['/host/create'],
  [CAPABILITY_IDS.INFRA_CLUSTERS]: ['/cluster'],
  [CAPABILITY_IDS.INFRA_CLUSTERS_CREATE]: ['/cluster/create'],
  [CAPABILITY_IDS.INFRA_STORAGE]: ['/datastore'],
  [CAPABILITY_IDS.STORAGE_ONBOARDING]: ['/datastore/create'],
  [CAPABILITY_IDS.INFRA_DRIVERS]: ['/driver'],
  [CAPABILITY_IDS.BACKUP_STORAGE]: ['/datastore'],
  [CAPABILITY_IDS.BACKUP_STORAGE_CREATE]: ['/datastore/create'],
  [CAPABILITY_IDS.INFRA_ZONES]: ['/zone'],
  [CAPABILITY_IDS.PROVIDERS_ONEFORM]: ['/provider'],
  [CAPABILITY_IDS.PROVIDERS_ONEFORM_CREATE]: ['/provider/create'],
  [CAPABILITY_IDS.ACCESS_USERS]: ['/user'],
  [CAPABILITY_IDS.ACCESS_USERS_CREATE]: ['/user/create'],
  [CAPABILITY_IDS.ACCESS_TEAMS]: ['/group'],
  [CAPABILITY_IDS.ACCESS_TEAMS_CREATE]: ['/group/create'],
  [CAPABILITY_IDS.ACCESS_PROJECTS]: ['/virtual-data-center'],
  [CAPABILITY_IDS.ACCESS_PROJECTS_CREATE]: ['/virtual-data-center/create'],
  [CAPABILITY_IDS.ACCESS_ROLES]: ['/group'],
  [CAPABILITY_IDS.ACCESS_LIMITS]: ['/user', '/group'],
  [CAPABILITY_IDS.ACCESS_RULES]: ['/acl'],
  [CAPABILITY_IDS.ACCESS_RULES_CREATE]: ['/acl/create'],
  [CAPABILITY_IDS.PLATFORM_IMAGES]: ['/image'],
  [CAPABILITY_IDS.PLATFORM_IMAGES_CREATE]: ['/image/create'],
  [CAPABILITY_IDS.PLATFORM_TEMPLATES]: ['/vm-template'],
  [CAPABILITY_IDS.PLATFORM_TEMPLATES_CREATE]: ['/vm-template/create'],
  [CAPABILITY_IDS.PLATFORM_ROUTER_TEMPLATES]: ['/vrouter-template'],
  [CAPABILITY_IDS.MARKETPLACES]: ['/marketplace'],
  [CAPABILITY_IDS.MARKETPLACE_APPS]: ['/marketplace-app'],
  [CAPABILITY_IDS.MARKETPLACE_APPS_CREATE]: ['/marketplace-app/create'],
  [CAPABILITY_IDS.SUPPORT_TICKETING]: ['/support'],
})

const normalizeEndpointPath = (value = '') => {
  const normalized = `/${String(value).replace(/^\/+|\/+$/g, '')}`

  return normalized === '/' ? normalized : normalized.replace(/\/+$/g, '')
}

const flattenEndpointPaths = (endpoints = []) => {
  const paths = new Set()
  const visit = (endpoint) => {
    if (endpoint?.path) paths.add(normalizeEndpointPath(endpoint.path))
    endpoint?.routes?.forEach(visit)
  }
  endpoints.forEach(visit)

  return paths
}

const applyEndpointAuthorization = (model = {}, endpoints) => {
  if (!Array.isArray(endpoints)) return model

  const endpointPaths = flattenEndpointPaths(endpoints)

  return Object.fromEntries(
    Object.entries(model).map(([capabilityId, capability]) => {
      const required = CAPABILITY_ENDPOINT_REQUIREMENTS[capabilityId]
      if (!required) return [capabilityId, capability]

      const endpointAuthorized = required.every((path) =>
        endpointPaths.has(normalizeEndpointPath(path))
      )

      return [
        capabilityId,
        {
          ...capability,
          authorization:
            capability?.authorization === true && endpointAuthorized,
        },
      ]
    })
  )
}

export const getCapabilityModel = (endpoints) =>
  applyEndpointAuthorization(
    SERVER_CONFIG?.layersentry_capabilities ??
      SERVER_CONFIG?.layersentryCapabilities ??
      {},
    endpoints
  )

export const getCapabilityState = (capabilityId, model = {}) => {
  const capability = model?.[capabilityId]

  if (SOURCE_UNIMPLEMENTED.has(capabilityId)) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'The production execution path for this capability is not implemented.'
    )
  }

  if (!capability || capability.enabled !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'This capability is not enabled and qualified for this LayerSentry deployment.'
    )
  }

  if (capability.implementation !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'The production implementation is not qualified.'
    )
  }
  if (capability.backend !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_INSTALLED,
      'The required backend service or appliance is not installed.'
    )
  }
  if (capability.configuration !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_CONFIGURED,
      'The required site configuration is not complete.'
    )
  }
  if (capability.health !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'The required backend service is not healthy.'
    )
  }
  if (capability.authorization !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_AUTHORIZED,
      'The current account is not authorized for this capability.'
    )
  }
  if (capability.compatibility !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_INCOMPATIBLE,
      'The current environment is not compatible with this capability.'
    )
  }
  if (capability.qualification !== true) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'Production qualification is incomplete.'
    )
  }
  if (
    DATA_SAFETY_REQUIRED.has(capabilityId) &&
    capability.dataSafety !== true
  ) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'Required data-safety qualification is incomplete.'
    )
  }

  if (capability.readOnly === true && !READ_ONLY_SAFE.has(capabilityId)) {
    return hidden(
      CAPABILITY_VISIBILITY.HIDDEN_NOT_QUALIFIED,
      'A mutation-safe read-only presentation has not been qualified for this capability.'
    )
  }

  return {
    visibility:
      capability.readOnly === true
        ? CAPABILITY_VISIBILITY.VISIBLE_READ_ONLY
        : CAPABILITY_VISIBILITY.VISIBLE_ENABLED,
    enabled: true,
    reason: capability.reason,
  }
}

export const isCapabilityVisible = (capabilityId, model = {}) => {
  const { visibility } = getCapabilityState(capabilityId, model)

  return (
    visibility === CAPABILITY_VISIBILITY.VISIBLE_ENABLED ||
    visibility === CAPABILITY_VISIBILITY.VISIBLE_READ_ONLY
  )
}

export const isCapabilityEnabled = (capabilityId, model = {}) =>
  getCapabilityState(capabilityId, model).visibility ===
  CAPABILITY_VISIBILITY.VISIBLE_ENABLED

export const getCapabilityForPath = (pathname = '') =>
  CAPABILITY_PATHS.find(([path]) => pathname === path)?.[1]

export const isCapabilityPathAvailable = (pathname = '', model = {}) => {
  if (ALWAYS_AVAILABLE_PATHS.has(pathname)) return true

  const capabilityId = getCapabilityForPath(pathname)
  if (!capabilityId) return false

  return MUTATING_CAPABILITIES.has(capabilityId)
    ? isCapabilityEnabled(capabilityId, model)
    : isCapabilityVisible(capabilityId, model)
}
