# LayerSentry P2 native GUI page audit

Status: SOURCE_COMPLETE for the audited low-risk customer/UI boundaries below; live OpenNebula and storage qualification remains separate.

Source branch: `adaptgurus/one:layersentry/p2-native-storage-gui-20260915`
Base: `feat/self-service-v5-ui-20260911@3251e49a9d9ca475d268e12490e8976c5306c79d`
Central authority: `adaptgurus/codexagentlogic@f1f5e3f7a8a8137dc8627a6acce3fa9c20bc340d`

## Fixed invariants

- OpenNebula remains authoritative for VM, image, network, datastore, host, quota and native backup state.
- OneKS remains Kubernetes lifecycle authority; OneFlow remains native service lifecycle authority.
- Sunstone/FireEdge admin, user, groupadmin and layout-free console paths remain available.
- The LayerSentry cloud view does not expose OpenNebula Marketplace Apps as the LayerSentry catalog.
- Customer forms do not expose physical hosts, raw provider drivers, raw PCI addresses or direct OpenNebula DB access.
- A UI-hidden operation is not treated as authorization; native authorization remains mandatory.

## Page disposition

| Page / workflow | Result | Customer boundary |
|---|---|---|
| Dashboard | PASS | Workload-only; no provider host/capacity cards. |
| Virtual Machines | PASS | Native lifecycle retained; provider deploy/migrate/raw device controls remain hidden. |
| VM create | PASS | Approved source, simple compute/access/disk/network/protection/GPU product inputs. |
| Images | PASS | Cloud create removes advanced/custom provider fields and arbitrary PATH import. |
| Files | PASS | Cloud create is upload-only; arbitrary provider/server PATH import removed. |
| OneKS clusters | PASS | Native create/recover/upgrade/node-group/event/kubeconfig flow retained; steady-state provider Logs are hidden, while the native provisioning-progress log route remains available during create. Provider cluster placement is presented as named Compute location. |
| Virtual Networks | PASS | IP ranges, leases and security operations retained; raw update/VN_MAD/bridge/VLAN/provider cluster details hidden. |
| Network Templates | PASS | Cloud instantiate accepts address-range and security-group overrides only; provider configuration/context remains template-owned. |
| Security Groups | PASS | Logical firewall direction/protocol/port/CIDR/VNet controls only. |
| Virtual Routers | PASS | Native VRouter lifecycle retained; keepalived, hold, raw NIC and management-interface controls are provider-owned. |
| VM Groups | PASS | VM-to-VM affinity retained; physical host affinity hidden and immutable from cloud submissions. |
| OneFlow Services | PASS | Published service consumption/operations retained; raw service authoring/ownership/template internals hidden. |
| OneFlow Service Templates | PASS | Published template instantiate retained; raw template/ownership internals hidden. |
| Account / Usage & Quotas | PASS | Quota and accounting are read-only; safe credential actions retained. |
| Support | PASS | Existing authorized Zendesk ticket/comment workflow retained. |
| Native Backup Jobs | REVISE | Native execution/schedule remains; mode, incremental and KEEP_LAST semantics require data-safety review before product simplification. |
| Native Backup Restore | REVISE | Native restore remains; raw target datastore selection must become qualified published storage profile before simplification. |
| Marketplace Apps | REMOVED FROM CLOUD | Marketplace may remain internal to OpenNebula/OneKS; it is not LayerSentry catalog inventory. |

## Storage administration audit

The native datastore wizard remains the lifecycle owner. LayerSentry adds product-level profiles without creating a second datastore database or controller.

| Storage profile | Native mapping | Source status |
|---|---|---|
| Shared filesystem / NFS | Native filesystem/shared drivers | Preserved |
| Local filesystem | Native filesystem/local drivers | Preserved |
| LVM SAN | `fs` + `fs_lvm_ssh`, `DISK_TYPE=BLOCK` | Corrected FireEdge disk-type mapping |
| iSCSI SAN + DM-Multipath | `fs` + `fs_lvm_ssh`, `DISK_TYPE=BLOCK` | Added profile + validation |
| Ceph RBD | Native Ceph datastore | Preserved |
| Raw Device Mapping | Native device datastore | Preserved |
| VirtioFS | Native VirtioFS datastore | Preserved |
| NetApp | Native NetApp integration where installed | Preserved |
| LINSTOR / DRBD SDS | `linstor` + `linstor`, `DISK_TYPE=BLOCK` | Added optional profile + validation |

### iSCSI multipath profile

The profile requires at least two target portals, a valid target IQN/EUI/NAA and a stable WWID. Browser input is normalized before the native datastore template is generated. The package plan is distro-aware:

- RPM hosts: `device-mapper-multipath`, `iscsi-initiator-utils`, `lvm2`, `lsscsi`, `sg3_utils`.
- DEB hosts: `multipath-tools`, `open-iscsi`, `lvm2`, `lsscsi`, `sg3-utils`.

Live qualification must prove the same LUN/WWID on every selected KVM host, multiple healthy paths, ALUA/path failover where applicable, correct VG ownership and successful VM I/O during a single-path failure.

### LINSTOR / DRBD SDS profile

The profile requires a LINSTOR resource group and supports optional controller endpoints. Package planning currently records:

- Controller/front-end: `linbit-sds-controller`, `linstor-opennebula`.
- RPM satellite/storage host: `linbit-sds-satellite`, `kmod-drbd`.
- DEB satellite/storage host: `linbit-sds-satellite`, `drbd-dkms`.

Package/version availability, LINBIT repository/subscription rights, DRBD kernel compatibility, storage pools and replica policy are live-environment qualification gates; source presence alone is not certification.
## Automated evidence collected on `testser`

- Node runtime: 22.23.2 in WSL Ubuntu-22.04.
- Locked dependency install: `npm ci --ignore-scripts --no-audit --no-fund` passed.
- LayerSentry source/regression suite: 163/163 tests passed after the page/storage audit.
- Changed-file ESLint: 0 errors and 0 warnings.
- `git diff --check`: passed.
- Utils, Constants, Resources and Containers module production builds: passed.
- Complete FireEdge lint: passed.
- Complete FireEdge production build (client, server, and all module-federation remotes): passed.
- Real Chromium browser acceptance with the historically qualified Playwright 1.55.0 runner: passed.
- Browser evidence covered light/dark presentation, classic fallback, keyboard focus, GPU/protection evidence, mobile width, and zero browser-console errors.
- Existing upstream/donor Webpack type-export and asset-size warnings remain; no audited P2 compile error was introduced.
- Final source commit `f5f16be4bde3472f8119739a6879f45bb8d186b3` was pushed with `[skip ci]`; GitHub reported zero workflow runs for that SHA.
- `Manoj-Test-Inst` can reach TCP/22 on all five lab nodes (`ls-fe1/2/3`, `ls-kvm1/2`), but key-only guest SSH authentication is not configured, so no live guest mutation was attempted.


## Second-pass revalidation — 2026-09-15

This pass revalidated the customer-facing cloud view page by page against the LayerSentry/OpenNebula ownership boundary. It is a source/UI security and UX revalidation only; it does not convert the environment to `LIVE_VERIFIED` or `PRODUCTION_CERTIFIED`.

### Provider-detail gaps closed

- VM details no longer expose owner, reschedule/lock state, hypervisor, physical host, provider cluster or deploy ID in cloud view. VM History, Storage and Network tables filter provider topology/driver fields; native Attach Disk, provider NIC actions and Attach NIC are hidden in cloud view. The VM-to-Marketplace create-app escape and steady-state VM provider Logs are disabled.
- OneKS cloud details retain customer resource information, Kubernetes version, endpoint, named compute location, logical network names, control-plane name/flavour/state/node count and capacity without exposing clickable OpenNebula cluster/VNet/control-plane VM IDs. Node-group IDs and provider VM topology are hidden, and delete/recover confirmations use the customer-facing node-group name. Events and kubeconfig remain enabled; steady-state provider Logs are disabled without removing the provisioning-progress log route used during native OneKS create.
- Virtual Network and Network Template pages hide provider driver, reservation-parent ID, PHYDEV, bridge implementation, VLAN/outer-VLAN implementation and related automatic-provider fields while retaining logical state, leases, address ranges, security controls and QoS.
- Virtual Router, Security Group and VM Group views hide backing template/provider VM topology and ownership columns while retaining logical network/router/firewall and VM-affinity lifecycle.
- OneFlow service views hide physical VM hostname, raw backing VM-template IDs and provider-resource drill-down. Service-template network sources use logical customer labels rather than provider source IDs.
- Image, File and Backup details hide datastore identity, native disk/backend internals and provider VM-membership columns as applicable. Backup increments no longer expose backend `SOURCE` in cloud view.
- Selection-only datastore tables for file/image/backup workflows hide datastore ID, type, clusters, owner, group and labels while retaining the selected native datastore ID internally for authoritative OpenNebula operations.
- Final diff review also corrected two cloud/native view-reactivity defects: Backup Job VM columns and VM Storage columns now recompute when `isCloud` changes. An AST check of all changed React sources found zero remaining `useMemo` callbacks that reference `isCloud` without declaring it as a dependency.

### Final source/UI qualification

- Focused LayerSentry cloud/storage contracts: **45/45 PASS**.
- Complete LayerSentry regression suite: **166/166 PASS**.
- Changed-source lint/fix audit script: **PASS**; full FireEdge client and server ESLint: **PASS**.
- Complete FireEdge production build (client, server and every module-federation remote): **PASS**. Existing upstream/shared-module and asset-size warnings remain non-fatal.
- Chromium acceptance using the existing historically qualified Playwright 1.55.0 harness: **PASS** with `BROWSER_ACCEPTANCE=PASS`.
- Static provider-boundary scan and full diff review: **PASS**; provider terms that remain in shared native components are disabled by cloud YAML or gated by `view === 'cloud'`/`isCloud` behavior.
- `package.json` and `package-lock.json`: **unchanged**.
- Browser-generated `dist/` and smoke screenshot evidence are removed after acceptance and are not staged.
- Final push must use `[skip ci]`; GitHub workflow-run verification is performed against the pushed SHA after the commit exists, so it is intentionally not represented as self-referential evidence inside this commit.

## Remaining gates

1. Register or authorize a `TESTSER` self-hosted runner for `adaptgurus/one` before any future GitHub Actions dispatch; the current TESTSER runner is registered to `adaptgurus/cozystack`.
2. Establish authorized key-based access to the five OpenNebula lab guests before deployment/live API qualification.
3. Bind the current OpenNebula host IDs, datastores, networks and disposable resources before live mutation.
4. Smoke-test native Sunstone/FireEdge admin and layout-free console after deployment.
5. Execute VM, OneKS, VRouter, network and native backup flows against the real backend; record resource IDs and cleanup.
6. Bind a disposable SAN LUN before iSCSI login, multipath/LVM initialization or failure testing.
7. Bind dedicated LINSTOR/DRBD storage devices and qualified package repositories before installing or creating SDS pools.
8. Do not mark P3 failover/failback or backup-retention lineage production-ready from GUI/source evidence.

Statuses used here distinguish source/UI audit from live qualification; this document does not claim `LIVE_VERIFIED` or `PRODUCTION_CERTIFIED`.

## Third-pass provider-boundary completion — 2026-09-15

This pass closes provider-information leakage that remained in cloud cards, lists, search-facing data, detail headers/summaries and other shared presentation surfaces. The source base before this uncommitted pass was `1124882b67e85d28d4e0dc9aa71badaef82c8bd3` on `layersentry/p2-native-storage-gui-20260915`.

### Third-pass qualification evidence

- Focused cloud/storage contracts: **48/48 PASS**.
- Complete LayerSentry regression suite: **169/169 PASS**.
- Changed-file ESLint: **PASS**.
- Full FireEdge client/server lint: **PASS**.
- `git diff --check`: **PASS**.
- Full FireEdge production build, including client, server and all module-federation remotes: **PASS**.
- Chromium acceptance harness: **PASS** with exit code 0.
- `package.json` and `package-lock.json`: **unchanged**.
- Browser-generated `dist/` and screenshot artifacts were removed after acceptance and are not part of the source change.
- Existing upstream Webpack export and bundle-size warnings remain non-fatal; this pass introduced no build error.

### Status boundary

This establishes the third-pass P2 source/UI state as `CI_VERIFIED` on TESTSER-equivalent local qualification. It does **not** establish `LIVE_VERIFIED` or `PRODUCTION_CERTIFIED`; live deployment, real OpenNebula resource mutation and backend state/log verification remain separate gates.
