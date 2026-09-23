/* SPDX-License-Identifier: Apache-2.0 */
import React from 'react'
import ReactDOM from 'react-dom'
import { ThemeProvider, createTheme } from '@mui/material'
import {
  MemoryRouter,
  useLocation,
} from 'react-router-dom'
import PortalShell from '../../../src/client/apps/layersentry/components/PortalShell'
import CreatePage from '../../../src/client/apps/layersentry/pages/CreatePage'
import { CreateVm } from '../../../src/modules/containers/VirtualMachines/Create'

window.__MANOJ_VM_QA__ = {
  logoutCalls: 0,
  viewChanges: [],
  errors: [],
  infos: [],
  cloneRequests: [],
}

const LocationProbe = () => {
  const location = useLocation()
  return (
    <div
      data-testid="location-probe"
      style={{ position: 'fixed', left: -9999, top: -9999 }}
    >
      {location.pathname + location.search}
    </div>
  )
}

const endpoints = [{ path: '/vm/create', Component: CreateVm }]
const theme = createTheme()

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <MemoryRouter initialEntries={['/compute/create']}>
      <PortalShell endpoints={[]}>
        <CreatePage
          endpoints={endpoints}
          title="Create Virtual Machine"
          description="A guided VM workflow using approved images, sizing, storage, networks and security."
          legacyPath="/vm/create"
          returnTo="/compute"
          steps={[
            'Basics',
            'Operating System',
            'Size',
            'Storage',
            'Network',
            'Security',
            'Review',
          ]}
        />
        <LocationProbe />
      </PortalShell>
    </MemoryRouter>
  </ThemeProvider>,
  document.getElementById('root')
)
