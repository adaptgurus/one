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
  Button,
  LinearProgress,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import { Plus } from 'iconoir-react'
import { useState } from 'react'
import { useHistory } from 'react-router-dom'
import { ServiceAPI, ServiceTemplateAPI } from '@FeaturesModule'
import {
  CAPABILITY_IDS,
  getCapabilityModel,
  isCapabilityEnabled,
} from 'client/apps/layersentry/capabilities'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const toArray = (value) =>
  value === undefined || value === null || value === ''
    ? []
    : Array.isArray(value)
    ? value
    : [value]

const getBody = (resource = {}) => resource?.TEMPLATE?.BODY ?? {}

const countServiceRoles = (service) => toArray(getBody(service).roles).length

const countServiceVms = (service) =>
  toArray(getBody(service).roles).reduce(
    (total, role) => total + toArray(role?.nodes).length,
    0
  )

const countNetworks = (resource) => {
  const networks = getBody(resource).networks

  if (Array.isArray(networks)) return networks.length
  if (networks && typeof networks === 'object') return Object.keys(networks).length

  return 0
}

const getServiceStateLabel = (service) => {
  const state = getBody(service).state

  return state === undefined || state === null || state === ''
    ? 'State unavailable'
    : `State ${state}`
}

const DeploymentInventory = () => {
  const query = ServiceAPI.useGetServicesQuery()
  const services = toArray(query.data)

  if (query.isLoading || query.isFetching) return <LinearProgress />

  if (query.isError) {
    return (
      <Alert severity="error">
        Could not load application deployments from the OneFlow API.
      </Alert>
    )
  }

  if (services.length === 0) {
    return (
      <Alert severity="info">
        No application deployments are visible to this account.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-readonly-application-deployments
      sx={{ display: 'grid', gap: 1 }}
    >
      {services.map((service) => (
        <Box
          key={service.ID ?? service.NAME}
          sx={{
            p: 1.5,
            border: `1px solid ${colors.border}`,
            borderRadius: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            {service.NAME ?? `Application ${service.ID}`}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}>
            #{service.ID} · {getServiceStateLabel(service)} ·{' '}
            {countServiceRoles(service)} role
            {countServiceRoles(service) === 1 ? '' : 's'} ·{' '}
            {countServiceVms(service)} VM
            {countServiceVms(service) === 1 ? '' : 's'} ·{' '}
            {countNetworks(service)} network
            {countNetworks(service) === 1 ? '' : 's'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

const CatalogInventory = () => {
  const query = ServiceTemplateAPI.useGetServiceTemplatesQuery()
  const templates = toArray(query.data)

  if (query.isLoading || query.isFetching) return <LinearProgress />

  if (query.isError) {
    return (
      <Alert severity="error">
        Could not load the application catalog from the OneFlow API.
      </Alert>
    )
  }

  if (templates.length === 0) {
    return (
      <Alert severity="info">
        No application definitions are visible to this account.
      </Alert>
    )
  }

  return (
    <Box
      data-layersentry-readonly-application-catalog
      sx={{ display: 'grid', gap: 1 }}
    >
      {templates.map((template) => (
        <Box
          key={template.ID ?? template.NAME}
          sx={{
            p: 1.5,
            border: `1px solid ${colors.border}`,
            borderRadius: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
            {template.NAME ?? `Application definition ${template.ID}`}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 11, color: colors.text.muted }}>
            #{template.ID} · {countServiceRoles(template)} role
            {countServiceRoles(template) === 1 ? '' : 's'} ·{' '}
            {countNetworks(template)} network
            {countNetworks(template) === 1 ? '' : 's'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

const ApplicationsWorkspace = ({ endpoints }) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const canDeploy = isCapabilityEnabled(
    CAPABILITY_IDS.APPLICATIONS_DEPLOY,
    getCapabilityModel(endpoints)
  )

  return (
    <PageFrame
      title="Applications"
      description="Read-only OneFlow deployments and published application definitions; deploy and Day-2 operations remain separately qualified."
      actions={
        canDeploy ? (
          <Button
            variant="contained"
            startIcon={<Plus width={17} height={17} />}
            onClick={() => history.push('/applications/deploy')}
            sx={{ textTransform: 'none' }}
          >
            Deploy application
          </Button>
        ) : null
      }
    >
      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Application model"
          description="Catalog definitions describe the service. Deployments are the running application instances."
        />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {[
            ['Catalog', 'Published OneFlow service templates'],
            ['Deployments', 'Running service instances'],
            [
              'Lifecycle',
              'Day-2 actions appear only after separate production qualification',
            ],
          ].map(([title, description]) => (
            <Box
              key={title}
              sx={{
                flex: '1 1 220px',
                p: 1.5,
                border: `1px solid ${colors.border}`,
                borderRadius: 1.5,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                {title}
              </Typography>
              <Typography
                sx={{ mt: 0.5, fontSize: 12, color: colors.text.secondary }}
              >
                {description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Surface>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab label="My Applications" />
        <Tab label="Application Catalog" />
      </Tabs>
      <Surface sx={{ mt: 2, p: 2 }}>
        {tab === 0 ? <DeploymentInventory /> : <CatalogInventory />}
      </Surface>
    </PageFrame>
  )
}

ApplicationsWorkspace.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
}
ApplicationsWorkspace.defaultProps = { endpoints: [] }
export default ApplicationsWorkspace
