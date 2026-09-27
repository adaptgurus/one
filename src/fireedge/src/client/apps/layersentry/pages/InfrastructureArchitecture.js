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
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import { useHistory } from 'react-router-dom'
import {
  ClusterAPI,
  DatastoreAPI,
  HostAPI,
  VmAPI,
  VnAPI,
  ZoneAPI,
} from '@FeaturesModule'
import {
  MetricCard,
  PageFrame,
  RefreshButton,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const values = (query) => (Array.isArray(query.data) ? query.data : [])
const count = (query) =>
  query.isLoading ? '…' : query.isError ? '—' : values(query).length
const ids = (value) => {
  const item = value?.ID ?? value

  return Array.isArray(item) ? item : item === undefined ? [] : [item]
}

const InfrastructureArchitecture = () => {
  const history = useHistory()
  const hosts = HostAPI.useGetHostsQuery()
  const clusters = ClusterAPI.useGetClustersQuery()
  const datastores = DatastoreAPI.useGetDatastoresQuery()
  const networks = VnAPI.useGetVNetworksQuery()
  const zones = ZoneAPI.useGetZonesQuery()
  const vms = VmAPI.useGetVmsQuery({ extended: false })
  const queries = [hosts, clusters, datastores, networks, zones, vms]
  const isLoading = queries.some((query) => query.isLoading)
  const hasError = queries.some((query) => query.isError)
  const refresh = () => queries.forEach((query) => query.refetch())

  return (
    <PageFrame
      title="Infrastructure Architecture"
      description="Read-only topology assembled from authoritative LayerSentry infrastructure inventory."
      actions={
        <RefreshButton
          onClick={refresh}
          disabled={queries.some((query) => query.isFetching)}
        />
      }
    >
      {isLoading && <LinearProgress sx={{ mt: 2 }} />}
      {hasError && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Some architecture inventory is unavailable. Missing relationships are
          not inferred.
        </Alert>
      )}
      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid item xs={6} md={2}>
          <MetricCard label="Sites / zones" value={count(zones)} />
        </Grid>
        <Grid item xs={6} md={2}>
          <MetricCard label="Clusters" value={count(clusters)} />
        </Grid>
        <Grid item xs={6} md={2}>
          <MetricCard label="Hosts" value={count(hosts)} />
        </Grid>
        <Grid item xs={6} md={2}>
          <MetricCard label="VMs" value={count(vms)} />
        </Grid>
        <Grid item xs={6} md={2}>
          <MetricCard label="Storage pools" value={count(datastores)} />
        </Grid>
        <Grid item xs={6} md={2}>
          <MetricCard label="Networks" value={count(networks)} />
        </Grid>
      </Grid>
      <Stack spacing={2} sx={{ mt: 2 }}>
        {values(zones).length > 0 && (
          <Surface sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 750, mb: 1 }}>
              Sites and zones
            </Typography>
            <Typography sx={{ fontSize: 13, color: colors.text.secondary }}>
              {values(zones)
                .map((zone) => zone.NAME ?? zone.ID)
                .join(' · ')}
            </Typography>
          </Surface>
        )}
        <Grid container spacing={2}>
          {values(clusters).map((cluster) => {
            const hostIds = ids(cluster.HOSTS)
            const members = values(hosts).filter((host) =>
              hostIds.map(String).includes(String(host.ID))
            )

            return (
              <Grid item xs={12} lg={6} key={cluster.ID}>
                <Surface sx={{ p: 2.25, height: '100%' }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 750 }}>
                    {cluster.NAME ?? `Cluster ${cluster.ID}`}
                  </Typography>
                  <Typography
                    sx={{ fontSize: 11, color: colors.text.muted, mb: 1.5 }}
                  >
                    Cluster ID {cluster.ID} · {ids(cluster.DATASTORES).length}{' '}
                    storage pools · {ids(cluster.VNETS).length} networks
                  </Typography>
                  {members.length === 0 ? (
                    <Alert severity="info">
                      No visible host placement is reported for this cluster.
                    </Alert>
                  ) : (
                    members.map((host) => (
                      <Box
                        key={host.ID}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 1,
                          borderTop: `1px solid ${colors.border}`,
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                            {host.NAME ?? `Host ${host.ID}`}
                          </Typography>
                          <Typography
                            sx={{ fontSize: 11, color: colors.text.secondary }}
                          >
                            State {host.STATE ?? 'Unavailable'} ·{' '}
                            {host.HOST_SHARE?.RUNNING_VMS ?? 'Unavailable'}{' '}
                            running VMs
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          onClick={() =>
                            history.push(
                              `${PRODUCT_PATHS.INFRA_HOSTS}/${host.ID}`
                            )
                          }
                        >
                          Details
                        </Button>
                      </Box>
                    ))
                  )}
                </Surface>
              </Grid>
            )
          })}
        </Grid>
        {!isLoading && values(clusters).length === 0 && (
          <Alert severity="info">
            No compute-cluster topology is visible to this administrator.
          </Alert>
        )}
      </Stack>
    </PageFrame>
  )
}

export default InfrastructureArchitecture
