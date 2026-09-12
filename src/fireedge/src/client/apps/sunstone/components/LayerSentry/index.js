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
import { Fragment, useEffect } from 'react'
import PropTypes from 'prop-types'
import { GlobalStyles, useTheme } from '@mui/material'
import { installScope } from './presentation'
import { appearanceCss } from './styles'
import { symbolPath } from './symbol'

/**
 * Add LayerSentry presentation without replacing the native page tree.
 *
 * @param {object} props - Component properties
 * @param {boolean} props.enabled - Whether LayerSentry presentation is active
 * @param {object} props.children - Native application tree
 * @returns {object} React element
 */
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

/**
 * Render the owner-supplied LayerSentry symbol inside the native home link.
 *
 * @param {object} props - Component properties
 * @param {boolean} props.withText - Whether the product name is rendered
 * @returns {object} React element
 */
export const LayerSentryLogo = ({ withText }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--ls-logo, #000f42)',
    }}
  >
    <svg
      width="29"
      height="34"
      viewBox="0 0 460 536"
      aria-hidden="true"
      focusable="false"
    >
      <path d={symbolPath} fill="currentColor" fillRule="evenodd" />
    </svg>
    {withText && (
      <span
        style={{
          fontFamily: 'Inter, "Segoe UI", sans-serif',
          fontSize: 17,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.5px',
        }}
      >
        LAYER
        <br />
        SENTRY
      </span>
    )}
  </span>
)

LayerSentryLogo.propTypes = { withText: PropTypes.bool }

/**
 * Change presentation only, without reload or navigation.
 *
 * @param {object} props - Component properties
 * @param {boolean} props.enabled - Whether LayerSentry presentation is active
 * @param {boolean} props.expanded - Whether the sidebar is expanded
 * @param {Function} props.onToggle - Presentation toggle callback
 * @param {boolean} props.locked - Whether the URL override locks the switch
 * @returns {object} React element
 */
export const AppearanceSwitch = ({ enabled, expanded, onToggle, locked }) => (
  <button
    type="button"
    data-cy="layersentry-appearance-switch"
    disabled={locked}
    onClick={onToggle}
    title={
      locked
        ? 'Remove layersentry-ui=classic from the URL to enable the new appearance'
        : 'Change appearance only; your work stays open'
    }
    aria-label={
      enabled ? 'Use classic appearance' : 'Use LayerSentry appearance'
    }
    style={{
      border: '1px solid currentColor',
      borderRadius: 8,
      background: 'transparent',
      color: 'inherit',
      padding: '7px 9px',
      font: 'inherit',
      fontSize: 11,
      cursor: locked ? 'not-allowed' : 'pointer',
    }}
  >
    {expanded
      ? enabled
        ? 'Use classic appearance'
        : 'Use LayerSentry appearance'
      : 'UI'}
  </button>
)

AppearanceSwitch.propTypes = {
  enabled: PropTypes.bool.isRequired,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  locked: PropTypes.bool,
}
