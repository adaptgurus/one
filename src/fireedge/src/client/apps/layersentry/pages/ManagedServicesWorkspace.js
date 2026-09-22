/* ------------------------------------------------------------------------- *
 * Copyright 2002-2026, OpenNebula Project, OpenNebula Systems               *
 * ------------------------------------------------------------------------- */
/* eslint-disable jsdoc/require-jsdoc */
import PropTypes from 'prop-types'
import { Box, Button, Chip, TextField, Typography } from '@mui/material'
import { Db, NavArrowRight, Packages } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { PageFrame, Surface } from 'client/apps/layersentry/components/Primitives'
import { FALLBACK_BLUEPRINTS } from 'client/apps/layersentry/serviceBlueprints'
import { colors } from 'client/apps/layersentry/theme/tokens'

const DATABASE_CATEGORY = 'Databases & Data'

const isDbaas = ({ category }) => category === DATABASE_CATEGORY
const isApaas = (blueprint) => !isDbaas(blueprint)

const ManagedServicesWorkspace = ({ mode }) => {
  const history = useHistory()
  const [search, setSearch] = useState('')
  const dbaas = mode === 'dbaas'
  const title = dbaas ? 'DBaaS' : 'APaaS'
  const subtitle = dbaas
    ? 'Managed database and data services with application-specific HA, storage, backup, DR and security workflows.'
    : 'Managed messaging, web, application, DevOps, search and observability services with application-specific workflows.'
  const predicate = dbaas ? isDbaas : isApaas
  const services = useMemo(
    () =>
      FALLBACK_BLUEPRINTS.filter(predicate).filter((item) => {
        const needle = search.trim().toLowerCase()
        if (!needle) return true

        return [item.name, item.category, item.description, ...(item.workloads || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      }),
    [dbaas, search]
  )

  const configure = (blueprint) => {
    const returnTo = dbaas ? '/dbaas' : '/apaas'
    history.push(
      '/applications/deploy?blueprint=' +
        encodeURIComponent(blueprint.id) +
        '&return=' +
        encodeURIComponent(returnTo)
    )
  }

  return (
    <PageFrame
      title={title}
      description={subtitle}
      actions={
        <Chip
          label={services.length + ' services'}
          variant="outlined"
          sx={{ fontWeight: 700 }}
        />
      }
    >
      <Surface sx={{ mt: 2, p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: { xs: 'stretch', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
              {dbaas ? 'Database service catalog' : 'Application service catalog'}
            </Typography>
            <Typography sx={{ mt: 0.35, fontSize: 12, color: colors.text.secondary }}>
              Choose a service to open its LayerSentry production workflow. The
              wizard validates topology, VM footprint, storage, dependencies,
              DNS, proxy, credentials, backup and recovery before deployment.
            </Typography>
          </Box>
          <TextField
            size="small"
            label={'Search ' + title}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: { xs: '100%', md: 320 } }}
          />
        </Box>
      </Surface>

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            xl: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 1.5,
        }}
      >
        {services.map((service) => {
          const Icon = dbaas ? Db : Packages

          return (
            <Surface
              key={service.id}
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 248,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 1.5,
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: colors.status.infoSoft,
                    color: colors.brand.primary,
                    fontSize: 11,
                    fontWeight: 850,
                  }}
                >
                  {service.icon || <Icon width={18} height={18} />}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 850 }}>
                    {service.name}
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 11, color: colors.text.muted }}>
                    {service.category}
                  </Typography>
                </Box>
              </Box>

              <Typography
                sx={{ mt: 1.4, fontSize: 12, color: colors.text.secondary, flex: 1 }}
              >
                {service.description}
              </Typography>

              <Box sx={{ mt: 1.3, display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                {(service.versions || []).slice(0, 3).map((version) => (
                  <Chip key={version} label={version} size="small" variant="outlined" />
                ))}
                {service.recommendedTopology && (
                  <Chip
                    label={service.recommendedTopology}
                    size="small"
                    sx={{ maxWidth: '100%' }}
                  />
                )}
              </Box>

              <Button
                variant="contained"
                endIcon={<NavArrowRight width={16} height={16} />}
                onClick={() => configure(service)}
                sx={{ mt: 1.6, textTransform: 'none', alignSelf: 'flex-start' }}
              >
                Configure & Install
              </Button>
            </Surface>
          )
        })}
      </Box>
    </PageFrame>
  )
}

ManagedServicesWorkspace.propTypes = {
  mode: PropTypes.oneOf(['dbaas', 'apaas']).isRequired,
}

export default ManagedServicesWorkspace
