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
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
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
import { useMemo, useState } from 'react'
import { KubeOnePortalAPI } from '@FeaturesModule'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'

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

const ClusterManager = ({ cluster, profiles }) => {
  const [namespace, setNamespace] = useState('')
  const [accelerator, setAccelerator] = useState('')
  const [count, setCount] = useState(1)
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
  const selectedProfile = profiles.find(({ id }) => id === accelerator)
  const workerPending =
    cluster.provisioned && cluster.status.ready_nodes < cluster.expected_nodes
  const controlPlanePending =
    cluster.provisioned &&
    cluster.status.ready_control_planes < cluster.expected_control_planes
  const existingControlPlaneHealthy =
    cluster.provisioned &&
    cluster.status.api_ready &&
    cluster.status.ready_control_planes >= 1 &&
    cluster.status.kube_system_non_ready === 0
  const controlPlaneHealthy =
    existingControlPlaneHealthy &&
    cluster.status.ready_control_planes === cluster.expected_control_planes
  const job = workerJob.data?.job
  const cpJob = controlPlaneJob.data?.job
  const createJob = provisionJob.data?.job

  const createCluster = async () => {
    await provisionCluster(cluster.id).unwrap()
    await provisionJob.refetch()
  }
  const addControlPlane = async () => {
    await reconcileControlPlane(cluster.id).unwrap()
    await controlPlaneJob.refetch()
  }
  const addNamespace = async () => {
    await createNamespace({ id: cluster.id, name: namespace }).unwrap()
    setNamespace('')
  }
  const downloadKubeconfig = async () => {
    const value = await loadKubeconfig(cluster.id).unwrap()
    downloadText(
      cluster.id,
      typeof value === 'string' ? value : String(value || '')
    )
  }
  const addRegisteredWorker = async () => {
    await reconcileWorkers(cluster.id).unwrap()
    await workerJob.refetch()
  }
  const installCatalogApplication = async (app) => {
    await installApplication({ id: cluster.id, app }).unwrap()
    await applications.refetch()
  }
  const applicationItems = applications.data?.applications || []
  const installedApps = new Set(
    applicationItems
      .filter(({ installed }) => installed)
      .map(({ profile }) => profile.id)
  )

  return (
    <Stack spacing={2}>
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
                    color={cluster.status.api_ready ? 'success' : 'error'}
                    label={
                      cluster.status.api_ready ? 'API ready' : 'API unavailable'
                    }
                  />
                  <Chip
                    size="small"
                    label={`${cluster.status.ready_nodes}/${
                      cluster.status.nodes?.length || cluster.expected_nodes
                    } nodes Ready`}
                  />
                  <Chip
                    size="small"
                    label={`${cluster.status.ready_control_planes}/${cluster.status.control_planes} control planes Ready`}
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

      {!cluster.provisioned && (
        <Surface sx={{ p: 2 }}>
          <Typography variant="h6">Create KubeOne cluster</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Provision this server-approved KubeOne plan. Control-plane and
            worker hosts, endpoint, Kubernetes version, SSH identity, and
            manifest are fixed by the provider; the browser cannot submit
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
                provisionState.isLoading || createJob?.status === 'RUNNING'
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
            this cluster&apos;s KubeOne manifest. Final production topology
            stays odd and quorum-safe.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus />}
            disabled={
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
              {cluster.status.ready_control_planes}/
              {cluster.expected_control_planes} Ready).
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
            KubeOne cluster. Helm repository, chart, version, namespace, and
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
          <Typography variant="h6">Add worker</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Join only workers already present in the provider-qualified KubeOne
            topology. Arbitrary IP addresses, SSH commands, and unmanaged worker
            definitions are not accepted.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>GPU / vGPU profile</InputLabel>
              <Select
                label="GPU / vGPU profile"
                value={accelerator}
                onChange={(event) => setAccelerator(event.target.value)}
              >
                <MenuItem value="">No accelerator</MenuItem>
                {profiles.map((profile) => (
                  <MenuItem key={profile.id} value={profile.id}>
                    {profile.label} ({profile.kind})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="number"
              label="Device count"
              value={count}
              disabled={!selectedProfile}
              onChange={(event) => setCount(Number(event.target.value))}
              inputProps={{ min: 1, max: selectedProfile?.max_count || 1 }}
            />
            <Button
              variant="contained"
              disabled={
                !cluster.self_service_lifecycle ||
                !workerPending ||
                !controlPlaneHealthy ||
                reconcileState.isLoading ||
                job?.status === 'RUNNING'
              }
              onClick={addRegisteredWorker}
            >
              Add worker
            </Button>
          </Stack>
          {!workerPending && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Registered worker topology is converged (
              {cluster.status.ready_nodes}/{cluster.expected_nodes} nodes
              Ready).
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
              This tester has no provider-qualified GPU or vGPU profile.
              Attachment is correctly unavailable.
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
}

const KubernetesWorkspace = () => {
  const query = KubeOnePortalAPI.useGetKubeOneClustersQuery()
  const [selected, setSelected] = useState('')
  const clusters = query.data?.clusters || []
  const activeID = selected || clusters[0]?.id || ''
  const cluster = useMemo(
    () => clusters.find(({ id }) => id === activeID),
    [clusters, activeID]
  )

  return (
    <PageFrame
      title="Kubernetes"
      description="Manage KubeOne-owned clusters through typed, tenant-scoped operations."
      actions={
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={query.refetch}
        >
          Refresh
        </Button>
      }
    >
      {query.isLoading ? (
        <LinearProgress />
      ) : query.isError ? (
        <Alert severity="error">
          KubeOne management service is unavailable.
        </Alert>
      ) : clusters.length === 0 ? (
        <Alert severity="info">
          No KubeOne cluster is registered for this tenant.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <FormControl size="small" sx={{ maxWidth: 360 }}>
            <InputLabel>Cluster</InputLabel>
            <Select
              label="Cluster"
              value={activeID}
              onChange={(event) => setSelected(event.target.value)}
            >
              {clusters.map(({ id }) => (
                <MenuItem key={id} value={id}>
                  {clusters.find((item) => item.id === id)?.display_name || id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {cluster && (
            <ClusterManager
              cluster={cluster}
              profiles={query.data?.accelerator_profiles || []}
            />
          )}
        </Stack>
      )}
    </PageFrame>
  )
}

export default KubernetesWorkspace