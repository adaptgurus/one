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
import { Box, Button, Typography } from '@mui/material'
import { NavArrowLeft } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import ProductionServiceWizard from 'client/apps/layersentry/pages/ProductionServiceWizard'
import {
  PageFrame,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const CreatePage = ({
  endpoints,
  title,
  description,
  legacyPath,
  returnTo,
  steps = ['Basics', 'Configuration', 'Optional features', 'Review', 'Create'],
}) => {
  const history = useHistory()

  if (legacyPath === '/service-template/instantiate/') {
    return <ProductionServiceWizard />
  }

  return (
    <PageFrame
      title={title}
      description={description}
      actions={
        <Button
          variant="text"
          startIcon={<NavArrowLeft width={18} height={18} />}
          onClick={() => history.push(returnTo)}
          sx={{ textTransform: 'none', color: colors.text.secondary }}
        >
          Back
        </Button>
      }
    >
      <Box
        data-layersentry-workflow-steps
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: `repeat(${steps.length}, 1fr)`,
          },
          gap: 1,
          mt: 3,
        }}
      >
        {steps.map((step, index) => (
          <Box
            key={step}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.25,
              border: `1px solid ${colors.border}`,
              borderRadius: 1.5,
              backgroundColor:
                index === 0 ? colors.status.infoSoft : colors.surface,
            }}
          >
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 800,
                color:
                  index === 0 ? colors.text.inverse : colors.text.secondary,
                backgroundColor:
                  index === 0 ? colors.brand.primary : colors.surfaceAlt,
              }}
            >
              {index + 1}
            </Box>
            <Typography
              sx={{ fontSize: 12, fontWeight: 650, color: colors.text.primary }}
            >
              {step}
            </Typography>
          </Box>
        ))}
      </Box>
      <Surface sx={{ mt: 2, p: { xs: 1.5, md: 2.5 } }}>
        <Box data-layersentry-guided-create>
          <ResourceBridge
            endpoints={endpoints}
            legacyPath={legacyPath}
            unavailableLabel="Creation is not permitted for your current role or the backend capability is unavailable."
          />
        </Box>
      </Surface>
    </PageFrame>
  )
}

CreatePage.propTypes = {
  endpoints: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  legacyPath: PropTypes.string.isRequired,
  returnTo: PropTypes.string.isRequired,
  steps: PropTypes.arrayOf(PropTypes.string),
}

CreatePage.defaultProps = { endpoints: [] }

export default CreatePage
