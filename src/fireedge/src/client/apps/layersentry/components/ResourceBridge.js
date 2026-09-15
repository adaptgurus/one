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
import { Alert, Box, LinearProgress, Typography } from '@mui/material'
import { useMemo } from 'react'
import { ResourceSingleViewHost } from '@ContainersModule'
import { colors } from 'client/apps/layersentry/theme/tokens'

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

const ResourceBridge = ({
  endpoints,
  legacyPath,
  unavailableLabel = 'This capability is not available for your current role.',
}) => {
  const endpoint = useMemo(
    () =>
      flattenEndpoints(endpoints).find(
        ({ path }) =>
          normalizeEndpointPath(path) === normalizeEndpointPath(legacyPath)
      ),
    [endpoints, legacyPath]
  )

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
