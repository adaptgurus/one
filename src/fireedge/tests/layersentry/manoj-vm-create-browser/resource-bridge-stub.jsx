/* SPDX-License-Identifier: Apache-2.0 */
import React from 'react'
import { Alert, Box } from '@mui/material'

const flatten = (endpoints = []) => {
  const out = []
  const visit = (item) => {
    if (item?.path) out.push(item)
    ;(item?.routes || []).forEach(visit)
  }
  endpoints.forEach(visit)
  return out
}

const ResourceBridge = ({ endpoints = [], legacyPath, unavailableLabel }) => {
  const endpoint = flatten(endpoints).find((item) => item.path === legacyPath)
  if (!endpoint?.Component) {
    return <Alert severity="info">{unavailableLabel || 'Not available'}</Alert>
  }
  const Component = endpoint.Component
  return (
    <Box data-layersentry-backend-path={legacyPath}>
      <Component />
    </Box>
  )
}

export default ResourceBridge
