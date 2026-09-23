/* SPDX-License-Identifier: Apache-2.0 */
import {
  Archive,
  DashboardDots,
  Db,
  HardDrive,
  NetworkAlt,
  Packages,
  Server,
} from 'iconoir-react'

export const getNavigation = () => [
  {
    label: 'Workloads',
    items: [
      { label: 'Overview', path: '/overview', icon: DashboardDots },
      { label: 'Compute', path: '/compute', icon: Server },
      { label: 'DBaaS', path: '/dbaas', icon: Db },
      { label: 'APaaS', path: '/apaas', icon: Packages },
      { label: 'Storage', path: '/storage', icon: HardDrive },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Networks', path: '/network', icon: NetworkAlt },
      { label: 'Firewall Rules', path: '/security', icon: NetworkAlt },
    ],
  },
  {
    label: 'Protection',
    items: [
      { label: 'Backup Plans', path: '/protection/backup-plans', icon: Archive },
      {
        label: 'Recovery Points',
        path: '/protection/recovery-points',
        icon: Archive,
      },
    ],
  },
]
