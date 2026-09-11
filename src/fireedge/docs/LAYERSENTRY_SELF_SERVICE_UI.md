# LayerSentry native self-service presentation

## What this change implements

This is a bounded first integration of the approved LayerSentry v5 **visual design into native FireEdge**, not a copy of the standalone preview application. It keeps the existing native page components, dialogs, resource forms, subscriptions, routes, state mapping and action handlers. Only authenticated `cloud` view gets the appearance. `admin`, `user`, `groupadmin`, login and layout-free Guacamole routes retain the previous appearance.

The customer receives the supplied LayerSentry symbol, wordmark, light/dark palette, selected-navigation treatment, rounded controls/cards and stronger keyboard focus. Friendly navigation copy is applied **after** native view filtering and only for display. Existing translated labels take precedence. Original titles and data-cy IDs are retained. Unknown extension routes and hidden routes are preserved; nothing is removed, reordered, promoted or newly authorized.

The main native Router still receives the original `endpoints` value. Existing VM creation, VNC/SSH/RDP paths, GPU/disk/NIC controls, snapshot/backup actions, OneKS, OneFlow, user menus and notifications are neither replaced nor reimplemented. Availability continues to depend on the existing view, permissions, configured native services and runtime capabilities.

## Scope and evidence pins

- Repository: `adaptgurus/one`.
- Parent branch: `layersentry/p1-rke2-provisioning`.
- Reviewed parent commit: `6746b9e22d63a0d7ef64154fd22a8161087e7b68` (parent is OpenNebula release-7.4.1).
- Central engineering reference: `adaptgurus/codexagentlogic`, observed `9e58d78d6bfaaa923d24fb8b4912ae24e43dc0f7`; current AGENTS and STATUS retrieved before edits.
- Visual reference: the owner's uploaded `LayerSentry-Self-Service-Portal-v5-Source.zip`.
- Symbol: the exact path data from that archive's `assets/layer-sentry-icon.svg`. The wordmark is rendered as text. The supplied brand is not an upstream OpenNebula trademark.
- No API/server/configuration/permission/manifest/dependency-lock change. No native view actions are enabled or disabled. No backend or administrator page is rewritten.

The three existing source edits are `_app.js`, `Sidebar/Default/index.js` and `Sidebar/Default/sidebarItem.js`. New product code stays under `client/apps/sunstone/components/LayerSentry`. The two shared Sidebar additions are optional presentation slots and an optional display label; all other callers get the original defaults.

## Native integration is not prototype simulation

The v5 mock resources, local account/session model, request rehearsals, fake operation outcomes and workspace imports are intentionally **not** imported. This avoids replacing real inventory and authorization with browser demo data.

This patch does not add a native DR policy editor, retained-history service, per-cluster Helm installer, notification transport, Grafana access service, or the prototype's request database. It does not enable missing tabs from the preview. The prior requested DC/DR retention counts and recovery-IP/VLAN plans remain product requirements for a separate, API-mapped feature change; a color/branding patch cannot safely activate them. Do not advertise full v5 workflow parity or mark the 208-item native acceptance register complete.

## Rollback without losing an open form

The self-service sidebar has **Use classic appearance**. It changes only the product appearance preference; it does not navigate, reload, change the active view, or remount the native Router/ModalHost. The reverse switch restores LayerSentry styling. The preference uses only `layersentry.selfService.appearance.v1`. Storage failures are non-fatal; there are no account IDs, passwords, tokens or resource records in it.

Emergency URL override: add `layersentry-ui=classic` to the existing query string (use `&` if it already has parameters). That disables the appearance for that location and cannot enable another view or grant access. Remove the parameter to use the normal switch. Deployment-wide build rollback: set `ENABLE_SELF_SERVICE_APPEARANCE = false` in `presentation.js` and rebuild, or redeploy the prior complete FireEdge artifact. Do not mix client/shared-module artifacts from different builds.

## Validation in this change

Local evidence: 31 pure presentation tests and 19 native source-contract tests pass. All seven changed/new product JavaScript files pass syntax transpilation. The local contract runner uses the installed TypeScript fallback because the container cannot reach GitHub/npm and cannot install the repository dependencies. The tests explicitly use React, MUI and router test doubles; they do not pretend to be live API or full React/browser tests.

The regression fixtures are exact copies of the three native files, verified against their Git blob IDs. Tests check native Router props, native auth subscriptions, action-host presence, route/click targets, translations, fixed-menu logic, sidebar filtering and source-block preservation across cloud/admin/user/groupadmin, signed-out, classic and Guacamole scenarios. CSS tests reject overrides of native positioning, dimensions, pointer events, visibility, overflow and stacking.

The included pull-request workflow installs the existing lock and runs the tests with the repository's Babel toolchain, then builds the affected client, ComponentsModule and server-side-rendering bundles. **Workflow publication is not proof that CI ran or passed.** Check the PR's actual results before merging. No claims of zero regressions, production readiness or native deployment are made from local tests.

## Run on a normal source checkout

```sh
cd src/fireedge
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/layersentry/*.test.cjs
NODE_ENV=production npm run build-client
NODE_ENV=production npm run build:cpm
NODE_ENV=production npm run build-server
```

For a complete release use the repository's normal full build/package process so all remotes are consistent. This change provides no script to overwrite a running frontend. Do not build or deploy directly over a live installation directory.

## Mandatory staging acceptance before merge/deployment

1. Build the exact branch and a baseline with the same lock/toolchain. Compare existing screenshots and native request payloads under the same test accounts.
2. Use a cloud member and read-only account. Create an authorized disposable VM; open details, create/review/cancel dialogs, perform permitted power operations, disk attach/grow/detach, and retain independent data. Compare behavior and requests to baseline.
3. Exercise native VNC/SSH/RDP where configured. Verify the console route is unstyled, proxy authorization unchanged, keyboard/clipboard controls remain native, and denied access stays denied.
4. Check native GPU, snapshot/backup, OneKS worker and OneFlow actions only where already configured and qualified. A missing backend is not a styling defect or permission to enable it.
5. Open a partially completed form and a modal; toggle appearance in both directions. Check values, focus, unsaved state, submit/cancel and timeout messaging. Exercise view switching and logout/login in light/dark modes.
6. Compare admin, groupadmin and user views to the baseline; verify unchanged login, menus, view permissions, extension routes, translations, keyboard navigation, table virtualization, zoom and mobile layout.
7. Record exact commit/artifact hashes and outcomes. Keep the PR unmerged and production unchanged until the required tests pass. Full rollback uses the previous complete FireEdge release, not a database or resource-state reset.

The remote Desktop Commander connection returned no online device during this task. No user host, installed frontend, live credential or runtime capability was inspected or changed.
