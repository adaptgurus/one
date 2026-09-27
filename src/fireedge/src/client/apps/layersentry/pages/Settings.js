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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material'
import { Settings as LuxonSettings } from 'luxon'
import { useState } from 'react'
import { useViews } from '@FeaturesModule'
import ResourceBridge from 'client/apps/layersentry/components/ResourceBridge'
import {
  PageFrame,
  SectionHeader,
  Surface,
} from 'client/apps/layersentry/components/Primitives'
import { colors } from 'client/apps/layersentry/theme/tokens'
import {
  DEFAULT_LAYERSENTRY_TIMEZONE,
  LAYERSENTRY_TIMEZONE_KEY,
  normalizeProductTimezone,
} from 'client/apps/layersentry/timezone'

const TIMEZONES = Object.freeze([
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
])

const SettingsPage = ({ endpoints }) => {
  const { view } = useViews()
  const isPlatformAdmin = view === 'admin'
  const [timezone, setTimezone] = useState(() =>
    normalizeProductTimezone(
      window.localStorage.getItem(LAYERSENTRY_TIMEZONE_KEY) ||
        DEFAULT_LAYERSENTRY_TIMEZONE
    )
  )

  const updateTimezone = (event) => {
    const value = normalizeProductTimezone(event.target.value)
    window.localStorage.setItem(LAYERSENTRY_TIMEZONE_KEY, value)
    LuxonSettings.defaultZone = value
    setTimezone(value)
  }

  const settings = [
    {
      title: 'Password & TOTP',
      description:
        'Change your password and manage mandatory interactive-login verification through the authorized account workflow below.',
      status: 'Account scoped',
    },
    {
      title: 'Time & Locale',
      description:
        'Display timestamps in your selected timezone. Durable operation and audit timestamps remain stored in UTC.',
      status: 'User preference',
    },
    ...(isPlatformAdmin
      ? [
          {
            title: 'Identity Providers',
            description:
              'AD/LDAP and trusted-gateway OIDC remain unavailable until their TLS, mapping, logout and IDOR gates are qualified.',
            status: 'Qualification required',
          },
          {
            title: 'Proxy & Notifications',
            description:
              'Site proxy credentials and notification delivery require secret-safe server configuration and connectivity validation.',
            status: 'Qualification required',
          },
        ]
      : []),
  ]

  return (
    <PageFrame
      title="Settings"
      description="Account preferences and LayerSentry product settings."
    >
      <Grid container spacing={2} sx={{ mt: 1 }}>
        {settings.map(({ title, description, status }) => (
          <Grid item xs={12} md={6} key={title}>
            <Surface sx={{ height: '100%', p: 2.5 }}>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 750,
                  color: colors.text.primary,
                }}
              >
                {title}
              </Typography>
              <Typography
                sx={{ mt: 0.75, fontSize: 13, color: colors.text.secondary }}
              >
                {description}
              </Typography>
              <Typography
                sx={{
                  mt: 1.5,
                  fontSize: 11,
                  fontWeight: 750,
                  color: colors.text.muted,
                }}
              >
                {status.toUpperCase()}
              </Typography>
            </Surface>
          </Grid>
        ))}
      </Grid>

      <Surface sx={{ mt: 2, p: 2.5 }}>
        <SectionHeader
          title="Timezone"
          description="Choose how LayerSentry displays timestamps. Audit and operation records remain stored in UTC."
        />
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel>Display timezone</InputLabel>
          <Select
            label="Display timezone"
            value={timezone}
            onChange={updateTimezone}
          >
            {TIMEZONES.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Surface>

      <Surface sx={{ mt: 2, p: 2 }}>
        <SectionHeader
          title="Account preferences"
          description="Only controls authorized for this account and deployment are rendered."
        />
        <ResourceBridge endpoints={endpoints} legacyPath="/settings" />
      </Surface>

      {isPlatformAdmin && (
        <Surface sx={{ mt: 2, p: 2.5 }}>
          <SectionHeader
            title="Advanced administration"
            description="Provider-native consoles are not part of the normal LayerSentry product surface."
          />
          <Alert
            severity="info"
            data-layersentry-native-console-hidden
            sx={{ color: colors.text.primary }}
          >
            Use the owning LayerSentry Infrastructure, Access, Protection and
            Operations workspaces. Engineering recovery access is intentionally
            outside this customer/admin portal.
          </Alert>
        </Surface>
      )}
    </PageFrame>
  )
}

SettingsPage.propTypes = { endpoints: PropTypes.arrayOf(PropTypes.object) }
SettingsPage.defaultProps = { endpoints: [] }

export default SettingsPage
