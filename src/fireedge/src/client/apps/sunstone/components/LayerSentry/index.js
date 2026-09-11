/* LayerSentry self-service presentation. SPDX-License-Identifier: Apache-2.0 */
import { Fragment, useEffect } from 'react'
import PropTypes from 'prop-types'
import { GlobalStyles, useTheme } from '@mui/material'
import { installScope } from './presentation'
import { appearanceCss } from './styles'
import { symbolPath } from './symbol'

/** Adds no wrapper DOM and never replaces/remounts the native page tree. */
export const SelfServiceAppearance = ({ enabled, children }) => {
  const theme = useTheme()
  const mode = theme.palette?.mode === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    return installScope(document.documentElement, mode)
  }, [enabled, mode])

  return (
    <Fragment>
      <GlobalStyles styles={enabled ? appearanceCss : {}} />
      {children}
    </Fragment>
  )
}

SelfServiceAppearance.propTypes = {
  enabled: PropTypes.bool.isRequired,
  children: PropTypes.node,
}

/** Original uploaded LayerSentry symbol; decorative inside the home link. */
export const LayerSentryLogo = ({ withText }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ls-logo, #000f42)' }}>
    <svg width="29" height="34" viewBox="0 0 460 536" aria-hidden="true" focusable="false">
      <path d={symbolPath} fill="currentColor" fillRule="evenodd" />
    </svg>
    {withText && (
      <span style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 17, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.5px' }}>
        LAYER<br />SENTRY
      </span>
    )}
  </span>
)

LayerSentryLogo.propTypes = { withText: PropTypes.bool }

/** This button changes presentation only, without reload or navigation. */
export const AppearanceSwitch = ({ enabled, expanded, onToggle, locked }) => (
  <button
    type="button"
    data-cy="layersentry-appearance-switch"
    disabled={locked}
    onClick={onToggle}
    title={locked ? 'Remove layersentry-ui=classic from the URL to enable the new appearance' : 'Change appearance only; your work stays open'}
    aria-label={enabled ? 'Use classic appearance' : 'Use LayerSentry appearance'}
    style={{ border: '1px solid currentColor', borderRadius: 8, background: 'transparent', color: 'inherit', padding: '7px 9px', font: 'inherit', fontSize: 11, cursor: locked ? 'not-allowed' : 'pointer' }}
  >
    {expanded ? (enabled ? 'Use classic appearance' : 'Use LayerSentry appearance') : 'UI'}
  </button>
)

AppearanceSwitch.propTypes = {
  enabled: PropTypes.bool.isRequired,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  locked: PropTypes.bool,
}
