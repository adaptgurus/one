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
  Box,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useMemo } from 'react'
import { ResourceSingleViewHost } from '@ContainersModule'
import {
  AclAPI,
  ClusterAPI,
  DatastoreAPI,
  DriverAPI,
  GroupAPI,
  HostAPI,
  ImageAPI,
  MarketplaceAPI,
  MarketplaceAppAPI,
  ProviderAPI,
  UserAPI,
  VdcAPI,
  VmAPI,
  VmGroupAPI,
  VmTemplateAPI,
  VrTemplateAPI,
  ZoneAPI,
} from '@FeaturesModule'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

export const flattenEndpoints = (endpoints = []) => {
  const flattened = []
  const visit = (endpoint) => {
    if (endpoint?.path) flattened.push(endpoint)
    endpoint?.routes?.forEach(visit)
  }
  endpoints.forEach(visit)

  return flattened
}

export const normalizeEndpointPath = (path = '') => {
  const value = `/${String(path).replace(/^\/+|\/+$/g, '')}`

  return value === '/' ? value : value.replace(/\/+$/g, '')
}

const InventoryTable = ({ query, columns, emptyLabel }) => {
  const rows = toArray(query.data)

  if (query.isLoading) return <LinearProgress />
  if (query.isError) {
    return (
      <Alert severity="error">
        <Typography sx={{ fontWeight: 650 }}>
          Could not load inventory
        </Typography>
        <Typography sx={{ fontSize: 13 }}>
          {query.error?.data?.message ??
            query.error?.message ??
            'The OpenNebula API did not return this inventory.'}
        </Typography>
      </Alert>
    )
  }
  if (rows.length === 0) {
    return <Alert severity="info">{emptyLabel}</Alert>
  }

  return (
    <TableContainer data-layersentry-native-inventory>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map(({ label }) => (
              <TableCell key={label} sx={{ fontWeight: 750 }}>
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.ID ?? row.NAME} hover>
              {columns.map(({ label, render }) => (
                <TableCell key={label}>{render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

InventoryTable.propTypes = {
  query: PropTypes.object.isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      render: PropTypes.func.isRequired,
    })
  ).isRequired,
  emptyLabel: PropTypes.string.isRequired,
}

const VmInventory = () => {
  const query = VmAPI.useGetVmsQuery({ extended: true })

  return (
    <InventoryTable
      query={query}
      emptyLabel="No virtual machines are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
        {
          label: 'vCPU',
          render: ({ TEMPLATE }) => TEMPLATE?.VCPU ?? TEMPLATE?.CPU ?? '—',
        },
        {
          label: 'Memory',
          render: ({ TEMPLATE }) =>
            TEMPLATE?.MEMORY
              ? `${Math.max(1, Math.round(Number(TEMPLATE.MEMORY) / 1024))} GB`
              : '—',
        },
      ]}
    />
  )
}

const VmTemplateInventory = () => {
  const query = VmTemplateAPI.useGetTemplatesQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No VM blueprints are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Owner', render: ({ UNAME }) => UNAME ?? '—' },
        {
          label: 'vCPU',
          render: ({ TEMPLATE }) => TEMPLATE?.VCPU ?? TEMPLATE?.CPU ?? '—',
        },
        {
          label: 'Memory',
          render: ({ TEMPLATE }) =>
            TEMPLATE?.MEMORY
              ? `${Math.max(1, Math.round(Number(TEMPLATE.MEMORY) / 1024))} GB`
              : '—',
        },
      ]}
    />
  )
}

const VmGroupInventory = () => {
  const query = VmGroupAPI.useGetVMGroupsQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No affinity groups are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Owner', render: ({ UNAME }) => UNAME ?? '—' },
        {
          label: 'Roles',
          render: ({ ROLES }) => toArray(ROLES?.ROLE).length,
        },
      ]}
    />
  )
}

const countIds = (value) => toArray(value?.ID ?? value).length

const HostInventory = () => {
  const query = HostAPI.useGetHostsQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No compute hosts are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
        {
          label: 'Drivers',
          render: ({ IM_MAD, VM_MAD }) =>
            [IM_MAD, VM_MAD].filter(Boolean).join(' / ') || '—',
        },
      ]}
    />
  )
}

const ClusterInventory = () => {
  const query = ClusterAPI.useGetClustersQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No compute clusters are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Hosts', render: ({ HOSTS }) => countIds(HOSTS) },
        {
          label: 'Datastores',
          render: ({ DATASTORES }) => countIds(DATASTORES),
        },
        { label: 'Networks', render: ({ VNETS }) => countIds(VNETS) },
      ]}
    />
  )
}

const DatastoreInventory = () => {
  const query = DatastoreAPI.useGetDatastoresQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No storage pools are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Type', render: ({ TYPE }) => TYPE ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
        {
          label: 'Drivers',
          render: ({ DS_MAD, TM_MAD }) =>
            [DS_MAD, TM_MAD].filter(Boolean).join(' / ') || '—',
        },
      ]}
    />
  )
}

const DriverInventory = () => {
  const query = DriverAPI.useGetDriversQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No infrastructure drivers are visible to this account."
      columns={[
        { label: 'Name', render: ({ NAME, name }) => NAME ?? name ?? '—' },
        { label: 'State', render: ({ STATE, state }) => STATE ?? state ?? '—' },
        {
          label: 'Description',
          render: ({ DESCRIPTION, description }) =>
            DESCRIPTION ?? description ?? '—',
        },
      ]}
    />
  )
}

const ZoneInventory = () => {
  const query = ZoneAPI.useGetZonesQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No zones are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Endpoint', render: ({ ENDPOINT }) => ENDPOINT ?? '—' },
      ]}
    />
  )
}

const ProviderInventory = () => {
  const query = ProviderAPI.useGetProvidersQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No providers are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Owner', render: ({ UNAME }) => UNAME ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
      ]}
    />
  )
}

const UserInventory = () => {
  const query = UserAPI.useGetUsersQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No users are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Group', render: ({ GNAME }) => GNAME ?? '—' },
        {
          label: 'Authentication',
          render: ({ AUTH_DRIVER }) => AUTH_DRIVER ?? '—',
        },
        { label: 'Enabled', render: ({ ENABLED }) => ENABLED ?? '—' },
      ]}
    />
  )
}

const GroupInventory = () => {
  const query = GroupAPI.useGetGroupsQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No teams are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Users', render: ({ USERS }) => countIds(USERS) },
        { label: 'Admins', render: ({ ADMINS }) => countIds(ADMINS) },
      ]}
    />
  )
}

const VdcInventory = () => {
  const query = VdcAPI.useGetVDCsQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No projects are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Groups', render: ({ GROUPS }) => countIds(GROUPS) },
        { label: 'Clusters', render: ({ CLUSTERS }) => countIds(CLUSTERS) },
      ]}
    />
  )
}

const AclInventory = () => {
  const query = AclAPI.useGetAclsExtendedQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No access rules are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Rule', render: ({ STRING }) => STRING ?? '—' },
        { label: 'User', render: ({ USER }) => USER ?? '—' },
        { label: 'Resource', render: ({ RESOURCE }) => RESOURCE ?? '—' },
      ]}
    />
  )
}

const ImageInventory = () => {
  const query = ImageAPI.useGetImagesQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No platform images are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Owner', render: ({ UNAME }) => UNAME ?? '—' },
        { label: 'Type', render: ({ TYPE }) => TYPE ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
      ]}
    />
  )
}

const VrTemplateInventory = () => {
  const query = VrTemplateAPI.useGetVrTemplatesQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No router templates are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Owner', render: ({ UNAME }) => UNAME ?? '—' },
      ]}
    />
  )
}

const MarketplaceInventory = () => {
  const query = MarketplaceAPI.useGetMarketplacesQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No marketplaces are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Driver', render: ({ MARKET_MAD }) => MARKET_MAD ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
      ]}
    />
  )
}

const MarketplaceAppInventory = () => {
  const query = MarketplaceAppAPI.useGetMarketplaceAppsQuery()

  return (
    <InventoryTable
      query={query}
      emptyLabel="No marketplace apps are visible to this account."
      columns={[
        { label: 'ID', render: ({ ID }) => ID },
        { label: 'Name', render: ({ NAME }) => NAME ?? '—' },
        { label: 'Type', render: ({ TYPE }) => TYPE ?? '—' },
        { label: 'State', render: ({ STATE }) => STATE ?? '—' },
      ]}
    />
  )
}

const NATIVE_INVENTORY = Object.freeze({
  '/vm': VmInventory,
  '/vm-template': VmTemplateInventory,
  '/vm-group': VmGroupInventory,
  '/host': HostInventory,
  '/cluster': ClusterInventory,
  '/datastore': DatastoreInventory,
  '/driver': DriverInventory,
  '/zone': ZoneInventory,
  '/provider': ProviderInventory,
  '/user': UserInventory,
  '/group': GroupInventory,
  '/virtual-data-center': VdcInventory,
  '/acl': AclInventory,
  '/image': ImageInventory,
  '/vrouter-template': VrTemplateInventory,
  '/marketplace': MarketplaceInventory,
  '/marketplace-app': MarketplaceAppInventory,
})

const ResourceBridge = ({
  endpoints,
  legacyPath,
  unavailableLabel = 'This capability is not available for your current role.',
}) => {
  const normalizedPath = normalizeEndpointPath(legacyPath)
  const NativeInventory = NATIVE_INVENTORY[normalizedPath]
  const endpoint = useMemo(
    () =>
      flattenEndpoints(endpoints).find(
        ({ path }) => normalizeEndpointPath(path) === normalizedPath
      ),
    [endpoints, normalizedPath]
  )

  if (NativeInventory) {
    return (
      <Box data-layersentry-backend-path={legacyPath} sx={{ minWidth: 0 }}>
        <NativeInventory />
      </Box>
    )
  }

  if (!endpoint?.Component) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        <Typography sx={{ fontWeight: 650, color: colors.text.primary }}>
          Not available
        </Typography>
        <Typography sx={{ fontSize: 13 }}>{unavailableLabel}</Typography>
      </Alert>
    )
  }

  const Component = endpoint.Component

  return (
    <Box
      data-layersentry-backend-path={legacyPath}
      sx={{
        minWidth: 0,
        '& [data-cy="header"]': { display: 'none' },
      }}
    >
      <ResourceSingleViewHost>
        <Component fallback={<LinearProgress />} />
      </ResourceSingleViewHost>
    </Box>
  )
}

ResourceBridge.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
  legacyPath: PropTypes.string.isRequired,
  unavailableLabel: PropTypes.string,
}

ResourceBridge.defaultProps = {
  endpoints: [],
}

export default ResourceBridge
