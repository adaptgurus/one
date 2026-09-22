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
import {
  CAPABILITY_IDS,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'

export const PRODUCT_PATHS = Object.freeze({
  OVERVIEW: '/overview',
  COMPUTE: '/compute',
  COMPUTE_CREATE: '/compute/create',
  COMPUTE_AFFINITY: '/compute/affinity',
  COMPUTE_BLUEPRINTS: '/compute/blueprints',
  KUBERNETES: '/kubernetes',
  KUBERNETES_CREATE: '/kubernetes/create',
  DBAAS: '/dbaas',
  APAAS: '/apaas',
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
  {
    label: 'Overview',
    path: PRODUCT_PATHS.OVERVIEW,
    icon: DashboardDots,
    always: true,
  },
  {
    label: 'Compute',
    path: PRODUCT_PATHS.COMPUTE,
    icon: Server,
    capability: CAPABILITY_IDS.COMPUTE,
  },
  {
    label: 'Affinity Groups',
    path: PRODUCT_PATHS.COMPUTE_AFFINITY,
    icon: Group,
    capability: CAPABILITY_IDS.AFFINITY,
  },
  {
    label: 'Kubernetes',
    path: PRODUCT_PATHS.KUBERNETES,
    icon: XrayView,
    capability: CAPABILITY_IDS.KUBERNETES,
  },
  {
    label: 'DBaaS',
    path: PRODUCT_PATHS.DBAAS,
    icon: Db,
    always: true,
  },
  {
    label: 'APaaS',
    path: PRODUCT_PATHS.APAAS,
    icon: Packages,
    always: true,
  },
  {
    label: 'Storage',
    path: PRODUCT_PATHS.STORAGE,
    icon: HardDrive,
    capability: CAPABILITY_IDS.STORAGE,
  },
  {
    label: 'Images',
    path: PRODUCT_PATHS.STORAGE_IMAGES,
    icon: Packages,
    capability: CAPABILITY_IDS.STORAGE_IMAGES,
  },
  {
    label: 'Files',
    path: PRODUCT_PATHS.STORAGE_FILES,
    icon: Archive,
    capability: CAPABILITY_IDS.STORAGE_FILES,
  },
]

const cloudNetwork = [
  {
    label: 'Networks',
    path: PRODUCT_PATHS.NETWORK,
    icon: NetworkAlt,
    capability: CAPABILITY_IDS.NETWORK,
  },
  {
    label: 'Network Blueprints',
    path: PRODUCT_PATHS.NETWORK_TEMPLATES,
    icon: NetworkAlt,
    capability: CAPABILITY_IDS.NETWORK_TEMPLATES,
  },
  {
    label: 'Virtual Routers',
    path: PRODUCT_PATHS.NETWORK_ROUTERS,
    icon: NetworkAlt,
    capability: CAPABILITY_IDS.VIRTUAL_ROUTERS,
  },
  {
    label: 'Firewall Rules',
    path: PRODUCT_PATHS.SECURITY,
    icon: HistoricShield,
    capability: CAPABILITY_IDS.FIREWALL_RULES,
  },
]

const cloudProtection = [
  {
    label: 'Backup Plans',
    path: PRODUCT_PATHS.PROTECTION_BACKUP_PLANS,
    icon: Archive,
    capability: CAPABILITY_IDS.BACKUP_RECOVERY,
  },
  {
    label: 'Recovery Points',
    path: PRODUCT_PATHS.PROTECTION_RECOVERY_POINTS,
    icon: Archive,
    capability: CAPABILITY_IDS.BACKUP_RECOVERY,
  },
  {
    label: 'Site Recovery / DR',
    path: PRODUCT_PATHS.PROTECTION_SITE_RECOVERY,
    icon: HistoricShield,
    capability: CAPABILITY_IDS.SITE_RECOVERY_DR,
  },
]

const cloudOperations = [
  {
    label: 'Operations',
    path: PRODUCT_PATHS.OPERATIONS,
    icon: SettingsProfiles,
    capability: CAPABILITY_IDS.OPERATIONS,
  },
  {
    label: 'Support',
    path: PRODUCT_PATHS.SUPPORT,
    icon: HeadsetHelp,
    always: true,
  },
  {
    label: 'Settings',
    path: PRODUCT_PATHS.SETTINGS,
    icon: Settings,
    always: true,
  },
]

const adminGroups = [
  {
    label: 'Infrastructure',
    icon: Db,
    children: [
      {
        label: 'Compute Hosts',
        path: PRODUCT_PATHS.INFRA_HOSTS,
        icon: Server,
        capability: CAPABILITY_IDS.INFRA_HOSTS,
      },
      {
        label: 'Compute Clusters',
        path: PRODUCT_PATHS.INFRA_CLUSTERS,
        icon: Group,
        capability: CAPABILITY_IDS.INFRA_CLUSTERS,
      },
      {
        label: 'Storage Pools',
        path: PRODUCT_PATHS.INFRA_STORAGE,
        icon: HardDrive,
        capability: CAPABILITY_IDS.INFRA_STORAGE,
      },
      {
        label: 'Backup Storage',
        path: PRODUCT_PATHS.INFRA_BACKUP_STORAGE,
        icon: Archive,
        capability: CAPABILITY_IDS.BACKUP_STORAGE,
      },
      {
        label: 'Drivers',
        path: PRODUCT_PATHS.INFRA_DRIVERS,
        icon: SettingsProfiles,
        capability: CAPABILITY_IDS.INFRA_DRIVERS,
      },
      {
        label: 'Zones / Sites',
        path: PRODUCT_PATHS.INFRA_ZONES,
        icon: Db,
        capability: CAPABILITY_IDS.INFRA_ZONES,
      },
      {
        label: 'Providers',
        path: PRODUCT_PATHS.INFRA_PROVIDERS,
        icon: SettingsProfiles,
        capability: CAPABILITY_IDS.PROVIDERS_ONEFORM,
      },
    ],
  },
  {
    label: 'Access',
    icon: User,
    children: [
      {
        label: 'Users',
        path: PRODUCT_PATHS.ACCESS_USERS,
        icon: User,
        capability: CAPABILITY_IDS.ACCESS_USERS,
      },
      {
        label: 'Teams',
        path: PRODUCT_PATHS.ACCESS_TEAMS,
        icon: Group,
        capability: CAPABILITY_IDS.ACCESS_TEAMS,
      },
      {
        label: 'Projects',
        path: PRODUCT_PATHS.ACCESS_PROJECTS,
        icon: Db,
        capability: CAPABILITY_IDS.ACCESS_PROJECTS,
      },
      {
        label: 'Roles',
        path: PRODUCT_PATHS.ACCESS_ROLES,
        icon: HistoricShield,
        capability: CAPABILITY_IDS.ACCESS_ROLES,
      },
      {
        label: 'Limits',
        path: PRODUCT_PATHS.ACCESS_LIMITS,
        icon: SettingsProfiles,
        capability: CAPABILITY_IDS.ACCESS_LIMITS,
      },
      {
        label: 'Access Rules',
        path: PRODUCT_PATHS.ACCESS_RULES,
        icon: HistoricShield,
        capability: CAPABILITY_IDS.ACCESS_RULES,
      },
    ],
  },
  {
    label: 'Platform',
    icon: Packages,
    children: [
      {
        label: 'Images',
        path: PRODUCT_PATHS.PLATFORM_IMAGES,
        icon: Packages,
        capability: CAPABILITY_IDS.PLATFORM_IMAGES,
      },
      {
        label: 'Templates',
        path: PRODUCT_PATHS.PLATFORM_TEMPLATES,
        icon: Packages,
        capability: CAPABILITY_IDS.PLATFORM_TEMPLATES,
      },
      {
        label: 'Applications',
        path: PRODUCT_PATHS.PLATFORM_APPS,
        icon: Packages,
        capability: CAPABILITY_IDS.APPLICATIONS_ONEFLOW,
      },
      {
        label: 'Service Templates',
        path: PRODUCT_PATHS.PLATFORM_SERVICE_TEMPLATES,
        icon: Packages,
        capability: CAPABILITY_IDS.APPLICATIONS_ONEFLOW,
      },
      {
        label: 'Router Templates',
        path: PRODUCT_PATHS.PLATFORM_ROUTER_TEMPLATES,
        icon: NetworkAlt,
        capability: CAPABILITY_IDS.PLATFORM_ROUTER_TEMPLATES,
      },
      {
        label: 'Marketplaces',
        path: PRODUCT_PATHS.PLATFORM_MARKETPLACES,
        icon: Packages,
        capability: CAPABILITY_IDS.MARKETPLACES,
      },
      {
        label: 'Marketplace Apps',
        path: PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS,
        icon: Packages,
        capability: CAPABILITY_IDS.MARKETPLACE_APPS,
      },
    ],
  },
]

export const isPlatformAdminView = (view) => view === 'admin'

const filterByCapability = (items, capabilityModel) =>
  items.filter(
    ({ always, capability }) =>
      always === true ||
      (Boolean(capability) && isCapabilityVisible(capability, capabilityModel))
  )

export const getNavigation = (view, capabilityModel = {}) => {
  const sections = [
    { label: 'Cloud', items: cloudWorkloads },
    { label: 'Network & Security', items: cloudNetwork },
    { label: 'Protection', items: cloudProtection },
    { label: 'Operations', items: cloudOperations },
  ]

  if (isPlatformAdminView(view)) {
    sections.push(
      ...adminGroups.map((group) => ({
        ...group,
        items: filterByCapability(group.children, capabilityModel),
      }))
    )
  }

  return sections
    .map((section) => ({
      ...section,
      items: filterByCapability(section.items, capabilityModel),
    }))
    .filter(({ items }) => items.length > 0)
}
