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
  Avatar,
  Box,
  IconButton,
  InputBase,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  BellNotification,
  HeadsetHelp,
  Menu,
  NavArrowRight,
  Search,
  Settings,
} from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { useAuth, useViews } from '@FeaturesModule'
import { getNavigation } from 'client/apps/layersentry/navigation'
import {
  getCapabilityForPath,
  getCapabilityModel,
  getCapabilityState,
  isCapabilityVisible,
} from 'client/apps/layersentry/capabilities'
import { colors, radius } from 'client/apps/layersentry/theme/tokens'

const SIDEBAR_WIDTH = 264
const TOPBAR_HEIGHT = 64

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(([letter]) => letter)
    .join('')
    .toUpperCase() || 'U'

const roleLabel = (view) => {
  const labels = {
    admin: 'Platform Admin',
    groupadmin: 'Project Admin',
    user: 'User',
    cloud: 'Cloud User',
  }

  return labels[view] ?? 'User'
}

const NavItem = ({ item, active, onClick }) => {
  const Icon = item.icon

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        width: '100%',
        border: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1.05,
        borderRadius: `${radius.sm}px`,
        cursor: 'pointer',
        color: active ? colors.text.inverse : colors.sidebar.text,
        backgroundColor: active ? colors.brand.navyActive : 'transparent',
        '&:hover': {
          backgroundColor: active
            ? colors.brand.navyActive
            : colors.sidebar.hover,
        },
      }}
    >
      {Icon && <Icon width={19} height={19} />}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: active ? 700 : 550,
          flex: 1,
          textAlign: 'left',
        }}
      >
        {item.label}
      </Typography>
      {item.children && <NavArrowRight width={15} height={15} />}
    </Box>
  )
}

NavItem.propTypes = {
  item: PropTypes.object.isRequired,
  active: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
}

const PortalShell = ({ children }) => {
  const history = useHistory()
  const location = useLocation()
  const { view } = useViews()
  const { user, groups = [] } = useAuth()
  const [search, setSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const capabilityModel = useMemo(() => getCapabilityModel(), [])
  const navigation = useMemo(
    () => getNavigation(view, capabilityModel),
    [view, capabilityModel]
  )
  const pathCapability = useMemo(
    () => getCapabilityForPath(location.pathname),
    [location.pathname]
  )
  const pathCapabilityState = useMemo(
    () =>
      pathCapability
        ? getCapabilityState(pathCapability, capabilityModel)
        : undefined,
    [pathCapability, capabilityModel]
  )
  const capabilityAvailable =
    !pathCapability || isCapabilityVisible(pathCapability, capabilityModel)
  const groupName = useMemo(
    () => groups.find(({ ID }) => `${ID}` === `${user?.GID}`)?.NAME,
    [groups, user?.GID]
  )
  const userName = user?.NAME ?? 'User'
  const isActive = (path) =>
    location.pathname === path ||
    (path !== '/overview' && location.pathname.startsWith(`${path}/`))

  const navigate = (path) => {
    history.push(path)
    setMobileOpen(false)
  }

  const submitSearch = (event) => {
    if (event.key !== 'Enter' || !search.trim()) return
    navigate(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.text.primary,
      }}
    >
      {mobileOpen && (
        <Box
          role="presentation"
          onClick={() => setMobileOpen(false)}
          sx={{
            display: { xs: 'block', md: 'none' },
            position: 'fixed',
            inset: 0,
            zIndex: 1150,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
          }}
        />
      )}
      <Box
        component="aside"
        sx={{
          position: 'fixed',
          inset: '0 auto 0 0',
          width: SIDEBAR_WIDTH,
          backgroundColor: colors.brand.navy,
          color: colors.text.inverse,
          zIndex: 1200,
          display: { xs: mobileOpen ? 'flex' : 'none', md: 'flex' },
          flexDirection: 'column',
          boxShadow: { xs: '0 16px 40px rgba(15, 23, 42, 0.28)', md: 'none' },
        }}
      >
        <Box
          sx={{
            height: TOPBAR_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            px: 2.5,
            borderBottom: `1px solid ${colors.sidebar.border}`,
          }}
        >
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: `${radius.sm}px`,
              backgroundColor: colors.brand.primary,
              display: 'grid',
              placeItems: 'center',
              mr: 1.25,
              fontWeight: 800,
            }}
          >
            L
          </Box>
          <Box>
            <Typography
              sx={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              LayerSentry
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                color: colors.sidebar.muted,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Private Cloud
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2 }}>
          {navigation.map((section) => (
            <Box key={section.label} sx={{ mb: 2.25 }}>
              <Typography
                sx={{
                  px: 1.5,
                  mb: 0.75,
                  color: colors.sidebar.label,
                  fontSize: 10,
                  fontWeight: 750,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                }}
              >
                {section.label}
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.4 }}>
                {section.items.map((item) => (
                  <NavItem
                    key={item.path ?? item.label}
                    item={item}
                    active={isActive(item.path)}
                    onClick={() => navigate(item.path)}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ p: 1.5, borderTop: `1px solid ${colors.sidebar.border}` }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              px: 1,
              py: 0.75,
            }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: 12,
                backgroundColor: colors.brand.primary,
              }}
            >
              {initials(userName)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                noWrap
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colors.text.inverse,
                }}
              >
                {userName}
              </Typography>
              <Typography
                noWrap
                sx={{ fontSize: 10, color: colors.sidebar.muted }}
              >
                {roleLabel(view)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
      <Box
        component="header"
        sx={{
          position: 'fixed',
          top: 0,
          left: { xs: 0, md: SIDEBAR_WIDTH },
          right: 0,
          height: TOPBAR_HEIGHT,
          backgroundColor: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: { xs: 1.5, md: 3 },
        }}
      >
        <IconButton
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          sx={{
            display: { xs: 'inline-flex', md: 'none' },
            color: colors.text.primary,
          }}
        >
          <Menu width={21} height={21} />
        </IconButton>
        <Box
          sx={{
            flex: 1,
            maxWidth: 560,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.6,
            border: `1px solid ${colors.border}`,
            borderRadius: `${radius.sm}px`,
            backgroundColor: colors.surfaceMuted,
            '&:focus-within': {
              borderColor: colors.focus,
              boxShadow: `0 0 0 2px ${colors.status.infoSoft}`,
            },
          }}
        >
          <Search width={18} height={18} color={colors.text.muted} />
          <InputBase
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={submitSearch}
            placeholder="Search VMs, storage, networks..."
            inputProps={{ 'aria-label': 'Global search' }}
            sx={{ flex: 1, fontSize: 13, color: colors.text.primary }}
          />
        </Box>

        <Box
          sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <Tooltip title="Operations and alerts">
            <IconButton
              aria-label="Operations and alerts"
              onClick={() => navigate('/operations')}
              sx={{ color: colors.text.secondary }}
            >
              <BellNotification width={19} height={19} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Support">
            <IconButton
              aria-label="Support"
              onClick={() => navigate('/support')}
              sx={{ color: colors.text.secondary }}
            >
              <HeadsetHelp width={19} height={19} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton
              aria-label="Settings"
              onClick={() => navigate('/settings')}
              sx={{ color: colors.text.secondary }}
            >
              <Settings width={19} height={19} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Current project">
            <Box
              sx={{
                display: { xs: 'none', sm: 'block' },
                px: 1.25,
                py: 0.55,
                border: `1px solid ${colors.border}`,
                borderRadius: `${radius.sm}px`,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Typography
                sx={{
                  color: colors.text.muted,
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                }}
              >
                Project
              </Typography>
              <Typography
                sx={{
                  color: colors.text.primary,
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                {groupName ?? 'Default'}
              </Typography>
            </Box>
          </Tooltip>
          <Avatar
            sx={{
              display: { xs: 'none', sm: 'flex' },
              width: 34,
              height: 34,
              fontSize: 12,
              backgroundColor: colors.brand.primary,
            }}
          >
            {initials(userName)}
          </Avatar>
        </Box>
      </Box>
      <Box
        component="main"
        sx={{
          ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
          pt: `${TOPBAR_HEIGHT}px`,
          minHeight: '100vh',
        }}
      >
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1680, mx: 'auto' }}>
          {capabilityAvailable ? (
            children
          ) : (
            <Alert severity="warning" data-layersentry-capability-unavailable>
              <Typography sx={{ fontWeight: 750 }}>
                Capability unavailable
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: 13 }}>
                {pathCapabilityState?.reason ??
                  'This capability is not available in the current deployment.'}
              </Typography>
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  )
}

PortalShell.propTypes = {
  children: PropTypes.node,
}

export default PortalShell
