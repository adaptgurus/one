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
import StorageWorkspace from 'client/apps/layersentry/pages/StorageWorkspace'
import NetworkWorkspace from 'client/apps/layersentry/pages/NetworkWorkspace'
import KubernetesWorkspace from 'client/apps/layersentry/pages/KubernetesWorkspace'
import OperationsWorkspace from 'client/apps/layersentry/pages/OperationsWorkspace'
import ProtectionWorkspace from 'client/apps/layersentry/pages/ProtectionWorkspace'
import ComputeWorkspace from 'client/apps/layersentry/pages/ComputeWorkspace'
import ApplicationsWorkspace from 'client/apps/layersentry/pages/ApplicationsWorkspace'
import SiteRecoveryWorkspace from 'client/apps/layersentry/pages/SiteRecoveryWorkspace'
import BackupStorageWorkspace from 'client/apps/layersentry/pages/BackupStorageWorkspace'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'

const area = (props) => <AreaPage {...props} />
const create = (props) => <CreatePage {...props} />

const LEGACY_REDIRECTS = Object.freeze({
  '/dashboard': PRODUCT_PATHS.OVERVIEW,
  '/vm': PRODUCT_PATHS.COMPUTE,
  '/vm/create': PRODUCT_PATHS.COMPUTE_CREATE,
  '/vm-template': PRODUCT_PATHS.COMPUTE_BLUEPRINTS,
  '/vm-group': PRODUCT_PATHS.COMPUTE_AFFINITY,
  '/image': PRODUCT_PATHS.STORAGE_IMAGES,
  '/file': PRODUCT_PATHS.STORAGE_FILES,
  '/virtual-network': PRODUCT_PATHS.NETWORK,
  '/virtual-network/create': '/network/create',
  '/network-template': PRODUCT_PATHS.NETWORK_TEMPLATES,
  '/vrouter': PRODUCT_PATHS.NETWORK_ROUTERS,
  '/security-group': PRODUCT_PATHS.SECURITY,
  '/security-group/create': '/security/create',
  '/backupjobs': PRODUCT_PATHS.PROTECTION_BACKUP_PLANS,
  '/backupjobs/create': '/protection/create',
  '/backup': PRODUCT_PATHS.PROTECTION_RECOVERY_POINTS,
  '/service': PRODUCT_PATHS.APPLICATIONS,
  '/service-template': PRODUCT_PATHS.APPLICATIONS,
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

  return (
    <PortalShell endpoints={endpoints}>
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
              steps: [
                'Basics',
                'Operating System',
                'Size',
                'Storage',
                'Network',
                'Security',
                'Review',
              ],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.COMPUTE}
          render={() => <ComputeWorkspace endpoints={endpoints} />}
        />
        <Route
          exact
          path={PRODUCT_PATHS.COMPUTE_AFFINITY}
          render={() =>
            area({
              endpoints,
              title: 'Affinity Groups',
              description:
                'Group virtual machines with backend-enforced placement affinity and anti-affinity rules.',
              resources: [{ label: 'VM Groups', legacyPath: '/vm-group' }],
              createTo: '/vm-group/create',
              createLabel: 'Create Affinity Group',
            })
          }
        />

        <Route
          exact
          path={PRODUCT_PATHS.COMPUTE_BLUEPRINTS}
          render={() =>
            area({
              endpoints,
              title: 'VM Blueprints',
              description:
                'Browse approved virtual-machine blueprints and instantiate them through the backend-authorized workflow.',
              resources: [
                { label: 'VM Blueprints', legacyPath: '/vm-template' },
              ],
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
              steps: [
                'Basics',
                'Version',
                'Control Plane',
                'Workers',
                'Network',
                'Storage & Add-ons',
                'Review',
              ],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.KUBERNETES}
          render={() => <KubernetesWorkspace endpoints={endpoints} />}
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
              steps: ['Type', 'Address', 'Isolation', 'Security', 'Review'],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.NETWORK}
          render={() => <NetworkWorkspace endpoints={endpoints} />}
        />
        <Route
          exact
          path={PRODUCT_PATHS.NETWORK_TEMPLATES}
          render={() =>
            area({
              endpoints,
              title: 'Network Blueprints',
              description:
                'Reusable OpenNebula network templates for repeatable private-cloud network creation.',
              resources: [
                {
                  label: 'Network Blueprints',
                  legacyPath: '/network-template',
                },
              ],
              createTo: isAdmin ? '/network-template/create' : undefined,
              createLabel: 'Create Network Blueprint',
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.NETWORK_ROUTERS}
          render={() =>
            area({
              endpoints,
              title: 'Virtual Routers',
              description:
                'Operate OpenNebula Virtual Routers for routed networks and highly available endpoint patterns.',
              resources: [{ label: 'Virtual Routers', legacyPath: '/vrouter' }],
              createTo: '/vrouter/instantiate',
              createLabel: 'Deploy Virtual Router',
            })
          }
        />

        <Route
          exact
          path={PRODUCT_PATHS.APPLICATIONS_DEPLOY}
          render={() =>
            create({
              endpoints,
              title: 'Deploy Application',
              description:
                'Choose a published application definition and provide only the deployment inputs exposed by that definition.',
              legacyPath: '/service-template/instantiate/',
              returnTo: PRODUCT_PATHS.APPLICATIONS,
              steps: [
                'Application',
                'Inputs',
                'Resources',
                'Network',
                'Review',
              ],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.APPLICATIONS}
          render={() => <ApplicationsWorkspace endpoints={endpoints} />}
        />

        <Route
          exact
          path={PRODUCT_PATHS.STORAGE}
          render={() => <StorageWorkspace endpoints={endpoints} />}
        />
        <Route
          exact
          path={PRODUCT_PATHS.STORAGE_IMAGES}
          render={() =>
            area({
              endpoints,
              title: 'Images',
              description:
                'Customer-visible OS and disk images with provider ownership and raw attributes hidden by the active OpenNebula view.',
              resources: [{ label: 'Images', legacyPath: '/image' }],
              createTo: '/image/create',
              createLabel: 'Create Image',
            })
          }
        />

        <Route
          exact
          path={PRODUCT_PATHS.STORAGE_FILES}
          render={() =>
            area({
              endpoints,
              title: 'Files',
              description:
                'Context files, kernels and other OpenNebula file-datastore objects available to this role.',
              resources: [{ label: 'Files', legacyPath: '/file' }],
              createTo: '/file/create',
              createLabel: 'Upload File',
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
              returnTo: PRODUCT_PATHS.PROTECTION_BACKUP_PLANS,
              steps: [
                'Resources',
                'Schedule',
                'Retention',
                'Storage',
                'Review',
              ],
            })
          }
        />
        <Route
          exact
          path={PRODUCT_PATHS.PROTECTION}
          render={() => <ProtectionWorkspace endpoints={endpoints} />}
        />
        <Route
          exact
          path={PRODUCT_PATHS.PROTECTION_BACKUP_PLANS}
          render={() => (
            <ProtectionWorkspace endpoints={endpoints} initialTab={0} />
          )}
        />
        <Route
          exact
          path={PRODUCT_PATHS.PROTECTION_RECOVERY_POINTS}
          render={() => (
            <ProtectionWorkspace endpoints={endpoints} initialTab={1} />
          )}
        />
        <Route
          exact
          path={PRODUCT_PATHS.PROTECTION_SITE_RECOVERY}
          component={SiteRecoveryWorkspace}
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
              steps: [
                'Direction',
                'Protocol & Port',
                'Source',
                'Policy',
                'Review',
              ],
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
          render={() => <OperationsWorkspace endpoints={endpoints} />}
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
              createTo: '/support/create',
              createLabel: 'Create Ticket',
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
            path="/infrastructure/hosts/create"
            render={() =>
              create({
                endpoints,
                title: 'Add Compute Host',
                description:
                  'Register a compute host using the native OpenNebula host lifecycle.',
                legacyPath: '/host/create',
                returnTo: PRODUCT_PATHS.INFRA_HOSTS,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/infrastructure/clusters/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Compute Cluster',
                description:
                  'Create an administrative compute placement group.',
                legacyPath: '/cluster/create',
                returnTo: PRODUCT_PATHS.INFRA_CLUSTERS,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/infrastructure/storage/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Storage',
                description:
                  'Create NFS, local, LVM, iSCSI multipath or qualified storage using the native datastore lifecycle.',
                legacyPath: '/datastore/create',
                returnTo: PRODUCT_PATHS.INFRA_STORAGE,
                steps: [
                  'Type',
                  'Hosts',
                  'Configuration',
                  'Validation',
                  'Review',
                ],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/infrastructure/backup-storage/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Backup Storage',
                description:
                  'Create an OpenNebula Backup Datastore using a qualified Restic, Rsync or custom backup backend.',
                legacyPath: '/datastore/create',
                returnTo: PRODUCT_PATHS.INFRA_BACKUP_STORAGE,
                steps: ['Type', 'Backend', 'Capacity', 'Validation', 'Review'],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/infrastructure/providers/create"
            render={() =>
              create({
                endpoints,
                title: 'Add Provider',
                description:
                  'Register an infrastructure provider through the supported FireEdge workflow.',
                legacyPath: '/provider/create',
                returnTo: PRODUCT_PATHS.INFRA_PROVIDERS,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/access/users/create"
            render={() =>
              create({
                endpoints,
                title: 'Add User',
                description:
                  'Create a user and assign backend-enforced project access.',
                legacyPath: '/user/create',
                returnTo: PRODUCT_PATHS.ACCESS_USERS,
                steps: [
                  'Details',
                  'Role',
                  'Project / Team',
                  'Limits',
                  'Review',
                ],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/access/teams/create"
            render={() =>
              create({
                endpoints,
                title: 'Add Team',
                description:
                  'Create an OpenNebula group used as a LayerSentry team or role boundary.',
                legacyPath: '/group/create',
                returnTo: PRODUCT_PATHS.ACCESS_TEAMS,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/access/projects/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Project',
                description:
                  'Create a virtual data center project and its resource boundaries.',
                legacyPath: '/virtual-data-center/create',
                returnTo: PRODUCT_PATHS.ACCESS_PROJECTS,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/access/rules/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Access Rule',
                description:
                  'Advanced access control for administrators. Backend ACL enforcement remains authoritative.',
                legacyPath: '/acl/create',
                returnTo: PRODUCT_PATHS.ACCESS_RULES,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/platform/images/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Image',
                description:
                  'Publish an approved operating-system or disk image.',
                legacyPath: '/image/create',
                returnTo: PRODUCT_PATHS.PLATFORM_IMAGES,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/platform/templates/create"
            render={() =>
              create({
                endpoints,
                title: 'Create VM Blueprint',
                description: 'Create a reusable virtual-machine blueprint.',
                legacyPath: '/vm-template/create',
                returnTo: PRODUCT_PATHS.PLATFORM_TEMPLATES,
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path="/platform/applications/create"
            render={() =>
              create({
                endpoints,
                title: 'Create Application Definition',
                description:
                  'Create a reusable OneFlow application definition.',
                legacyPath: '/service-template/create',
                returnTo: PRODUCT_PATHS.PLATFORM_APPS,
              })
            }
          />
        )}

        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS_CREATE}
            render={() =>
              create({
                endpoints,
                title: 'Create Marketplace App',
                description:
                  'Publish a Marketplace App through the native OpenNebula administrator workflow.',
                legacyPath: '/marketplace-app/create',
                returnTo: PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS,
              })
            }
          />
        )}

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
                createTo: '/infrastructure/hosts/create',
                createLabel: 'Add Host',
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
                createTo: '/infrastructure/clusters/create',
                createLabel: 'Create Cluster',
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
                createTo: '/infrastructure/storage/create',
                createLabel: 'Create Storage',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_BACKUP_STORAGE}
            component={BackupStorageWorkspace}
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_DRIVERS}
            render={() =>
              area({
                endpoints,
                title: 'Drivers',
                description:
                  'Installed OpenNebula infrastructure drivers and integration status.',
                resources: [{ label: 'Drivers', legacyPath: '/driver' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_ZONES}
            render={() =>
              area({
                endpoints,
                title: 'Zones / Sites',
                description:
                  'Administrative sites and zones available to this private cloud.',
                resources: [{ label: 'Zones / Sites', legacyPath: '/zone' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.INFRA_PROVIDERS}
            render={() =>
              area({
                endpoints,
                title: 'Providers',
                description:
                  'Provider integrations and infrastructure connection status.',
                resources: [{ label: 'Providers', legacyPath: '/provider' }],
                createTo: '/infrastructure/providers/create',
                createLabel: 'Add Provider',
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
                createTo: '/access/users/create',
                createLabel: 'Add User',
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
                createTo: '/access/teams/create',
                createLabel: 'Add Team',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_PROJECTS}
            render={() =>
              area({
                endpoints,
                title: 'Projects',
                description:
                  'Virtual data centers and project resource boundaries.',
                resources: [
                  { label: 'Projects', legacyPath: '/virtual-data-center' },
                ],
                createTo: '/access/projects/create',
                createLabel: 'Create Project',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_ROLES}
            render={() =>
              area({
                endpoints,
                title: 'Roles',
                description:
                  'Role membership is mapped to OpenNebula groups and enforced by backend permissions.',
                resources: [{ label: 'Roles / Groups', legacyPath: '/group' }],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_LIMITS}
            render={() =>
              area({
                endpoints,
                title: 'Limits',
                description:
                  'Review user and team resource limits without exposing raw ACL syntax.',
                resources: [
                  { label: 'User Limits', legacyPath: '/user' },
                  { label: 'Team Limits', legacyPath: '/group' },
                ],
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.ACCESS_RULES}
            render={() =>
              area({
                endpoints,
                title: 'Access Rules',
                description:
                  'Advanced access rules. Use this only for administrator-level policy changes.',
                resources: [{ label: 'Access Rules', legacyPath: '/acl' }],
                createTo: '/access/rules/create',
                createLabel: 'Create Access Rule',
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
                createTo: '/platform/images/create',
                createLabel: 'Create Image',
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
                createTo: '/platform/templates/create',
                createLabel: 'Create Blueprint',
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
                createTo: '/platform/applications/create',
                createLabel: 'Create Application Definition',
              })
            }
          />
        )}

        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_SERVICE_TEMPLATES}
            render={() =>
              area({
                endpoints,
                title: 'Service Templates',
                description:
                  'Reusable OneFlow service definitions used by the Applications catalog.',
                resources: [
                  {
                    label: 'Service Templates',
                    legacyPath: '/service-template',
                  },
                ],
                createTo: '/platform/applications/create',
                createLabel: 'Create Service Template',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_ROUTER_TEMPLATES}
            render={() =>
              area({
                endpoints,
                title: 'Router Templates',
                description: 'Reusable OpenNebula Virtual Router definitions.',
                resources: [
                  {
                    label: 'Router Templates',
                    legacyPath: '/vrouter-template',
                  },
                ],
                createTo: '/vrouter-template/create',
                createLabel: 'Create Router Template',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_MARKETPLACES}
            render={() =>
              area({
                endpoints,
                title: 'Marketplaces',
                description:
                  'Administrative OpenNebula public and private Marketplace connections.',
                resources: [
                  { label: 'Marketplaces', legacyPath: '/marketplace' },
                ],
                createTo: '/marketplace/create',
                createLabel: 'Create Marketplace',
              })
            }
          />
        )}
        {isAdmin && (
          <Route
            exact
            path={PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS}
            render={() =>
              area({
                endpoints,
                title: 'Marketplace Apps',
                description:
                  'Administrative appliance catalog imported from configured OpenNebula Marketplaces.',
                resources: [
                  { label: 'Marketplace Apps', legacyPath: '/marketplace-app' },
                ],
                createTo: PRODUCT_PATHS.PLATFORM_MARKETPLACE_APPS_CREATE,
                createLabel: 'Create Marketplace App',
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
