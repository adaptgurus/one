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
import PropTypes from 'prop-types'
import { Redirect, Route, Switch } from 'react-router-dom'
import { useMemo } from 'react'
import { useViews } from '@FeaturesModule'
import PortalShell from 'client/apps/layersentry/components/PortalShell'
import ResourceBridge, {
  flattenEndpoints,
} from 'client/apps/layersentry/components/ResourceBridge'
import Overview from 'client/apps/layersentry/pages/Overview'
import AreaPage from 'client/apps/layersentry/pages/AreaPage'
import CreatePage from 'client/apps/layersentry/pages/CreatePage'
import SearchPage from 'client/apps/layersentry/pages/Search'
import SettingsPage from 'client/apps/layersentry/pages/Settings'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'

const area = (props) => <AreaPage {...props} />
const create = (props) => <CreatePage {...props} />

const LEGACY_REDIRECTS = Object.freeze({
  '/dashboard': PRODUCT_PATHS.OVERVIEW,
  '/vm': PRODUCT_PATHS.COMPUTE,
  '/vm/create': PRODUCT_PATHS.COMPUTE_CREATE,
  '/virtual-network': PRODUCT_PATHS.NETWORK,
  '/virtual-network/create': '/network/create',
  '/security-group': PRODUCT_PATHS.SECURITY,
  '/security-group/create': '/security/create',
  '/backupjobs': PRODUCT_PATHS.PROTECTION,
  '/backupjobs/create': '/protection/create',
  '/backup': PRODUCT_PATHS.PROTECTION,
  '/attention': PRODUCT_PATHS.OPERATIONS,
})

const Portal = ({ endpoints }) => {
  const { view } = useViews()
  const isAdmin = view === 'admin'
  const compatibilityEndpoints = useMemo(
    () =>
      flattenEndpoints(endpoints).filter(
        ({ path, disableLayout }) =>
          path && !disableLayout && !LEGACY_REDIRECTS[path]
      ),
    [endpoints]
  )
  const storageResources = isAdmin
    ? [
        { label: 'Storage Pools', legacyPath: '/datastore' },
        { label: 'Disk Images', legacyPath: '/image' },
      ]
    : [
        {
          label: 'Virtual machine disks',
          legacyPath: '/vm',
          unavailableLabel:
            'Open Compute to manage disks attached to your virtual machines.',
        },
      ]

  return (
    <PortalShell>
      <Switch>
        <Route exact path={PRODUCT_PATHS.OVERVIEW} component={Overview} />
        <Route exact path="/search" component={SearchPage} />

        <Route
          exact
          path={PRODUCT_PATHS.COMPUTE_CREATE}
          render={() =>
            create({
              endpoints,
              title: 'Create Virtual Machine',
              description:
                'A guided VM workflow using approved images, sizing, storage, networks and security.',
              legacyPath: '/vm/create',
              returnTo: PRODUCT_PATHS.COMPUTE,
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.COMPUTE}
          render={() =>
            area({
              endpoints,
              title: 'Compute',
              description:
                'Create and operate virtual machines without exposing provider internals.',
              resources: [{ label: 'Virtual Machines', legacyPath: '/vm' }],
              createTo: PRODUCT_PATHS.COMPUTE_CREATE,
              createLabel: 'Create VM',
            })
          }
        />

        <Route
          exact
          path={PRODUCT_PATHS.KUBERNETES_CREATE}
          render={() =>
            create({
              endpoints,
              title: 'Create Kubernetes Cluster',
              description:
                'Provision a managed cluster through the native OneKS lifecycle.',
              legacyPath: '/kubernetes/create',
              returnTo: PRODUCT_PATHS.KUBERNETES,
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.KUBERNETES}
          render={() =>
            area({
              endpoints,
              title: 'Kubernetes',
              description:
                'Create, scale, upgrade and recover managed Kubernetes clusters.',
              resources: [{ label: 'Clusters', legacyPath: '/kubernetes' }],
              createTo: PRODUCT_PATHS.KUBERNETES_CREATE,
              createLabel: 'Create Cluster',
            })
          }
        />

        <Route
          exact
          path="/network/create"
          render={() =>
            create({
              endpoints,
              title: 'Create Network',
              description:
                'Define an isolated private, public or routed network using customer-friendly settings.',
              legacyPath: '/virtual-network/create',
              returnTo: PRODUCT_PATHS.NETWORK,
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.NETWORK}
          render={() =>
            area({
              endpoints,
              title: 'Network',
              description:
                'Networks and address spaces available to this project.',
              resources: [
                { label: 'Networks', legacyPath: '/virtual-network' },
              ],
              createTo: '/network/create',
              createLabel: 'Create Network',
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.STORAGE}
          render={() =>
            area({
              endpoints,
              title: 'Storage',
              description: isAdmin
                ? 'Manage platform storage pools and disk images.'
                : 'Manage VM disks with safe detach, resize and reattach workflows.',
              resources: storageResources,
            })
          }
        />

        <Route
          exact
          path="/protection/create"
          render={() =>
            create({
              endpoints,
              title: 'Create Backup Plan',
              description:
                'Choose resources, schedule, retention and storage before enabling protection.',
              legacyPath: '/backupjobs/create',
              returnTo: PRODUCT_PATHS.PROTECTION,
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.PROTECTION}
          render={() =>
            area({
              endpoints,
              title: 'Protection',
              description:
                'Backups, snapshots and restore operations supported by the current backend.',
              resources: [
                { label: 'Backup Plans', legacyPath: '/backupjobs' },
                { label: 'Backups', legacyPath: '/backup' },
              ],
              createTo: '/protection/create',
              createLabel: 'Create Backup Plan',
            })
          }
        />

        <Route
          exact
          path="/security/create"
          render={() =>
            create({
              endpoints,
              title: 'Create Firewall Rules',
              description:
                'Create inbound and outbound rules using plain protocol, port and source settings.',
              legacyPath: '/security-group/create',
              returnTo: PRODUCT_PATHS.SECURITY,
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.SECURITY}
          render={() =>
            area({
              endpoints,
              title: 'Security',
              description:
                'Firewall rules and security controls for your workloads.',
              resources: [
                { label: 'Firewall Rules', legacyPath: '/security-group' },
              ],
              createTo: '/security/create',
              createLabel: 'Create Firewall Rules',
            })
          }
        />

        <Route
          exact
          path={PRODUCT_PATHS.OPERATIONS}
          render={() =>
            area({
              endpoints,
              title: 'Operations',
              description:
                'Health, alerts, events and tasks that need attention.',
              resources: [{ label: 'Attention', legacyPath: '/attention' }],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.SUPPORT}
          render={() =>
            area({
              endpoints,
              title: 'Support',
              description:
                'Get help and review support requests available to your account.',
              resources: [{ label: 'Support', legacyPath: '/support' }],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.SETTINGS}
          render={() => <SettingsPage endpoints={endpoints} />}
        />

        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_HOSTS}
            render={() =>
              area({
                endpoints,
                title: 'Compute Hosts',
                description: 'Physical compute host health and administration.',
                resources: [{ label: 'Hosts', legacyPath: '/host' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_CLUSTERS}
            render={() =>
              area({
                endpoints,
                title: 'Compute Clusters',
                description:
                  'Administrative compute placement and cluster management.',
                resources: [{ label: 'Clusters', legacyPath: '/cluster' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_STORAGE}
            render={() =>
              area({
                endpoints,
                title: 'Storage Pools',
                description:
                  'Administrative storage pools, capacity and backend health.',
                resources: [
                  { label: 'Storage Pools', legacyPath: '/datastore' },
                ],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_USERS}
            render={() =>
              area({
                endpoints,
                title: 'Users',
                description: 'User accounts, roles and project access.',
                resources: [{ label: 'Users', legacyPath: '/user' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_TEAMS}
            render={() =>
              area({
                endpoints,
                title: 'Teams',
                description: 'Teams and project membership.',
                resources: [{ label: 'Teams', legacyPath: '/group' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_IMAGES}
            render={() =>
              area({
                endpoints,
                title: 'Images',
                description: 'Approved operating-system and disk images.',
                resources: [{ label: 'Images', legacyPath: '/image' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_TEMPLATES}
            render={() =>
              area({
                endpoints,
                title: 'VM Blueprints',
                description:
                  'Reusable virtual machine templates and blueprints.',
                resources: [
                  { label: 'VM Blueprints', legacyPath: '/vm-template' },
                ],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_APPS}
            render={() =>
              area({
                endpoints,
                title: 'Applications',
                description:
                  'Published application and OneFlow service definitions.',
                resources: [{ label: 'Applications', legacyPath: '/service' }],
              })
            }
          />
        )}

        {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
          <Route
            key={from}
            exact
            path={from}
            render={() => <Redirect to={to} />}
          />
        ))}
        {compatibilityEndpoints.map((endpoint) => (
          <Route
            key={`legacy-${endpoint.path}`}
            exact
            path={endpoint.path}
            render={() => (
              <ResourceBridge
                endpoints={endpoints}
                legacyPath={endpoint.path}
              />
            )}
          />
        ))}

        <Redirect to={PRODUCT_PATHS.OVERVIEW} />
      </Switch>
    </PortalShell>
  )
}

Portal.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}

Portal.defaultProps = {
  endpoints: [],
}

export default Portal
