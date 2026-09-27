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
import {
  Alert,
  Button,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import { useHistory } from 'react-router-dom'
import { HostAPI } from '@FeaturesModule'
import {
  PageFrame,
  RefreshButton,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { PRODUCT_PATHS } from 'client/apps/layersentry/navigation'

const HostWorkspace = ({ authoritativePath }) => {
  const history = useHistory()
  const query = HostAPI.useGetHostsQuery()
  const hosts = Array.isArray(query.data) ? query.data : []

  return (
    <PageFrame
      title="Compute Hosts"
      description="Authoritative host health, placement and capacity inventory."
      actions={
        <RefreshButton onClick={query.refetch} disabled={query.isFetching} />
      }
    >
      <Surface
        data-layersentry-authoritative-path={authoritativePath}
        sx={{ mt: 2, overflowX: 'auto' }}
      >
        {query.isLoading ? (
          <LinearProgress />
        ) : query.isError ? (
          <Alert severity="error">
            Compute-host inventory could not be loaded.
          </Alert>
        ) : hosts.length === 0 ? (
          <Alert severity="info">No compute hosts are visible.</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {[
                  'ID',
                  'Host',
                  'State',
                  'Running VMs',
                  'CPU headroom',
                  'RAM headroom',
                  '',
                ].map((label) => (
                  <TableCell key={label} sx={{ fontWeight: 750 }}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {hosts.map((host) => {
                const share = host.HOST_SHARE ?? {}
                const cpu = Number(share.MAX_CPU) - Number(share.USED_CPU)
                const ram = Number(share.MAX_MEM) - Number(share.USED_MEM)

                return (
                  <TableRow key={host.ID}>
                    <TableCell>{host.ID}</TableCell>
                    <TableCell>{host.NAME ?? '—'}</TableCell>
                    <TableCell>{host.STATE ?? '—'}</TableCell>
                    <TableCell>{share.RUNNING_VMS ?? '—'}</TableCell>
                    <TableCell>
                      {Number.isFinite(cpu)
                        ? `${Math.max(0, cpu) / 100} cores`
                        : 'Unavailable'}
                    </TableCell>
                    <TableCell>
                      {Number.isFinite(ram)
                        ? `${(Math.max(0, ram) / 1024 / 1024).toFixed(1)} GiB`
                        : 'Unavailable'}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Surface>
    </PageFrame>
  )
}

HostWorkspace.propTypes = {
  authoritativePath: PropTypes.string.isRequired,
}

export default HostWorkspace
