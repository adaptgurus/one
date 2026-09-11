# LayerSentry OpenNebula 7.4.1 self-service portal

## Purpose

This branch converts the OpenNebula FireEdge `cloud` view into the LayerSentry customer portal while preserving OpenNebula, OneKS and OneFlow as the authoritative lifecycle engines. It is no longer only a skin: the cloud view now exposes the customer-safe native resource and lifecycle surfaces required by the LayerSentry design.

The `admin`, `groupadmin`, `user`, login and layout-free Guacamole console experiences are not replaced by this portal. Provider infrastructure such as Hosts, Datastores, OpenNebula Clusters, Providers, Zones, global ACLs and VDC administration remains outside the ordinary customer view.

Evidence base:

- repository: `adaptgurus/one`
- parent: `layersentry/p1-rke2-provisioning@6746b9e22d63a0d7ef64154fd22a8161087e7b68`
- exact parent is one commit above OpenNebula `release-7.4.1`
- central engineering contract observed: `adaptgurus/codexagentlogic@9e58d78d6bfaaa923d24fb8b4912ae24e43dc0f7`
- design/audit reference: owner-approved LayerSentry v5 self-service design and 208-item documentation audit

## Implemented source scope

| Area | Current source status | Native authority / boundary |
|---|---|---|
| LayerSentry customer appearance | SOURCE_COMPLETE | FireEdge presentation only; classic appearance switch and URL fallback remain |
| Customer navigation/dashboard | SOURCE_COMPLETE | Existing FireEdge routes; dashboard shows workloads rather than provider hosts |
| VM lifecycle and console | SOURCE_COMPLETE for exposed native operations | OpenNebula VM API; VNC/SSH/RDP remain native Guacamole/guest access paths |
| VM CPU/memory | SOURCE_COMPLETE | Native resize handler and state restrictions |
| VM disks and disk snapshots | SOURCE_COMPLETE | Native image/volatile attach, detach, resize, save-as, disk snapshots |
| VM NICs and traffic-rule attachment | SOURCE_COMPLETE | Native VNet/NIC/security-group actions |
| Dedicated PCI/GPU after creation | SOURCE_COMPLETE | Native PCI inventory/attach/detach; host/device qualification still required |
| GPU selection during VM creation | PARTIAL / deliberately gated | Native instantiate PCI picker depends on admin host inventory; not exposed to ordinary customers until a published-profile abstraction exists |
| VM system snapshots/history/logs | SOURCE_COMPLETE | Native VM tabs |
| VM backup configure/create/restore | SOURCE_COMPLETE | Native OpenNebula backup operations and backend limitations apply |
| VM scheduled actions | SOURCE_COMPLETE | Native scheduled actions |
| VM placement groups | SOURCE_COMPLETE | Native VM Group membership and VM Group resource view |
| 7.4.1 guest command execution | SOURCE_COMPLETE | Native Exec tab, retry/cancel and OpenNebula guest prerequisites |
| Images and installation media | SOURCE_COMPLETE | Native Image/File resources; ownership transfer disabled |
| Saved/private templates | SOURCE_COMPLETE for native save-as-template/instantiate paths | Native VM/template/image persistence semantics apply |
| Networks and IPAM | SOURCE_COMPLETE | Native VNet templates, address ranges, leases/reservations; physical fabric stays provider-owned |
| Security groups / traffic rules | SOURCE_COMPLETE | Native security groups; actual driver compatibility/effective rules still require runtime evidence |
| Virtual routers | SOURCE_COMPLETE | Native OpenNebula VRouter; no replacement router controller |
| OneFlow VM applications | SOURCE_COMPLETE for published templates and services | OneFlow remains the orchestrator |
| OneKS Kubernetes lifecycle | SOURCE_COMPLETE | Native create, node groups, scale/update/delete, upgrade/recover, logs/events/kubeconfig |
| Customer backups and backup jobs | SOURCE_COMPLETE | Native backup records/jobs/schedules/start/cancel/restore |
| Account, SSH public key, quotas | SOURCE_COMPLETE | Native user auth/quota pages; private key and auth-driver changes disabled |
| Accounting/showback | SOURCE_COMPLETE | Native accounting/showback; not presented as invoicing |
| Help/support | SOURCE_COMPLETE | Native support tickets/comments where backend support is configured |
| Native monitoring | SOURCE_COMPLETE for OpenNebula VM CPU/memory charts | Existing FireEdge monitoring data |
| Alerts & attention | SOURCE_COMPLETE read-only observer | Native VM, BackupJob and OneKS state; no fake acknowledgement/recovery state |
| DC/DR request during VM create | SOURCE_COMPLETE for intent capture | `LAYERSENTRY_PROTECTION` metadata is `REQUESTED_NOT_ACTIVE`; no replication is claimed |
| DC/DR activation/history/failover/failback | PENDING P3 backend | Requires qualified checkpoint/replication/recovery service and data-safety gates |
| Per-cluster optional Helm plugins | PENDING P2 backend adapter | Central catalog/compatibility contract exists; portal enforcement/runtime install API not yet available |
| Customer Grafana SSO/dashboard integration | PENDING backend adapter | Native charts remain; authenticated tenant-scoped Grafana must not rely on dashboard variables alone |
| Email/webhook notification delivery | PENDING backend service | Attention page is intentionally read-only; delivery/preferences need durable backend state |
| OpenEverest configured DBaaS lifecycle | PENDING current OpenNebula adapter | Do not reuse legacy Harvester-oriented assumptions |

`SOURCE_COMPLETE` means the intended source path and native integration are implemented and build-tested. It does **not** mean `LIVE_VERIFIED` or `PRODUCTION_CERTIFIED`.

## Customer-safe cloud view

The new cloud view files expose customer-capable native resources while deliberately withholding provider controls. Ownership transfer (`chown`/`chgrp`) is disabled in the newly exposed resource views. Physical host placement, raw hypervisor configuration, OpenNebula host migration controls and provider datastores remain hidden.

Newly available customer surfaces include:

- disk images and installation media
- native backups and backup jobs/schedules
- virtual networks, VNet templates, address ranges and leases
- security groups / traffic rules
- virtual routers
- VM placement groups
- published OneFlow application templates
- OneKS Kubernetes clusters and node groups
- customer account/quota/accounting/showback
- help/support

The workload dashboard removes provider Host/System/Cluster-capacity cards and retains VM, network, image and VM-monitoring views.

## VM Backup & DR request at creation time

The existing VM-template instantiation flow includes a cloud-only **Backup & DR** tab. The form can capture:

- DC retention: Keep all or a requested count
- DR retention: Keep all or a requested count
- requested copy interval
- recovery site/location
- recovery network/VNet
- recovery VLAN ID
- keep/change address mode
- recovery IPv4 and IPv6 values
- subnet/prefix, gateway and DNS
- isolated recovery-test network

Only when the cloud user actually modifies this tab does the native instantiate payload receive a sanitized `LAYERSENTRY_PROTECTION` vector. It is versioned and explicitly records `REQUEST_STATE=REQUESTED_NOT_ACTIVE`. It cannot reserve an address/VLAN, activate copying, prune a recovery chain, fence a source, fail over a VM or prove recoverability.

This separation is intentional: the customer can define the policy during VM creation now, while P3 later validates and activates supported policies without changing OpenNebula's VM API.

## Alerts & attention

`/attention` is a read-only customer page. It derives current conditions from existing authenticated APIs:

- VM failed/error/unknown states
- BackupJob `ERROR_VMS`
- BackupJob `OUTDATED_VMS`
- OneKS failure/warning/unknown states
- LayerSentry VM protection requests still marked `REQUESTED_NOT_ACTIVE`

It does not store `read`, `acknowledged`, `recovered` or delivery state. Opening an alert cannot change the resource. Email/webhook transport is therefore not fabricated.

## Optional Kubernetes software boundary

The current central catalog is an install-only optional Helm catalog and the compatibility contract explicitly says portal/API enforcement and runtime compatibility still require implementation. Do not execute Helm from the browser/FireEdge server merely to make the button work. A correct P2 plugin service must:

1. identify the authenticated OneKS cluster and tenant;
2. inventory installed/in-flight/requested releases;
3. evaluate `catalog.json` and `plugin-compatibility.json`;
4. revalidate under a per-cluster operation lock;
5. preserve one writer per Helm release/object;
6. reject UNKNOWN compatibility for production selection;
7. validate offline chart/image closure, required values, secrets, licenses and capacity;
8. return an authoritative operation/result that FireEdge can observe.

Until that adapter exists, the native OneKS lifecycle is source-complete but optional Helm plugin installation is not.

## Source validation evidence

The last runtime commit validated by the temporary focused workflow was `703ba2c8a51e19154ee462a8aa14616e3cc18f7c`. The subsequent finalization commit only removes that temporary `.github` workflow from the PR; runtime source is unchanged by that removal.

Observed focused CI result:

- **92 / 92 LayerSentry tests passed** using the repository Babel/toolchain
- `npm ci` with the unchanged FireEdge lock passed
- `build-client` passed
- `build:cpm` passed
- `build-server` passed
- cross-module import check passed after the protection normalizer was moved through `@UtilsModule`

The client/components builds emitted existing webpack asset-size warnings; they did not fail.

The repository-wide OpenNebula smoke workflow is a separate blocker: its Ruby RuboCop phase scans hundreds of pre-existing Ruby files and reports offenses, including source inherited from the P1 RKE2 branch. This P2 UI branch does not modify Ruby code. The failure must not be relabelled as a passing smoke test, but unrelated Ruby autocorrection must also not be mixed into this UI branch.

## Source-readiness vs production-readiness

A percentage is meaningful only with a denominator. For the customer portal, use these two different measures:

### Native self-service source coverage

The major native OpenNebula/OneKS/OneFlow customer capabilities listed above are implemented in source. The remaining native UI gap is principally a safe creation-time GPU/profile abstraction rather than a missing PCI backend. On that **native customer portal source** scope, this branch is approximately in the high-80s/low-90s percent range by capability group.

### Full LayerSentry product production readiness

Do not reuse the source-coverage number. Production readiness remains materially lower because four major integrations are not complete or live-qualified: plugin service, Grafana SSO, notification delivery, and P3 DR activation/recovery; OpenEverest also needs its current adapter. No customer environment has been staged from this session.

## Mandatory staging acceptance before merge/deployment

1. Build the exact final branch and the base with the same lock/toolchain; record artifact digests.
2. Test cloud member, read-only and cross-tenant denial accounts. A view dropdown is not an authorization boundary.
3. Provision a disposable VM from an approved template; validate CPU/memory, NIC, disk, image/media and VM Group journeys against the base.
4. Exercise VNC/SSH/RDP. The Guacamole route must remain layout-free and its authorization unchanged.
5. On prepared hardware, test PCI/GPU attach/detach and confirm unsupported VM states/migration/snapshot combinations fail safely.
6. Test disk attach/grow/detach and guest filesystem expectations; independently owned data must survive detach/worker replacement where promised.
7. Create/delete/revert every advertised snapshot type on each qualified storage backend.
8. Configure and run native backups; test failed members, cancel/retry, oldest/middle/newest restore, and backend-specific incremental restrictions.
9. Create/scale/recover/upgrade/delete OneKS resources with authorized test assets; validate logs, events and kubeconfig denial/expiry behavior.
10. Instantiate an approved OneFlow application and exercise role scaling/recovery boundaries.
11. Validate IPAM, IPv4/IPv6 leases and security groups on each network driver; confirm effective-rule semantics rather than only rule-object creation.
12. Create a VM with LayerSentry protection intent and verify the vector is stored as `REQUESTED_NOT_ACTIVE`; nothing may start DR automatically.
13. Exercise the Attention page against real failed/recovered states. Reading the page must have zero resource side effects.
14. Compare admin, groupadmin and user views to the base, including translations, mobile/zoom, keyboard navigation, tables, dialogs and open-form preservation while toggling appearance.
15. Complete P2/P3 backend qualification separately before enabling plugins, Grafana customer SSO, notification delivery or DR activation.

Keep PR #1 draft and production unchanged until these live gates have evidence.

## Rollback

The self-service portal includes **Use classic appearance**, which changes presentation only and does not navigate or remount the native Router/ModalHost. `layersentry-ui=classic` is an emergency per-location appearance override. Deployment rollback is a complete prior FireEdge artifact/package; do not mix client and remote-module outputs from different builds and do not roll back cloud resources merely to roll back the UI.

The authorized remote desktop connection was unavailable during this engineering pass, so no installed frontend, customer VM, storage object, console session or DR environment was modified or live-verified.
