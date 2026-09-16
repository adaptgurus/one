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
import { Box, Button, Menu, MenuItem, Typography } from '@mui/material'
import { Cloud, Group, NavArrowDown, User } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import {
  AuthAPI,
  SystemAPI,
  ZoneAPI,
  useAuth,
  useAuthApi,
  useFunctionalityApi,
  useGeneral,
  useGeneralApi,
  useViews,
} from '@FeaturesModule'
import { FILTER_POOL } from '@ConstantsModule'
import { colors, radius } from 'client/apps/layersentry/theme/tokens'

const ROLE_LABELS = {
  admin: 'Platform Admin',
  groupadmin: 'Project Admin',
  user: 'User',
  cloud: 'Cloud User',
}

const ContextMenu = ({
  dataCy,
  disabled,
  icon: Icon,
  label,
  onSelect,
  options,
  value,
}) => {
  const [anchorEl, setAnchorEl] = useState(null)
  const current = options.find(({ id }) => `${id}` === `${value}`)
  const canSwitch = options.length > 1 && !disabled

  return (
    <>
      <Button
        data-cy={dataCy}
        disabled={!canSwitch}
        endIcon={canSwitch ? <NavArrowDown width={14} /> : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        startIcon={<Icon width={16} />}
        sx={{
          minWidth: 118,
          justifyContent: 'flex-start',
          px: 1.1,
          py: 0.55,
          border: `1px solid ${colors.border}`,
          borderRadius: `${radius.sm}px`,
          color: colors.text.primary,
          backgroundColor: colors.surfaceMuted,
          textTransform: 'none',
          '&.Mui-disabled': {
            color: colors.text.primary,
            opacity: 1,
          },
        }}
      >
        <Box sx={{ minWidth: 0, textAlign: 'left' }}>
          <Typography
            sx={{
              color: colors.text.muted,
              fontSize: 8,
              fontWeight: 750,
              lineHeight: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </Typography>
          <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, mt: 0.15 }}>
            {current?.label ?? 'Default'}
          </Typography>
        </Box>
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        MenuListProps={{ dense: true }}
      >
        {options.map((option) => (
          <MenuItem
            key={option.id}
            selected={`${option.id}` === `${value}`}
            onClick={() => {
              setAnchorEl(null)
              onSelect(option.id)
            }}
            sx={{ minWidth: 210, fontSize: 12.5 }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

ContextMenu.propTypes = {
  dataCy: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      label: PropTypes.string,
    })
  ).isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

const ProjectSelector = () => {
  const history = useHistory()
  const { groups = [], user } = useAuth()
  const { setSelectedItems } = useFunctionalityApi()
  const [changeGroup, { isLoading }] = AuthAPI.useChangeAuthGroupMutation()
  const options = useMemo(
    () => groups.map(({ ID, NAME }) => ({ id: ID, label: NAME })),
    [groups]
  )

  const handleSelect = async (group) => {
    if (`${group}` === `${user?.GID}`) return
    await changeGroup({ group }).unwrap()
    setSelectedItems([])
    history.push('/overview')
  }

  return (
    <ContextMenu
      dataCy="layersentry-project-selector"
      disabled={isLoading}
      icon={Group}
      label="Project"
      onSelect={handleSelect}
      options={options}
      value={user?.GID}
    />
  )
}

const ScopeSelector = () => {
  const history = useHistory()
  const { filterPool, user } = useAuth()
  const { setSelectedItems } = useFunctionalityApi()
  const [changeGroup, { isLoading }] = AuthAPI.useChangeAuthGroupMutation()
  const {
    ALL_RESOURCES,
    PRIMARY_GROUP_RESOURCES,
    USER_GROUPS_RESOURCES,
    USER_RESOURCES,
  } = FILTER_POOL
  const options = [
    { id: user?.GID, label: 'Current project' },
    { id: USER_RESOURCES, label: 'My resources' },
    { id: USER_GROUPS_RESOURCES, label: 'My resources & projects' },
    { id: ALL_RESOURCES, label: 'All visible resources' },
  ].filter(({ id }) => id !== undefined)
  const selected =
    !filterPool || filterPool === PRIMARY_GROUP_RESOURCES
      ? user?.GID
      : filterPool

  const handleSelect = async (scope) => {
    if (`${scope}` === `${selected}`) return
    await changeGroup({ group: scope }).unwrap()
    setSelectedItems([])
    history.push('/overview')
  }

  return (
    <ContextMenu
      dataCy="layersentry-scope-selector"
      disabled={isLoading}
      icon={Group}
      label="Scope"
      onSelect={handleSelect}
      options={options}
      value={selected}
    />
  )
}

const ZoneSelector = () => {
  const history = useHistory()
  const { data: zones = [], isLoading } = ZoneAPI.useGetZonesQuery()
  const { zone } = useGeneral()
  const { changeZone } = useGeneralApi()
  const options = useMemo(
    () => zones.map(({ ID, NAME }) => ({ id: ID, label: NAME })),
    [zones]
  )

  const handleSelect = (nextZone) => {
    if (`${nextZone}` === `${zone}`) return
    changeZone(parseInt(nextZone, 10))
    history.push('/overview')
  }

  return (
    <ContextMenu
      dataCy="layersentry-zone-selector"
      disabled={isLoading}
      icon={Cloud}
      label="Zone"
      onSelect={handleSelect}
      options={options}
      value={zone}
    />
  )
}

const ViewSelector = () => {
  const history = useHistory()
  const { view, views = {} } = useViews()
  const { changeView } = useAuthApi()
  const { data: definitions = [] } =
    SystemAPI.useGetSunstoneAvailableViewsQuery()
  const options = useMemo(() => {
    const names = new Map(
      definitions.map((definition) => [
        definition.type ?? definition.name,
        definition.name,
      ])
    )

    return Object.keys(views).map((name) => ({
      id: name,
      label:
        ROLE_LABELS[name] ??
        String(names.get(name) ?? name).replace(/\s+view$/i, ''),
    }))
  }, [definitions, views])

  const handleSelect = (nextView) => {
    if (!nextView || nextView === view) return
    changeView(nextView)
    history.push('/overview')
  }

  return (
    <ContextMenu
      dataCy="layersentry-view-selector"
      icon={User}
      label="View"
      onSelect={handleSelect}
      options={options}
      value={view}
    />
  )
}

const ContextSelectors = ({ mobile = false }) => (
  <Box
    data-layersentry-context-selectors
    sx={{
      display: mobile ? { xs: 'grid', md: 'none' } : { xs: 'none', lg: 'flex' },
      alignItems: 'center',
      gap: 0.75,
      ...(mobile && { width: '100%', '& .MuiButton-root': { width: '100%' } }),
    }}
  >
    <ProjectSelector />
    <ScopeSelector />
    <ZoneSelector />
    <ViewSelector />
  </Box>
)

ContextSelectors.propTypes = { mobile: PropTypes.bool }

export default ContextSelectors
