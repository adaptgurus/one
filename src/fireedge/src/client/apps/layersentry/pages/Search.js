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
import { Box, Button, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import {
  BackupJobAPI,
  ImageAPI,
  OneKsAPI,
  ServiceAPI,
  VmAPI,
  VnAPI,
} from '@FeaturesModule'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'
import { colors } from 'client/apps/layersentry/theme/tokens'

const includes = (value, query) =>
  String(value ?? '')
    .toLowerCase()
    .includes(query.toLowerCase())

const SearchPage = () => {
  const location = useLocation()
  const history = useHistory()
  const query = new URLSearchParams(location.search).get('q')?.trim() ?? ''
  const vms = VmAPI.useGetVmsQuery({ extended: false })
  const kubernetes = OneKsAPI.useGetOneKsClustersQuery()
  const networks = VnAPI.useGetVNetworksQuery()
  const services = ServiceAPI.useGetServicesQuery()
  const images = ImageAPI.useGetImagesQuery()
  const backups = BackupJobAPI.useGetBackupJobsQuery()

  const results = useMemo(() => {
    if (!query) return []
    const items = []
    ;(vms.data ?? []).forEach((vm) => {
      if (includes(vm?.NAME, query))
        items.push({
          type: 'Virtual Machine',
          name: vm.NAME,
          path: PRODUCT_PATHS.COMPUTE,
        })
    })
    ;(kubernetes.data ?? []).forEach((entry) => {
      const cluster = entry?.DOCUMENT ?? entry
      if (includes(cluster?.NAME, query))
        items.push({
          type: 'Kubernetes',
          name: cluster.NAME,
          path: PRODUCT_PATHS.KUBERNETES,
        })
    })
    ;(networks.data ?? []).forEach((network) => {
      if (includes(network?.NAME, query))
        items.push({
          type: 'Network',
          name: network.NAME,
          path: PRODUCT_PATHS.NETWORK,
        })
    })
    ;(services.data ?? []).forEach((service) => {
      const resource = service?.DOCUMENT ?? service
      if (includes(resource?.NAME, query))
        items.push({
          type: 'Application',
          name: resource.NAME,
          path: PRODUCT_PATHS.APPLICATIONS,
        })
    })
    ;(images.data ?? []).forEach((image) => {
      if (includes(image?.NAME, query))
        items.push({
          type: 'Image / Disk',
          name: image.NAME,
          path: PRODUCT_PATHS.STORAGE,
        })
    })
    ;(backups.data ?? []).forEach((job) => {
      if (includes(job?.NAME, query))
        items.push({
          type: 'Backup Plan',
          name: job.NAME,
          path: PRODUCT_PATHS.PROTECTION,
        })
    })

    return items.slice(0, 50)
  }, [
    query,
    vms.data,
    kubernetes.data,
    networks.data,
    services.data,
    images.data,
    backups.data,
  ])

  return (
    <PageFrame
      title="Search"
      description={
        query
          ? `Results for “${query}”`
          : 'Search your visible cloud resources.'
      }
    >
      <Surface sx={{ mt: 3, overflow: 'hidden' }}>
        {results.length ? (
          results.map((result) => (
            <Button
              key={`${result.type}-${result.name}`}
              onClick={() => history.push(result.path)}
              sx={{
                width: '100%',
                justifyContent: 'flex-start',
                textAlign: 'left',
                px: 2.5,
                py: 1.5,
                borderBottom: `1px solid ${colors.border}`,
                borderRadius: 0,
                textTransform: 'none',
                color: colors.text.primary,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                  {result.name}
                </Typography>
                <Typography sx={{ fontSize: 11, color: colors.text.muted }}>
                  {result.type}
                </Typography>
              </Box>
            </Button>
          ))
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700, color: colors.text.primary }}>
              {query ? 'No matching resources' : 'Enter a search term'}
            </Typography>
            <Typography
              sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
            >
              Only resources visible to your current role are searched.
            </Typography>
          </Box>
        )}
      </Surface>
    </PageFrame>
  )
}

export default SearchPage
