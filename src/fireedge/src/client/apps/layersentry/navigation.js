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
import {
  Archive,
  DashboardDots,
  Db,
  Group,
  HardDrive,
  HeadsetHelp,
  HistoricShield,
  NetworkAlt,
  Packages,
  Server,
  Settings,
  SettingsProfiles,
  User,
  XrayView,
} from 'iconoir-react'

export const PRODUCT_PATHS = Object.freeze({
  OVERVIEW: '/overview',
  COMPUTE: '/compute',
  COMPUTE_CREATE: '/compute/create',
  COMPUTE_AFFINITY: '/compute/affinity',
  COMPUTE_BLUEPRINTS: '/compute/blueprints',
  KUBERNETES: '/kubernetes',
  KUBERNETES_CREATE: '/kubernetes/create',
  APPLICATIONS: '/applications',
  APPLICATIONS_DEPLOY: '/applications/deploy',
  STORAGE: '/storage',
  STORAGE_FILES: '/storage/files',
  STORAGE_IMAGES: '/storage/images',
  NETWORK: '/network',
  NETWORK_TEMPLATES: '/network/templates',
  NETWORK_ROUTERS: '/network/routers',
  PROTECTION: '/protection',
  PROTECTION_BACKUP_PLANS: '/protection/backup-plans',
  PROTECTION_RECOVERY_POINTS: '/protection/recovery-points',
  PROTECTION_SITE_RECOVERY: '/protection/site-recovery',
  SECURITY: '/security',
  OPERATIONS: '/operations',
  SUPPORT: '/support',
  SETTINGS: '/settings',
  INFRASTRUCTURE: '/infrastructure',
  INFRA_HOSTS: '/infrastructure/hosts',
  INFRA_CLUSTERS: '/infrastructure/clusters',
  INFRA_STORAGE: '/infrastructure/storage',
  INFRA_BACKUP_STORAGE: '/infrastructure/backup-storage',
  INFRA_DRIVERS: '/infrastructure/drivers',
  INFRA_HOOKS: '/infrastructure/hooks',
  INFRA_ZONES: '/infrastructure/zones',
  INFRA_PROVIDERS: '/infrastructure/providers',
  ACCESS: '/access',
  ACCESS_USERS: '/access/users',
  ACCESS_TEAMS: '/access/teams',
  ACCESS_PROJECTS: '/access/projects',
  ACCESS_ROLES: '/access/roles',
  ACCESS_LIMITS: '/access/limits',
  ACCESS_RULES: '/access/rules',
  PLATFORM: '/platform',
  PLATFORM_IMAGES: '/platform/images',
  PLATFORM_TEMPLATES: '/platform/templates',
  PLATFORM_APPS: '/platform/applications',
  PLATFORM_SERVICE_TEMPLATES: '/platform/service-templates',
  PLATFORM_ROUTER_TEMPLATES: '/platform/router-templates',
  PLATFORM_MARKETPLACES: '/platform/marketplaces',
  PLATFORM_MARKETPLACE_APPS: '/platform/marketplace-apps',
  PLATFORM_MARKETPLACE_APPS_CREATE: '/platform/marketplace-apps/create',
})

const cloudWorkloads = [
  { label: 'Overview', path: PRODUCT_PATHS.OVERVIEW, icon: DashboardDots },
  { label: 'Compute', path: PRODUCT_PATHS.COMPUTE, icon: Server },
  {
    label: 'VM Blueprints',
    path: PRODUCT_PATHS.COMPUTE_BLUEPRINTS,
    icon: Packages,
  },
  {
    label: 'Affinity Groups',
    path: PRODUCT_PATHS.COMPUTE_AFFINITY,
    icon: Group,
  },
  { label: 'Kubernetes', path: PRODUCT_PATHS.KUBERNETES, icon: XrayView },
  { label: 'Applications', path: PRODUCT_PATHS.APPLICATIONS, icon: Packages },
  { label: 'Storage', path: PRODUCT_PATHS.STORAGE, icon: HardDrive },
  { label: 'Images', path: PRODUCT_PATHS.STORAGE_IMAGES, icon: Packages },
  { label: 'Files', path: PRODUCT_PATHS.STORAGE_FILES, icon: Archive },
]

const cloudNetwork = [
  { label: 'Networks', path: PRODUCT_PATHS.NETWORK, icon: NetworkAlt },
  {
    label: 'Network Blueprints',
    path: PRODUCT_PATHS.NETWORK_TEMPLATES,
    icon: NetworkAlt,
  },
  {
    label: 'Virtual Routers',
    path: PRODUCT_PATHS.NETWORK_ROUTERS,
    icon: NetworkAlt,
  },
  {
    label: 'Firewall Rules',
    path: PRODUCT_PATHS.SECURITY,
    icon: HistoricShield,
  },
]

const cloudProtection = [
  {
    label: 'Backup Plans',
    path: PRODUCT_PATHS.PROTECTION_BACKUP_PLANS,
    icon: Archive,
  },
  {
    label: 'Recovery Points',
    path: PRODUCT_PATHS.PROTECTION_RECOVERY_POINTS,
    icon: Archive,
  },
  {
    label: 'Site Recovery / DR',
    path: PRODUCT_PATHS.PROTECTION_SITE_RECOVERY,
    icon: HistoricShield,
  },
]

const cloudOperations = [
  {
    label: 'Operations',
    path: PRODUCT_PATHS.OPERATIONS,
    icon: SettingsProfiles,
  },
  { label: 'Support', path: PRODUCT_PATHS.SUPPORT, icon: HeadsetHelp },
  { label: 'Settings', path: PRODUCT_PATHS.SETTINGS, icon: Settings },
]

const adminGroups = [
  {
    label: 'Infrastructure',
    icon: Db,
    children: [
      { label: 'Compute Hosts', path: PRODUCT_PATHS.INFRA_HOSTS, icon: Server },
      {
        label: 'Compute Clusters',
        path: PRODUCT_PATHS.INFRA_CLUSTERS,
        icon: Group,
      },
      {
        label: 'Storage Pools',
        path: PRODUCT_PATHS.INFRA_STORAGE,
        icon: HardDrive,
      },
      {
        label: 'Backup Storage',
        path: PRODUCT_PATHS.INFRA_BACKUP_STORAGE,
        icon: Archive,
      },
      {
        label: 'Drivers',
        path: PRODUCT_PATHS.INFRA_DRIVERS,
        icon: SettingsProfiles,
      },
      {
        label: 'Automation Hooks',
        path: PRODUCT_PATHS.INFRA_HOOKS,
        icon: SettingsProfiles,
      },
      { label: 'Zones / Sites', path: PRODUCT_PATHS.INFRA_ZONES, icon: Db },
      {
        label: 'Providers',
        path: PRODUCT_PATHS.INFRA_PROVIDERS,
        icon: SettingsProfiles,
      },
    ],
  },
  {
    label: 'Access',
    icon: User,
    children: [
      { label: 'Users', path: PRODUCT_PATHS.ACCESS_USERS, icon: User },
      { label: 'Teams', path: PRODUCT_PATHS.ACCESS_TEAMS, icon: Group },
      { label: 'Projects', path: PRODUCT_PATHS.ACCESS_PROJECTS, icon: Db },
      {
        label: 'Roles',
        path: PRODUCT_PATHS.ACCESS_ROLES,
        icon: HistoricShield,
      },
      {
        label: 'Limits',
        path: PRODUCT_PATHS.ACCESS_LIMITS,
        icon: SettingsProfiles,
      },
      {
        label: 'Access Rules',
        path: PRODUCT_PATHS.ACCESS_RULES,
        icon: HistoricShield,
      },
    ],
  },
  {
    label: 'Platform',
    icon: Packages,
    children: [
      { label: 'Images', path: PRODUCT_PATHS.PLATFORM_IMAGES, icon: Packages },
      {
        label: 'Templates',
        path: PRODUCT_PATHS.PLATFORM_TEMPLATES,
        icon: Packages,
      },
      {
        label: 'Applications',
        path: PRODUCT_PATHS.PLATFORM_APPS,
        icon: Packages,
      },
      {
        label: 'Service Templates',
        path: PRODUCT_PATHS.PLATFORM_SERVICE_TEMPLATES,
        icon: Packages,
      },
      {
        label: 'Router Templates',
        path: PRODUCT_PATHS.PLATFORM_ROUTER_TEMPLATES,
        icon: NetworkAlt,
      },
      {
        label: 'Marketplaces',
        path: PRODUCT_PATHS.PLATFORM_MARKETPLACES,
        icon: Packages,
      },
      {
        label: 'Marketplace Apps',
        path: PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS,
        icon: Packages,
      },
    ],
  },
]

export const isPlatformAdminView = (view) => view === 'admin'

export const getNavigation = (view, capabilities = {}) => [
  {
    label: 'Cloud',
    items: [
      ...cloudWorkloads,
      ...(capabilities.marketplaceApps
        ? [
            {
              label: 'Appliance Catalog',
              path: PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS,
              icon: Packages,
            },
          ]
        : []),
    ],
  },
  { label: 'Network & Security', items: cloudNetwork },
  { label: 'Protection', items: cloudProtection },
  { label: 'Operations', items: cloudOperations },
  ...(isPlatformAdminView(view)
    ? adminGroups.map((group) => ({ ...group, items: group.children }))
    : []),
]
