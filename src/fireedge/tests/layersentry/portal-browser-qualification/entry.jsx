/* SPDX-License-Identifier: Apache-2.0 */
import React from 'react'
import ReactDOM from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Radio,
  LinearProgress,
  Link,
  Pagination,
  Slider,
  Tab,
  Tabs,
  ToggleButton,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  ThemeProvider,
  createTheme,
} from '@mui/material'
import PortalShell from '../../../src/client/apps/layersentry/components/PortalShell'
import {
  PageFrame,
  StatusPill,
  Surface,
} from '../../../src/client/apps/layersentry/components/Primitives'

window.__LAYERSENTRY_BROWSER_QA__ = {
  logoutCalls: 0,
  viewChanges: [],
}

const Content = () => (
  <PageFrame
    title="LayerSentry browser qualification"
    description="Simple, uniform customer workflow."
  >
    <Surface sx={{ mt: 2, p: 2.5 }} data-testid="qa-surface">
      <Box sx={{ display: 'grid', gap: 2 }}>
        <TextField
          label="Service name"
          helperText="LayerSentry-managed service"
          defaultValue="payments-db"
          data-testid="qa-input"
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" data-testid="qa-primary">
            Create
          </Button>
          <Button variant="outlined" data-testid="qa-outlined">
            Review
          </Button>
          <StatusPill label="Ready" tone="success" />
        </Box>
        <FormControlLabel
          control={<Switch defaultChecked data-testid="qa-switch" />}
          label="Advanced options"
        />
        <FormControlLabel
          control={<Checkbox defaultChecked data-testid="qa-checkbox" />}
          label="Enable backup"
        />
        <FormControlLabel
          control={<Radio defaultChecked data-testid="qa-radio" />}
          label="Preferred"
        />
        <Tabs value={0} data-testid="qa-tabs">
          <Tab label="Overview" />
          <Tab label="Details" />
        </Tabs>
        <LinearProgress variant="determinate" value={40} data-testid="qa-progress" />
        <Pagination count={3} page={2} data-testid="qa-pagination" />
        <ToggleButton value="grid" selected data-testid="qa-toggle">
          Grid
        </ToggleButton>
        <Slider defaultValue={40} data-testid="qa-slider" />
        <Link href="#details" data-testid="qa-link">
          View details
        </Link>
        <Stepper activeStep={1} data-testid="qa-stepper">
          <Step completed>
            <StepLabel>Basics</StepLabel>
          </Step>
          <Step>
            <StepLabel>Review</StepLabel>
          </Step>
        </Stepper>
      </Box>
    </Surface>
  </PageFrame>
)

const theme = createTheme()

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <MemoryRouter initialEntries={['/overview']}>
      <PortalShell endpoints={[]}>
        <Content />
      </PortalShell>
    </MemoryRouter>
  </ThemeProvider>,
  document.getElementById('root')
)
