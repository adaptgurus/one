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
import { Box, Button, Chip, Typography } from '@mui/material'
import { Plus, RefreshDouble } from 'iconoir-react'
import { colors, radius, spacing } from 'client/apps/layersentry/theme/tokens'

export const Surface = ({ children, sx = {}, ...props }) => (
  <Box
    {...props}
    sx={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: `${radius.md}px`,
      boxShadow: colors.shadow.surface,
      ...sx,
    }}
  >
    {children}
  </Box>
)

Surface.propTypes = {
  children: PropTypes.node,
  sx: PropTypes.object,
}

export const PageFrame = ({ title, description, actions, children }) => (
  <Box sx={{ width: '100%' }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', md: 'center' },
        justifyContent: 'space-between',
        gap: spacing.lg,
        mb: spacing.xl / 8,
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      {' '}
      <Box>
        <Typography
          component="h1"
          sx={{
            color: colors.text.primary,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography
            sx={{ color: colors.text.secondary, fontSize: 14, mt: 0.75 }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
    {children}
  </Box>
)

PageFrame.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  actions: PropTypes.node,
  children: PropTypes.node,
}

export const PrimaryButton = ({ children, startIcon, ...props }) => (
  <Button
    variant="contained"
    disableElevation
    startIcon={startIcon}
    {...props}
    sx={{
      textTransform: 'none',
      fontWeight: 650,
      borderRadius: `${radius.sm}px`,
      backgroundColor: colors.brand.primary,
      '&:hover': { backgroundColor: colors.brand.primaryHover },
      ...(props.sx ?? {}),
    }}
  >
    {children}
  </Button>
)
PrimaryButton.propTypes = {
  children: PropTypes.node,
  startIcon: PropTypes.node,
  sx: PropTypes.object,
}

export const CreateButton = ({ children = 'Create', ...props }) => (
  <PrimaryButton startIcon={<Plus width={18} height={18} />} {...props}>
    {children}
  </PrimaryButton>
)

CreateButton.propTypes = {
  children: PropTypes.node,
}

export const RefreshButton = ({ onClick, disabled = false }) => (
  <Button
    variant="outlined"
    onClick={onClick}
    disabled={disabled}
    startIcon={<RefreshDouble width={18} height={18} />}
    sx={{
      textTransform: 'none',
      borderColor: colors.borderStrong,
      color: colors.text.primary,
      borderRadius: `${radius.sm}px`,
    }}
  >
    Refresh
  </Button>
)

RefreshButton.propTypes = {
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
}
export const MetricCard = ({ label, value, detail, icon: Icon, accent }) => (
  <Surface sx={{ p: 2.25, minHeight: 128 }}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      <Box>
        <Typography
          sx={{ color: colors.text.muted, fontSize: 12, fontWeight: 650 }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            color: colors.text.primary,
            fontSize: 30,
            fontWeight: 700,
            mt: 0.5,
          }}
        >
          {value}
        </Typography>
      </Box>
      {Icon && (
        <Box
          sx={{
            color: accent ?? colors.brand.primary,
            p: 1,
            backgroundColor: colors.surfaceAlt,
            borderRadius: `${radius.sm}px`,
          }}
        >
          <Icon width={22} height={22} />
        </Box>
      )}
    </Box>
    {detail && (
      <Typography sx={{ color: colors.text.secondary, fontSize: 12, mt: 1 }}>
        {detail}
      </Typography>
    )}
  </Surface>
)

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  detail: PropTypes.string,
  icon: PropTypes.elementType,
  accent: PropTypes.string,
}

export const StatusPill = ({ label, tone = 'info' }) => {
  const palette = {
    success: [colors.status.success, colors.status.successSoft],
    warning: [colors.status.warning, colors.status.warningSoft],
    danger: [colors.status.danger, colors.status.dangerSoft],
    info: [colors.status.info, colors.status.infoSoft],
  }
  const [foreground, background] = palette[tone] ?? palette.info

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        color: foreground,
        backgroundColor: background,
        fontWeight: 650,
        borderRadius: `${radius.sm}px`,
      }}
    />
  )
}
StatusPill.propTypes = {
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['success', 'warning', 'danger', 'info']),
}

export const SectionHeader = ({ title, description, action }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 2,
      mb: 1.5,
    }}
  >
    <Box>
      <Typography
        sx={{ color: colors.text.primary, fontSize: 16, fontWeight: 700 }}
      >
        {title}
      </Typography>
      {description && (
        <Typography sx={{ color: colors.text.muted, fontSize: 12, mt: 0.25 }}>
          {description}
        </Typography>
      )}
    </Box>
    {action}
  </Box>
)

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
}

export const EmptyState = ({ title, description, action }) => (
  <Surface sx={{ p: 4, textAlign: 'center' }}>
    <Typography sx={{ color: colors.text.primary, fontWeight: 700 }}>
      {title}
    </Typography>
    {description && (
      <Typography
        sx={{
          color: colors.text.secondary,
          fontSize: 13,
          mt: 0.75,
          mb: action ? 2 : 0,
        }}
      >
        {description}
      </Typography>
    )}
    {action}
  </Surface>
)

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
}
