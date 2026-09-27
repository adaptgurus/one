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
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Download, Plus, Refresh } from 'iconoir-react'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { KubeOnePortalAPI } from '@FeaturesModule'
import {
  PageFrame,
  MetricCard,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
} from 'client/apps/layersentry/capabilities'

const downloadText = (name, value) => {
  const url = URL.createObjectURL(
    new Blob([value], { type: 'application/yaml' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.kubeconfig`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const ClusterManager = ({ cluster, profiles, canMutate }) => {
  const [namespace, setNamespace] = useState('')
  const [operationError, setOperationError] = useState('')
  const diagnostics = KubeOnePortalAPI.useGetKubeOneDiagnosticsQuery(
    cluster.id,
    { pollingInterval: 15000 }
  )
  const namespaces = KubeOnePortalAPI.useGetKubeOneNamespacesQuery(cluster.id, {
    skip: !cluster.provisioned,
  })
  const [createNamespace, createState] =
    KubeOnePortalAPI.useCreateKubeOneNamespaceMutation()
  const [loadKubeconfig, kubeconfigState] =
    KubeOnePortalAPI.useLazyGetKubeOneKubeconfigQuery()
  const provisionJob = KubeOnePortalAPI.useGetKubeOneProvisionStatusQuery(
    cluster.id,
    { pollingInterval: 5000, skip: cluster.provisioned }
  )
  const [provisionCluster, provisionState] =
    KubeOnePortalAPI.useProvisionKubeOneClusterMutation()
  const controlPlaneJob =
    KubeOnePortalAPI.useGetKubeOneControlPlaneReconciliationQuery(cluster.id, {
      pollingInterval: 5000,
      skip: !cluster.provisioned,
    })
  const [reconcileControlPlane, controlPlaneState] =
    KubeOnePortalAPI.useReconcileKubeOneControlPlaneMutation()
  const workerJob = KubeOnePortalAPI.useGetKubeOneWorkerReconciliationQuery(
    cluster.id,
    { pollingInterval: 5000, skip: !cluster.provisioned }
  )
  const [reconcileWorkers, reconcileState] =
    KubeOnePortalAPI.useReconcileKubeOneWorkersMutation()
  const applications = KubeOnePortalAPI.useGetKubeOneApplicationsQuery(
    cluster.id,
    { pollingInterval: 5000, skip: !cluster.provisioned }
  )
  const [installApplication, installState] =
    KubeOnePortalAPI.useInstallKubeOneApplicationMutation()
  const status = cluster.status || {}
  const workerPending =
    cluster.provisioned && status.ready_nodes < cluster.expected_nodes
  const controlPlanePending =
    cluster.provisioned &&
    status.ready_control_planes < cluster.expected_control_planes
  const existingControlPlaneHealthy =
    cluster.provisioned &&
    status.api_ready &&
    status.ready_control_planes >= 1 &&
    status.kube_system_non_ready === 0
  const controlPlaneHealthy =
    existingControlPlaneHealthy &&
    status.ready_control_planes === cluster.expected_control_planes
  const job = workerJob.data?.job
  const cpJob = controlPlaneJob.data?.job
  const createJob = provisionJob.data?.job

  const runOperation = async (operation) => {
    setOperationError('')
    try {
      await operation()
    } catch (error) {
      setOperationError(
        error?.data?.error ||
          error?.error ||
          'The requested operation could not be completed.'
      )
    }
  }
  const createCluster = () =>
    runOperation(async () => {
      await provisionCluster(cluster.id).unwrap()
      await provisionJob.refetch()
    })
  const addControlPlane = () =>
    runOperation(async () => {
      await reconcileControlPlane(cluster.id).unwrap()
      await controlPlaneJob.refetch()
    })
  const addNamespace = () =>
    runOperation(async () => {
      await createNamespace({ id: cluster.id, name: namespace }).unwrap()
      setNamespace('')
    })
  const downloadKubeconfig = () =>
    runOperation(async () => {
      const value = await loadKubeconfig(cluster.id).unwrap()
      downloadText(
        cluster.id,
        typeof value === 'string' ? value : String(value || '')
      )
    })
  const reconcileRegisteredWorkers = () =>
    runOperation(async () => {
      await reconcileWorkers(cluster.id).unwrap()
      await workerJob.refetch()
    })
  const installCatalogApplication = (app) =>
    runOperation(async () => {
      await installApplication({ id: cluster.id, app }).unwrap()
      await applications.refetch()
    })
  const applicationItems = applications.data?.applications || []
  const installedApps = new Set(
    applicationItems
      .filter(({ installed }) => installed)
      .map(({ profile }) => profile.id)
  )

  return (
    <Stack spacing={2}>
      {operationError && <Alert severity="error">{operationError}</Alert>}
      <Surface sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h6">
              {cluster.display_name || cluster.id}
            </Typography>
            {cluster.display_name && cluster.display_name !== cluster.id && (
              <Typography variant="caption" color="text.secondary">
                {cluster.id}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
              {!cluster.provisioned && (
                <Chip size="small" color="warning" label="Not provisioned" />
              )}
              {cluster.provisioned && (
                <>
                  <Chip
                    size="small"
                    color={status.api_ready ? 'success' : 'error'}
                    label={status.api_ready ? 'API ready' : 'API unavailable'}
                  />
                  <Chip
                    size="small"
                    label={`${status.ready_nodes}/${
                      status.nodes?.length || cluster.expected_nodes
                    } nodes Ready`}
                  />
                  <Chip
                    size="small"
                    label={`${status.ready_control_planes}/${
                      status.control_planes || cluster.expected_control_planes
                    } control planes Ready`}
                  />
                </>
              )}
            </Stack>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Download />}
            disabled={!cluster.provisioned || kubeconfigState.isFetching}
            onClick={downloadKubeconfig}
          >
            Download kubeconfig
          </Button>
        </Stack>
      </Surface>

      <Surface sx={{ p: 2 }}>
        <Typography variant="h6">Health diagnostics</Typography>
        {diagnostics.isLoading ? (
          <LinearProgress sx={{ mt: 2 }} />
        ) : diagnostics.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            Authoritative cluster diagnostics are unavailable.
          </Alert>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip
                size="small"
                color={diagnostics.data?.healthy ? 'success' : 'warning'}
                label={
                  diagnostics.data?.healthy ? 'Healthy' : 'Needs attention'
                }
              />
              <Chip
                size="small"
                label={`Phase: ${diagnostics.data?.phase || 'unknown'}`}
              />
              {diagnostics.data?.observed_at && (
                <Chip
                  size="small"
                  label={`Observed ${new Date(
                    diagnostics.data.observed_at
                  ).toLocaleString()}`}
                />
              )}
            </Stack>
            {(diagnostics.data?.issues || []).length === 0 ? (
              <Alert severity="success">No active diagnostic issues.</Alert>
            ) : (
              (diagnostics.data?.issues || []).map((issue) => (
                <Alert
                  key={issue.code}
                  severity={issue.severity === 'error' ? 'error' : 'warning'}
                >
                  <Typography fontWeight={650}>{issue.message}</Typography>
                  {issue.remediation && (
                    <Typography variant="body2">
                      Remediation: {issue.remediation}
                    </Typography>
                  )}
                </Alert>
              ))
            )}
          </Stack>
        )}
      </Surface>

      {!cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Create Kubernetes cluster</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Provision this LayerSentry-approved cluster plan. Control-plane and
            worker hosts, endpoint, Kubernetes version, SSH identity, and
            manifest are fixed by the platform; the browser cannot submit
            arbitrary hosts or shell commands.
          </Typography>
          {!cluster.provisionable ? (
            <Alert severity="warning">
              This registered plan is inventory-only and cannot be provisioned.
            </Alert>
          ) : !cluster.self_service_lifecycle ? (
            <Alert severity="warning">
              Self-service lifecycle is not enabled for this cluster plan.
            </Alert>
          ) : (
            <Button
              variant="contained"
              startIcon={<Plus />}
              disabled={
                !canMutate ||
                provisionState.isLoading ||
                createJob?.status === 'RUNNING'
              }
              onClick={createCluster}
            >
              {createJob?.status === 'RUNNING'
                ? 'Creating cluster'
                : 'Create cluster'}
            </Button>
          )}
          {createJob && (
            <Alert
              severity={
                createJob.status === 'SUCCEEDED'
                  ? 'success'
                  : createJob.status === 'RUNNING'
                  ? 'info'
                  : 'warning'
              }
              sx={{ mt: 2 }}
            >
              Cluster provisioning: {createJob.status}.{' '}
              {createJob.message || ''}
            </Alert>
          )}
        </Surface>
      )}

      {cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Control plane</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Add only provider-approved control-plane hosts already declared in
            this cluster&apos;s approved manifest. Final production topology
            stays odd and quorum-safe.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus />}
            disabled={
              !canMutate ||
              !cluster.self_service_lifecycle ||
              !controlPlanePending ||
              !existingControlPlaneHealthy ||
              controlPlaneState.isLoading ||
              cpJob?.status === 'RUNNING'
            }
            onClick={addControlPlane}
          >
            Add control plane
          </Button>
          {!controlPlanePending && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Registered control-plane topology is converged (
              {status.ready_control_planes}/{cluster.expected_control_planes}{' '}
              Ready).
            </Alert>
          )}
          {controlPlanePending && !existingControlPlaneHealthy && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Control-plane reconciliation is blocked until the currently joined
              quorum and kube-system are healthy.
            </Alert>
          )}
          {cpJob && (
            <Alert
              severity={
                cpJob.status === 'SUCCEEDED'
                  ? 'success'
                  : cpJob.status === 'RUNNING'
                  ? 'info'
                  : 'warning'
              }
              sx={{ mt: 2 }}
            >
              Control-plane reconciliation: {cpJob.status}.{' '}
              {cpJob.message || ''}
            </Alert>
          )}
        </Surface>
      )}

      {cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Namespaces</Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ my: 2 }}
          >
            <TextField
              size="small"
              label="Namespace"
              value={namespace}
              onChange={(event) =>
                setNamespace(event.target.value.toLowerCase())
              }
              inputProps={{ maxLength: 63 }}
            />
            <Button
              variant="contained"
              startIcon={<Plus />}
              disabled={
                !canMutate ||
                !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(namespace) ||
                createState.isLoading
              }
              onClick={addNamespace}
            >
              Create namespace
            </Button>
          </Stack>
          {namespaces.isLoading ? (
            <LinearProgress />
          ) : namespaces.isError ? (
            <Alert severity="error">Could not read namespaces.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Ownership</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(namespaces.data?.namespaces || []).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      {item.layersentry_managed
                        ? 'LayerSentry managed'
                        : 'External / system'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Surface>
      )}

      {cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Applications</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Install only LayerSentry-qualified applications on this selected
            Kubernetes cluster. Helm repository, chart, version, namespace, and
            values are fixed by the server catalog.
          </Typography>
          {applications.isLoading ? (
            <LinearProgress />
          ) : applications.isError ? (
            <Alert severity="error">
              Application catalog or Helm inventory is unavailable.
            </Alert>
          ) : applicationItems.length === 0 ? (
            <Alert severity="info">
              No qualified applications are published for this cluster.
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Application</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {applicationItems.map(({ profile, installed, job: appJob }) => {
                  const missing = (profile.dependencies || []).filter(
                    (dependency) => !installedApps.has(dependency)
                  )
                  const running = appJob?.status === 'RUNNING'

                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <Typography fontWeight={600}>
                          {profile.label}
                        </Typography>
                        {profile.description && (
                          <Typography variant="caption" color="text.secondary">
                            {profile.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{profile.category}</TableCell>
                      <TableCell>{profile.version}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            installed ? 'success' : running ? 'info' : 'default'
                          }
                          label={
                            installed
                              ? 'Installed'
                              : running
                              ? 'Installing'
                              : appJob?.status || 'Available'
                          }
                        />
                        {missing.length > 0 && (
                          <Typography
                            variant="caption"
                            color="warning.main"
                            display="block"
                            sx={{ mt: 0.5 }}
                          >
                            Requires: {missing.join(', ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={installed ? 'outlined' : 'contained'}
                          disabled={
                            !canMutate ||
                            installed ||
                            running ||
                            missing.length > 0 ||
                            installState.isLoading ||
                            !controlPlaneHealthy
                          }
                          onClick={() => installCatalogApplication(profile.id)}
                        >
                          {installed
                            ? 'Installed'
                            : running
                            ? 'Installing'
                            : 'Install'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Surface>
      )}

      {cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Worker topology</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Reconcile only workers already present in the LayerSentry-qualified
            server-owned topology. Arbitrary hosts, SSH commands, accelerator
            assignments, and unmanaged worker definitions are not accepted.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Button
              variant="contained"
              disabled={
                !canMutate ||
                !cluster.self_service_lifecycle ||
                !workerPending ||
                !controlPlaneHealthy ||
                reconcileState.isLoading ||
                job?.status === 'RUNNING'
              }
              onClick={reconcileRegisteredWorkers}
            >
              Reconcile registered workers
            </Button>
          </Stack>
          {!workerPending && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Registered worker topology is converged ({status.ready_nodes}/
              {cluster.expected_nodes} nodes Ready).
            </Alert>
          )}
          {workerPending && !controlPlaneHealthy && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Worker reconciliation is blocked until control-plane quorum and
              kube-system health are restored.
            </Alert>
          )}
          {job && (
            <Alert
              severity={
                job.status === 'SUCCEEDED'
                  ? 'success'
                  : job.status === 'RUNNING'
                  ? 'info'
                  : 'warning'
              }
              sx={{ mt: 2 }}
            >
              Worker reconciliation: {job.status}. {job.message || ''}
            </Alert>
          )}
          {profiles.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No LayerSentry-qualified accelerator profiles are published for
              this environment.
            </Alert>
          )}
          {profiles.length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Qualified accelerator inventory:{' '}
              {profiles.map(({ label }) => label).join(', ')}. Assignment is
              controlled by the registered topology.
            </Alert>
          )}
        </Surface>
      )}
    </Stack>
  )
}

ClusterManager.propTypes = {
  cluster: PropTypes.object.isRequired,
  profiles: PropTypes.arrayOf(PropTypes.object).isRequired,
  canMutate: PropTypes.bool.isRequired,
}

const KubernetesWorkspace = ({ endpoints }) => {
  const capabilities = KubeOnePortalAPI.useGetKubeOneCapabilitiesQuery()
  const query = KubeOnePortalAPI.useGetKubeOneClustersQuery()
  const canCreate = isCapabilityEnabled(
    CAPABILITY_IDS.KUBERNETES_CREATE,
    getCapabilityModel(endpoints)
  )
  const [selected, setSelected] = useState('')
  const clusters = query.data?.clusters || []
  const activeID = selected || clusters[0]?.id || ''
  const cluster = clusters.find(({ id }) => id === activeID)
  const fleet = clusters.reduce(
    (summary, item) => {
      const status = item.status || {}
      const healthy =
        item.provisioned &&
        status.api_ready &&
        status.ready_nodes >= item.expected_nodes &&
        status.ready_control_planes >= item.expected_control_planes &&
        !item.readback_error
      summary.readyNodes += Number(status.ready_nodes || 0)
      summary[
        healthy ? 'healthy' : item.provisioned ? 'degraded' : 'planned'
      ] += 1

      return summary
    },
    { healthy: 0, degraded: 0, planned: 0, readyNodes: 0 }
  )
  const refresh = () => {
    capabilities.refetch()
    query.refetch()
  }

  return (
    <PageFrame
      title="Kubernetes"
      description="Manage LayerSentry Kubernetes clusters through typed, tenant-scoped operations."
      actions={
        <Button variant="outlined" startIcon={<Refresh />} onClick={refresh}>
          Refresh
        </Button>
      }
    >
      {query.isLoading || capabilities.isLoading ? (
        <LinearProgress />
      ) : query.isError || capabilities.isError ? (
        <Alert severity="error">
          Kubernetes management service is unavailable.
        </Alert>
      ) : capabilities.data?.multi_cluster !== true ? (
        <Alert severity="warning">
          Multi-cluster orchestration is not enabled by the management service.
        </Alert>
      ) : clusters.length === 0 ? (
        <Alert severity="info">
          No Kubernetes cluster is registered for this tenant.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))',
              },
              gap: 2,
            }}
          >
            <MetricCard label="Clusters" value={clusters.length} />
            <MetricCard label="Healthy" value={fleet.healthy} />
            <MetricCard label="Needs attention" value={fleet.degraded} />
            <MetricCard label="Ready nodes" value={fleet.readyNodes} />
          </Box>
          <Surface sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Cluster fleet
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cluster</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Nodes</TableCell>
                  <TableCell>Control plane</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clusters.map((item) => {
                  const status = item.status || {}
                  const healthy =
                    item.provisioned &&
                    status.api_ready &&
                    status.ready_nodes >= item.expected_nodes &&
                    status.ready_control_planes >=
                      item.expected_control_planes &&
                    !item.readback_error

                  return (
                    <TableRow key={item.id} selected={item.id === activeID}>
                      <TableCell>
                        <Typography fontWeight={650}>
                          {item.display_name || item.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.id}
                        </Typography>
                        {item.readback_error && (
                          <Typography
                            variant="caption"
                            color="error"
                            display="block"
                          >
                            Live readback unavailable
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            healthy
                              ? 'success'
                              : item.provisioned
                              ? 'warning'
                              : 'default'
                          }
                          label={
                            healthy
                              ? 'Healthy'
                              : item.provisioned
                              ? 'Needs attention'
                              : 'Planned'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {status.ready_nodes || 0}/{item.expected_nodes || 0}{' '}
                        Ready
                      </TableCell>
                      <TableCell>
                        {status.ready_control_planes || 0}/
                        {item.expected_control_planes || 0} Ready
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={
                            item.id === activeID ? 'contained' : 'outlined'
                          }
                          onClick={() => setSelected(item.id)}
                        >
                          {item.id === activeID ? 'Selected' : 'Manage'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Surface>
          {capabilities.data?.destructive_lifecycle === false && (
            <Alert severity="info">
              Destructive cluster lifecycle actions are disabled. Workspaces,
              topology, and credentials remain server-owned.
            </Alert>
          )}
          {cluster &&
            (canCreate ? (
              <ClusterManager
                cluster={cluster}
                profiles={query.data?.accelerator_profiles || []}
                canMutate
              />
            ) : (
              <>
                <Alert severity="info">
                  Kubernetes lifecycle changes are not enabled and qualified for
                  this role. Inventory and health remain read-only.
                </Alert>
                <ClusterManager
                  cluster={cluster}
                  profiles={query.data?.accelerator_profiles || []}
                  canMutate={false}
                />
              </>
            ))}
        </Stack>
      )}
    </PageFrame>
  )
}

KubernetesWorkspace.propTypes = {
  endpoints: PropTypes.array,
}

export default KubernetesWorkspace
