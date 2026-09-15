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
import { ArrowTrSquare } from 'iconoir-react'
import { APP_URL } from '@ConstantsModule'
import { useViews } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'

const SettingsPage = ({ endpoints }) => {
  const { view } = useViews()
  const isPlatformAdmin = view === 'admin'
  const openNative = () =>
    window.open(
      `${window.location.origin}${APP_URL}/sunstone/dashboard?native=1`,
      '_blank',
      'noopener,noreferrer'
    )

  return (
    <PageFrame
      title="Settings"
      description="Account preferences and LayerSentry product settings."
    >
      <Surface sx={{ mt: 3, p: 2 }}>
        <ResourceBridge endpoints={endpoints} legacyPath="/settings" />
      </Surface>

      {isPlatformAdmin && (
        <Surface sx={{ mt: 2, p: 2.5 }}>
          <SectionHeader
            title="Advanced tools"
            description="Use the native OpenNebula administration interface only for advanced troubleshooting."
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: colors.text.primary,
                }}
              >
                Native Sunstone
              </Typography>
              <Typography
                sx={{ fontSize: 12, color: colors.text.secondary, mt: 0.25 }}
              >
                Opens in a separate tab. This option is hidden from normal
                customer roles.
              </Typography>
            </Box>
            <Button
              variant="outlined"
              endIcon={<ArrowTrSquare width={17} height={17} />}
              onClick={openNative}
              sx={{
                textTransform: 'none',
                borderColor: colors.borderStrong,
                color: colors.text.primary,
              }}
            >
              Open native interface
            </Button>
          </Box>
        </Surface>
      )}
    </PageFrame>
  )
}

SettingsPage.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
SettingsPage.defaultProps = { endpoints: [] }

export default SettingsPage
