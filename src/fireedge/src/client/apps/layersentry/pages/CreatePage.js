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
import { Box, Button } from '@mui/material'
import { NavArrowLeft } from 'iconoir-react'
import { useHistory } from 'react-router-dom'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
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
}) => {
  const history = useHistory()

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
      <Surface sx={{ mt: 3, p: { xs: 1.5, md: 2.5 } }}>
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
}

CreatePage.defaultProps = { endpoints: [] }

export default CreatePage
