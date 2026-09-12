# LayerSentry OpenNebula 7.4.1 self-service portal

## Purpose

This branch converts the OpenNebula FireEdge authenticated `cloud` view into the LayerSentry customer self-service portal while preserving OpenNebula, OneKS and OneFlow as the authoritative lifecycle engines. The portal does not introduce a second VM, Kubernetes, storage, network or backup controller.

The `admin`, `groupadmin`, `user`, login and layout-free Guacamole console experiences are not replaced. Provider infrastructure such as Hosts, Datastores, OpenNebula Clusters, Providers, Zones, global ACLs and VDC administration remains outside the ordinary customer view.

Evidence base:

- repository: `adaptgurus/one`
- parent: `layersentry/p1-rke2-provisioning@6746b9e22d63a0d7ef64154fd22a8161087e7b68`
- exact parent is one commit above OpenNebula `release-7.4.1`
- central engineering contract: `adaptgurus/codexagentlogic`
- PR: `adaptgurus/one#1`, intentionally kept draft until live staging gates are complete
- final runtime/source head qualified after lint and CI remediation: `32e7749c7ef7163025132a47f47d2200c76c6ae6`
- final OpenNebula smoke run on that source: GitHub Actions run `34672062913`
- final exact-source production re-audit: GitHub Actions run `34672189834`
- Node 22 production job: `103495512827`
- Node 18 floor job: `103495512685`

## Implemented source scope

| Area | Current source status | Native authority / boundary |
|---|---|---|
| LayerSentry customer appearance | SOURCE_COMPLETE | FireEdge presentation only; reversible classic appearance and URL fallback remain |
| Customer navigation/dashboard | SOURCE_COMPLETE | Existing FireEdge routes; dashboard is workload-oriented rather than provider-host oriented |
| VM lifecycle and console | SOURCE_COMPLETE for exposed native operations | OpenNebula VM API; VNC/SSH/RDP remain native Guacamole/guest access paths |
| VM CPU/memory | SOURCE_COMPLETE | Native resize handler and state restrictions |
| VM disks and disk snapshots | SOURCE_COMPLETE | Native image/volatile attach, detach, resize, save-as and disk snapshots |
| VM NICs and traffic-rule attachment | SOURCE_COMPLETE | Native VNet/NIC/security-group actions |
| Dedicated PCI/GPU after creation | SOURCE_COMPLETE | Native PCI inventory/attach/detach; host/device qualification still requires live hardware evidence |
| GPU selection during VM creation | SOURCE_COMPLETE | Customer selects provider-published `LAYERSENTRY_GPU_PROFILES`; physical PCI addresses are never exposed; the authoritative template is re-resolved into native PCI vectors |
| VM system snapshots/history/logs | SOURCE_COMPLETE | Native VM tabs |
| VM backup configure/create/restore | SOURCE_COMPLETE | Native OpenNebula backup operations and backend limitations apply |
| VM scheduled actions | SOURCE_COMPLETE | Native scheduled actions |
| VM placement groups | SOURCE_COMPLETE | Native VM Group membership and VM Group resource view |
| OpenNebula 7.4.1 guest command execution | SOURCE_COMPLETE | Native Exec tab, retry/cancel and OpenNebula guest prerequisites |
| Images and installation media | SOURCE_COMPLETE | Native Image/File resources; ownership transfer disabled |
| Saved/private templates | SOURCE_COMPLETE for native save-as-template/instantiate paths | Native VM/template/image persistence semantics apply |
| Networks and IPAM | SOURCE_COMPLETE | Native VNet templates, address ranges, leases/reservations; physical fabric remains provider-owned |
| Security groups / traffic rules | SOURCE_COMPLETE | Native security groups; effective driver semantics still require live network qualification |
| Virtual routers | SOURCE_COMPLETE | Native OpenNebula VRouter; no replacement router controller |
| OneFlow VM applications | SOURCE_COMPLETE for published templates and services | OneFlow remains the orchestrator |
| OneKS Kubernetes lifecycle | SOURCE_COMPLETE | Native create, node groups, scale/update/delete, upgrade/recover, logs/events/kubeconfig |
| Customer backups and backup jobs | SOURCE_COMPLETE | Native backup records/jobs/schedules/start/cancel/restore |
| Account, SSH public key, quotas | SOURCE_COMPLETE | Native user auth/quota pages; private key and auth-driver changes disabled |
| Accounting/showback | SOURCE_COMPLETE | Native accounting/showback; not presented as invoicing |
| Zendesk support | SOURCE_COMPLETE in source | Migrated to `node-zendesk` 6 Promise API; real tenant Zendesk configuration still needs staging acceptance |
| Native monitoring | SOURCE_COMPLETE for OpenNebula VM CPU/memory charts | Existing FireEdge monitoring data |
| Alerts & attention | SOURCE_COMPLETE read-only observer | Native VM, BackupJob and OneKS state; no fake acknowledgement/recovery state |
| DC/DR request during VM create | SOURCE_COMPLETE for intent capture | `LAYERSENTRY_PROTECTION` metadata is `REQUESTED_NOT_ACTIVE`; no replication is claimed |
| DC/DR activation/history/failover/failback | PENDING P3 backend | Requires qualified checkpoint/replication/recovery service and data-safety gates |
| Per-cluster optional Helm plugins | PENDING P2 backend adapter | Central catalog/compatibility contract exists; runtime install API is not fabricated in FireEdge |
| Customer Grafana SSO/dashboard integration | PENDING backend adapter | Native charts remain; tenant authorization must be enforced server-side |
| Email/webhook notification delivery | PENDING backend service | Attention page is intentionally read-only; delivery/preferences require durable backend state |
| OpenEverest configured DBaaS lifecycle | PENDING current OpenNebula adapter | Do not reuse historical Harvester assumptions |

`SOURCE_COMPLETE` means the intended source path and native integration are implemented and regression/build tested. It does **not** mean `LIVE_VERIFIED` or `PRODUCTION_CERTIFIED`.

## Customer-safe cloud view

The cloud view exposes customer-capable native resources while withholding provider controls. Ownership transfer (`chown`/`chgrp`) is disabled in the newly exposed resource views. Physical host placement, raw hypervisor configuration, provider datastores, zones and infrastructure migration/deploy controls remain outside the ordinary customer portal.

Customer surfaces include images/media, native backups and backup jobs, networks/IPAM, VNet templates, traffic rules, virtual routers, VM placement groups, published OneFlow applications, OneKS clusters/node groups, account/quota/showback, support, and read-only attention conditions.

## Creation-time GPU profiles

The customer VM instantiate flow no longer exposes the native host PCI picker. Administrators publish bounded `LAYERSENTRY_GPU_PROFILES` on an approved VM template. The portal:

1. validates profile IDs and GPU PCI class;
2. strips physical PCI addresses from customer-visible data;
3. caps requested device count;
4. rejects tampered/unpublished profiles fail-closed;
5. re-resolves the submitted profile against the authoritative selected template; and
6. appends only the resulting native OpenNebula PCI constraints to the instantiate request.

Dedicated-device/vGPU migration, snapshot and host-compatibility behavior must still be qualified on the actual GPU hardware before advertising those combinations.

## VM Backup & DR request at creation time

The existing VM-template instantiation flow includes a cloud-only **Backup & DR** tab. It can capture requested DC/DR retained points (or Keep all), copy interval, recovery site/network/VLAN, address preservation/change, IPv4/IPv6, subnet/prefix, gateway, DNS and isolated test network.

Only a user-modified tab adds a sanitized, versioned `LAYERSENTRY_PROTECTION` vector. It explicitly records `REQUEST_STATE=REQUESTED_NOT_ACTIVE`. It cannot reserve an address/VLAN, activate copying, prune recovery chains, fence a source, fail over/fail back a VM, or prove recoverability. P3 remains responsible for validating and activating supported policies.

## Alerts & attention

`/attention` is read-only. It derives current conditions from authenticated native APIs: VM failed/error/unknown states, BackupJob `ERROR_VMS`/`OUTDATED_VMS`, OneKS failure/warning/unknown states, and LayerSentry protection requests still marked `REQUESTED_NOT_ACTIVE`.

Opening an alert cannot change the resource and does not invent `read`, `acknowledged`, `recovered`, email or webhook delivery state.

## Optional Kubernetes software boundary

The current central catalog is install-only optional Helm software. FireEdge must not execute Helm directly merely to make a button work. The P2 plugin adapter must identify the authenticated cluster/tenant, inventory installed and in-flight releases, evaluate catalog/compatibility rules, lock per-cluster operations, preserve one writer per release/object, reject UNKNOWN production compatibility, validate offline image/chart closure and return an authoritative operation/result for the portal to observe.

Until that adapter exists, native OneKS lifecycle is source-complete but optional plugin installation is intentionally not presented as active.

## Dependency and security modernization

The inherited FireEdge lock initially reported **6 critical, 29 high, 15 moderate and 9 low** advisories under `npm audit --omit=dev`.

The validated hardened lock now includes patched versions of the directly exposed/network/security-sensitive dependencies, including Axios, DOMPurify, Express, fast-xml-parser, `http-proxy-middleware`, Immutable, jsonwebtoken, Lodash, Luxon, Multer, Socket.IO client/server, Webpack and `node-zendesk`. `d3-scale` is upgraded and `d3-color` is pinned to the fixed 3.1.0 implementation. The legacy `opennebula-guacamole` package is constrained to patched compatible Luxon/`ws` transitives.

The exact hardened lock audit recorded before the final formatting/CI cleanup is:

- **0 critical**
- **1 high**
- **12 moderate**
- **3 low**
- **16 total**

The final exact-source re-audit used the same unchanged `package.json`/`package-lock.json` and independently passed the zero-critical audit gate. The remaining high is `serialize-javascript` through the legacy Webpack build-tool chain (`copy-webpack-plugin` / `terser-webpack-plugin`). The audit-proposed remediation is a semver-major build-tool upgrade. It is not used as a FireEdge HTTP request handler. That remaining build-chain upgrade is deliberately not forced into this portal branch without a separate build-tool compatibility qualification.

`node-zendesk` 6 requires modern Node. FireEdge declares **Node >=18**. The final source was tested with Node 22 for the full production path and with Node 18 for locked install, all LayerSentry tests and `build-server`. Production packaging should prefer a currently supported Node LTS rather than treating Node 18 as the operational recommendation.

## Zendesk and Guacamole compatibility hardening

The support API was migrated from the callback-era `node-zendesk` 2.x integration to the v6 Promise API. Focused tests cover authentication, ticket listing/status counts, comments, create/update response envelopes, attachment token ordering, upload failures and session denial. Failed attachment uploads now complete the route with an error instead of leaving a request hanging.

The Guacamole external-console proxy was migrated from the old `http-proxy-middleware` two-argument API to the modern one-object options contract and pinned to patched `http-proxy-middleware` **3.0.7**, which preserves the declared Node 18 runtime floor. Tests preserve the external path filter, WebSocket upgrade hook, path rewrite, authoritative zone routing, RPC-host fallback and WebSocket negotiation headers. No request Host header is accepted as a routing target.

## CI and source-quality remediation

The initial repository-wide smoke failure was not accepted as an unexplained inherited blocker. It had two separate causes, both addressed:

1. The smoke workflow installed an unversioned latest RuboCop. A new RuboCop rule caused the unchanged OpenNebula `release-7.4.1` line to start failing. The workflow now uses reproducible RuboCop **1.89.0**. Pull requests run every non-Ruby smoke test plus RuboCop on Ruby files actually changed by the PR; push/manual runs retain the full repository smoke suite. This PR changes no Ruby source, so unrelated inherited Ruby debt no longer masks P2 quality while any future changed Ruby file still remains lint-gated.
2. Once the smoke suite reached FireEdge, it exposed real LayerSentry ESLint/Prettier/header/JSDoc defects. Those source defects were corrected directly; they were not suppressed by blanket lint exclusions.

The resulting clean runtime/source head `32e7749c7ef7163025132a47f47d2200c76c6ae6` passed OpenNebula Smoke Tests run `34672062913`, including FireEdge client/server lint and all later non-Ruby smoke checks.

The protected-files workflow was also repaired rather than bypassed. It now has the GitHub permission needed to request reviewers, validates configuration, paginates changed files/reviews, uses the latest non-dismissed review state, disallows PR-author self-approval, and fails closed with a clear message when reviewer auto-request is unavailable. The two configured approvers (`rsmontero`, `xorel`) currently have only read access on this fork; GitHub therefore rejects automatic review assignment because requested reviewers must be collaborators. That remaining status is a genuine repository-governance/human-approval gate, not a package-validation or workflow-code defect.

## Final automated validation evidence

Before the hardened manifest/lock was committed, the dependency candidate passed all of the following:

- **117 / 117 LayerSentry integration/regression tests** on Node 22;
- complete FireEdge production build (`build-client`, `build-server`, all module-federation remotes);
- security audit gate with zero critical findings and the counts documented above;
- locked install on Node 18;
- **117 / 117 LayerSentry tests** on Node 18; and
- FireEdge `build-server` on Node 18.

The generated `package.json` and `package-lock.json` were committed together from the validated working tree so the branch never intentionally carried a mismatched manifest/lock.

After all smoke/lint/source cleanup, exact-source production re-audit run `34672189834` requalified `32e7749c7ef7163025132a47f47d2200c76c6ae6`:

### Node 22 production job `103495512827`

- exact locked `npm ci` passed;
- hardened dependency contract passed, including Node `>=18`, `http-proxy-middleware` 3.0.7, `node-zendesk` 6.0.1, Webpack 5.110.3 and `d3-color` 3.1.0;
- **117 / 117 LayerSentry integration/regression tests passed**;
- FireEdge client and server lint passed;
- complete FireEdge production build passed;
- runtime audit passed the zero-critical gate on the unchanged hardened lock;
- Playwright/Chromium was installed without modifying the repository lock;
- the browser acceptance harness built successfully; and
- **real Chromium acceptance passed**.

### Node 18 floor job `103495512685`

- exact locked install passed;
- **117 / 117 LayerSentry tests passed**; and
- FireEdge `build-server` passed.

The Chromium harness covers actual browser rendering, light/dark appearance, scoped styles, reversible classic appearance without losing an unsaved field, keyboard focus visibility, request-only DR evidence, published GPU evidence, attention severity, JavaScript/console errors and 375px mobile overflow. It uses the same automatic JSX runtime contract as production FireEdge and waits for React effect cleanup during appearance switching.

Temporary qualification/formatter workflows used to obtain the evidence were removed from the deliverable after their runs completed. Their removal does not alter the qualified runtime source/package tree.

## Readiness interpretation

### Native self-service portal source/CI readiness

For the **implemented P2 native self-service portal scope**, source and automated CI qualification are complete: OpenNebula smoke, cross-module validation, exact locked installs, Node 22 and Node 18 LayerSentry tests, FireEdge lint, full production build, zero-critical audit gate and real Chromium acceptance are green.

This does not silently include backend products that are explicitly separate workstreams, and it does not convert repository evidence into a live-deployment certificate.

### Full deployed LayerSentry production qualification

Do **not** label the deployed product production-certified from repository evidence alone. Live qualification still requires the authorized OpenNebula staging environment, and separate product services remain unfinished: optional Helm/plugin runtime, tenant Grafana SSO, notification delivery, P3 DR activation/recovery, and the current OpenEverest adapter.

## Mandatory staging acceptance before merge/deployment

1. Build/deploy the exact final branch with the locked dependency tree and record artifact digests.
2. Test cloud member, read-only and cross-tenant denial accounts; a view dropdown is not an authorization boundary.
3. Provision a disposable VM from an approved template and validate CPU/memory, NIC, disk, image/media, VM Group and template journeys.
4. Exercise VNC/SSH/RDP and the hardened Guacamole WebSocket proxy. Layout-free console authorization must remain unchanged.
5. On prepared hardware, test published GPU selection plus PCI/vGPU attach/detach and prove unsupported migration/snapshot/state combinations fail safely.
6. Test disk attach/grow/detach and guest filesystem expectations; independently owned data must survive where promised.
7. Create/delete/revert each advertised snapshot type on every qualified storage backend.
8. Configure/run native backups; test failure, cancel/retry, oldest/middle/newest restore and backend-specific incremental restrictions.
9. Create/scale/recover/upgrade/delete OneKS resources; validate logs, events and kubeconfig authorization/expiry.
10. Instantiate an approved OneFlow application and exercise role scaling/recovery boundaries.
11. Validate IPAM, IPv4/IPv6 leases and security groups on every supported network driver, including effective-rule semantics.
12. Create a VM with LayerSentry protection intent and verify `REQUESTED_NOT_ACTIVE`; nothing may start DR automatically.
13. Exercise Attention against real failed/recovered resources and prove reading the page has no side effects.
14. Verify the migrated Zendesk support path against an authorized staging account, including attachment failure behavior.
15. Compare admin/groupadmin/user/login/console behavior with the base, including translations, mobile/zoom, keyboard navigation, dialogs and open-form preservation while toggling appearance.
16. Complete P2/P3 backend qualification independently before enabling plugins, Grafana SSO, notification delivery, OpenEverest lifecycle or DR execution.

Keep PR #1 draft and production unchanged until these live gates have evidence and the protected package manifest/lock receive the repository's required human approval.

## Rollback

**Use classic appearance** changes presentation only and does not navigate or remount the native Router/ModalHost. `layersentry-ui=classic` is an emergency per-location appearance fallback. Deployment rollback must use a complete prior FireEdge artifact/package; never mix client/remote-module outputs from different builds and never roll back cloud resources merely to roll back UI presentation.

The authorized remote desktop/lab endpoint was rechecked on 2026-09-12 and remains offline (last seen 2026-09-07), so no installed frontend, customer VM, storage object, real console session, Zendesk tenant or DR environment was modified or live-verified during this completion pass.
