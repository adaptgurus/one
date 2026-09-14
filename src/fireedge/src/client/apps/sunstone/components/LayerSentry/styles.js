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

// Deliberately no layout positioning, visibility, pointer-event, dimensions,
// overflow, z-index or transform overrides on native components. Those belong
// to OpenNebula's layout, dialogs, virtual tables and console transports.
export const appearanceCss = `
html[data-layersentry-self-service="light"] {
  --ls-canvas: #f5f7fb;
  --ls-surface: #ffffff;
  --ls-line: #e3e8f1;
  --ls-primary: #304fda;
  --ls-selected: #edf1ff;
  --ls-ink: #17253f;
  --ls-muted: #58677e;
  --ls-logo: #000f42;
}
html[data-layersentry-self-service="dark"] {
  --ls-canvas: #101827;
  --ls-surface: #172238;
  --ls-line: #35435b;
  --ls-primary: #a7b7ff;
  --ls-selected: #25375a;
  --ls-ink: #eef2fa;
  --ls-muted: #bdc9dd;
  --ls-logo: #eef2fa;
}
html[data-layersentry-self-service] body {
  background-color: var(--ls-canvas);
}
html[data-layersentry-self-service] [data-cy="sidebar-paper"] {
  background-color: var(--ls-surface);
  border-right-color: var(--ls-line);
}
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-header,
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-footer {
  border-color: var(--ls-line);
}
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-item > .container {
  border-radius: 8px;
}
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-item > .container.selected {
  background-color: var(--ls-selected);
  box-shadow: inset 3px 0 0 var(--ls-primary);
}
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-item > .container.selected .title,
html[data-layersentry-self-service] [data-cy="sidebar"] .sidebar-item > .container.selected .icon {
  color: var(--ls-primary);
}
html[data-layersentry-self-service] .MuiPaper-rounded {
  border-radius: 12px;
}
html[data-layersentry-self-service] .MuiButton-root {
  border-radius: 8px;
}
html[data-layersentry-self-service] .MuiOutlinedInput-notchedOutline {
  border-radius: 8px;
}
html[data-layersentry-self-service] .MuiButton-containedPrimary {
  background-color: #304fda;
  color: #ffffff;
}
html[data-layersentry-self-service] .MuiButton-containedPrimary:hover {
  background-color: #2440bc;
}
html[data-layersentry-self-service] .MuiButton-containedPrimary.Mui-disabled {
  background-color: var(--ls-line);
  color: var(--ls-muted);
}
html[data-layersentry-self-service] .MuiTab-root.Mui-selected {
  color: var(--ls-primary);
}
html[data-layersentry-self-service] .MuiTabs-indicator {
  background-color: var(--ls-primary);
}
html[data-layersentry-self-service] .dashboard-resource-card,
html[data-layersentry-self-service] .dashboard-chart-card,
html[data-layersentry-self-service] .dashboard-capacity-card,
html[data-layersentry-self-service] .dashboard-panel {
  border-radius: 13px;
  border-color: var(--ls-line);
  background-color: var(--ls-surface);
}
html[data-layersentry-self-service] .dashboard-header {
  border-radius: 13px;
}
html[data-layersentry-self-service] :is(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 3px solid var(--ls-primary);
  outline-offset: 3px;
}
`
