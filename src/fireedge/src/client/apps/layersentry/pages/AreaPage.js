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
import { Box, Tab, Tabs } from '@mui/material'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  getCapabilityForPath,
  getCapabilityModel,
  isCapabilityEnabled,
} from 'client/apps/layersentry/capabilities'
import {
  CreateButton,
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors, radius } from 'client/apps/layersentry/theme/tokens'

const AreaPage = ({
  endpoints,
  title,
  description,
  resources,
  createTo,
  createLabel,
}) => {
  const history = useHistory()
  const [tab, setTab] = useState(0)
  const availableResources = useMemo(
    () => resources.filter(Boolean),
    [resources]
  )
  const selected = availableResources[tab] ?? availableResources[0]
  const createCapability = useMemo(
    () => (createTo ? getCapabilityForPath(createTo) : undefined),
    [createTo]
  )
  const canCreate = useMemo(
    () =>
      Boolean(createTo) &&
      Boolean(createCapability) &&
      isCapabilityEnabled(createCapability, getCapabilityModel(endpoints)),
    [createCapability, createTo, endpoints]
  )

  return (
    <PageFrame
      title={title}
      description={description}
      actions={
        canCreate ? (
          <CreateButton onClick={() => history.push(createTo)}>
            {createLabel}
          </CreateButton>
        ) : null
      }
    >
      <Surface sx={{ mt: 3, overflow: 'hidden' }}>
        {availableResources.length > 1 && (
          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            aria-label={`${title} views`}
            sx={{
              px: 2,
              minHeight: 48,
              borderBottom: `1px solid ${colors.border}`,
              '& .MuiTabs-indicator': { backgroundColor: colors.brand.primary },
              '& .MuiTab-root': {
                minHeight: 48,
                textTransform: 'none',
                fontWeight: 650,
                color: colors.text.secondary,
              },
              '& .Mui-selected': {
                color: `${colors.brand.primary} !important`,
              },
            }}
          >
            {availableResources.map(({ label }) => (
              <Tab key={label} label={label} />
            ))}
          </Tabs>
        )}
        <Box
          sx={{
            p: { xs: 1.5, md: 2 },
            '& > *': { borderRadius: `${radius.sm}px` },
          }}
        >
          {selected && (
            <ResourceBridge
              endpoints={endpoints}
              legacyPath={selected.legacyPath}
              unavailableLabel={selected.unavailableLabel}
            />
          )}
        </Box>
      </Surface>
    </PageFrame>
  )
}

AreaPage.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  resources: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      legacyPath: PropTypes.string.isRequired,
      unavailableLabel: PropTypes.string,
    })
  ).isRequired,
  createTo: PropTypes.string,
  createLabel: PropTypes.string,
}

AreaPage.defaultProps = {
  endpoints: [],
  createLabel: 'Create',
}

export default AreaPage
