# LayerSentry / OpenNebula 7.4.1 End-to-End GUI Audit

Date: 2026-09-15
OpenNebula runtime: 7.4.1 (`0fea39ec`)
LayerSentry branch: `layersentry/unified-portal-ui-20260915`
Scope: all non-Kubernetes GUI features; custom Kubernetes UX remains intentionally deferred.

## Audit method

The audit compares four sources of truth:

1. OpenNebula FireEdge `tab-manifest.yaml` and role view YAML files.
2. The LayerSentry product routes and navigation.
3. Live `rocky-01` OpenNebula CLI inventory.
4. OpenNebula 7.4 official documentation for backup, snapshots, scheduled actions and DR.

A feature is not considered complete merely because a URL exists. It must be discoverable in LayerSentry or intentionally represented by a product abstraction.

## Live environment findings

The live lab confirms the OpenNebula features are not all equally configured:

- OpenNebula 7.4.1 is active with two KVM hosts.
- Three datastores exist: system, default image, and files.
- No OpenNebula Backup Datastore exists.
- The Backup Job pool is empty.
- One OpenNebula zone/site is configured.
- No Ceph datastore or Ceph RBD mirroring evidence is present.
- Two Virtual Routers and one VM Group are present.
- Two OpenNebula Marketplaces exist and the public Marketplace contains appliances.
- A default VDC and backend ACL rules exist.

Therefore Backup Plans are a real OpenNebula feature but cannot execute in this lab until backup storage is configured. Site Recovery/DR is not configured and must not be reported as active.

## Customer-facing OpenNebula capability mapping

| OpenNebula capability | LayerSentry surface | Audit result |
| --- | --- | --- |
| Virtual Machines | Compute | EXPOSED |
| VM Templates | Compute create / platform blueprints | EXPOSED |
| VM Groups | Compute > Affinity Groups | ADDED |
| Files | Storage > Files | ADDED |
| Backup Jobs | Protection > Backup Plans | ADDED / backend storage missing |
| Backups / Restore | Protection > Recovery Points | ADDED |
| Virtual Networks | Network > Networks | EXPOSED |
| Network Templates | Network > Network Blueprints | ADDED |
| Security Groups | Network & Security > Firewall Rules | EXPOSED |
| Virtual Routers | Network & Security > Virtual Routers | ADDED |
| OneFlow Services | Applications | EXPOSED |
| Service Templates | Applications > Catalog | EXPOSED |
| Support | Support | EXPOSED |
| OneKS | Kubernetes | LIFECYCLE ONLY; custom UX deferred by owner |

Snapshots, disk snapshots, console access and scheduled VM lifecycle actions remain resource-detail operations backed by native OpenNebula authorization rather than duplicate LayerSentry controllers.

## Platform-administrator capability mapping

| OpenNebula capability | LayerSentry admin surface | Audit result |
| --- | --- | --- |
| Hosts | Infrastructure > Compute Hosts | EXPOSED |
| Clusters | Infrastructure > Compute Clusters | EXPOSED |
| Datastores | Infrastructure > Storage Pools | EXPOSED |
| Backup Datastores | Infrastructure > Backup Storage | ADDED |
| Drivers | Infrastructure > Drivers | ADDED |
| Zones | Infrastructure > Zones / Sites | EXPOSED |
| Providers | Infrastructure > Providers | EXPOSED |
| Users / Groups | Access > Users / Teams / Roles | EXPOSED |
| VDCs | Access > Projects | EXPOSED AS PRODUCT TERM |
| ACLs | Access > Access Rules | EXPOSED AS PRODUCT TERM |
| Images | Platform > Images | EXPOSED |
| VM Templates | Platform > Templates | EXPOSED |
| Service Templates | Platform > Service Templates | ADDED |
| VRouter Templates | Platform > Router Templates | ADDED |
| Marketplaces | Platform > Marketplaces | ADDED, admin-only |
| Marketplace Apps | Platform > Marketplace Apps | ADDED, admin-only |

Marketplace inventory intentionally remains outside the ordinary customer catalog because the cloud-role view does not authorize those native resources.

## Backup and DR boundary

OpenNebula Backup Jobs and Backup Images are authoritative native features. LayerSentry now exposes them separately as Backup Plans and Recovery Points / Restore.

The existing `LAYERSENTRY_PROTECTION.DR_ENABLED` value is different: it records requested protection intent with `REQUEST_STATE=REQUESTED_NOT_ACTIVE`. It does not enable replication, fencing, failover or failback.

LayerSentry therefore adds a separate Site Recovery / DR readiness page. The page reports live prerequisites such as zones, backup stores, Ceph-backed storage and Virtual Routers, but it does not enable failover controls without a qualified DR backend.

For the current lab, Site Recovery status is NOT CONFIGURED because there is only one zone and no Ceph-backed datastore/mirroring evidence. A real OpenNebula Ceph DR implementation still requires replication-state integration plus tested failover, isolated recovery validation and failback evidence.

## Final qualification evidence

- Complete LayerSentry source/regression suite: **186/186 PASS**.
- Native Sunstone sidebar-to-LayerSentry surface coverage contract: **PASS**.
- Full FireEdge client/server ESLint: **PASS**.
- `git diff --check`: **PASS**.
- Full production build, including both Sunstone and standalone LayerSentry bundles plus all module-federation remotes: **PASS**.
- Existing upstream Webpack export/version and asset-size warnings remain non-fatal and unchanged in nature.

This audit establishes GUI/source coverage. It does not fabricate backup execution or DR failover evidence where the live lab lacks the required backend configuration.

## Second-pass gap closure

A deeper action/role audit found and closed additional GUI gaps after the initial sidebar mapping:

- Customer-owned OpenNebula Images are now directly discoverable under Storage → Images; the native cloud image view remains authoritative for create, clone, persistence, snapshot and delete actions.
- Published VM Templates are now directly discoverable as Compute → VM Blueprints while remaining read-only definitions for cloud users; instantiation still uses the approved native lifecycle.
- Network Blueprint creation is shown only to platform administrators. Cloud users retain the native instantiate action but do not see a provider-authoring create button.
- Backup Storage is now a dedicated `BACKUP_DS`-only workspace rather than a generic datastore list.
- Customer Protection and Site Recovery pages no longer query provider datastore/zone inventory; provider readiness diagnostics are admin-only.
- Admin Marketplace Apps now has an explicit create workflow, and Support has an explicit Create Ticket action.
- Legacy base paths for VM templates, images, files, VM Groups, Network Templates and Virtual Routers redirect to the corresponding LayerSentry product surface; detail/action routes remain permission-filtered compatibility routes.
- Global search now lands on the specific Images, Backup Plans and VM Blueprints workspaces.
- Fixed FireEdge routes were separately audited: Settings/account, Alerts/Attention and layout-free Guacamole console paths remain available.

Validation added:

- Cloud/admin discoverability and role-boundary contracts.
- `BACKUP_DS`-only storage contract.
- Provider-inventory suppression for customer Protection/DR.
- Marketplace App and Support creation-action contracts.

After this pass, no unaccounted OpenNebula 7.4 sidebar or fixed FireEdge product route remains in the non-Kubernetes GUI mapping. Runtime availability still depends on backend configuration and authorization.

Second-pass qualification evidence:

- Focused capability/role contracts: 17/17 PASS before the final full-suite run.
- Complete LayerSentry suite after all second-pass fixes: 191/191 PASS.
- Full FireEdge client/server ESLint: PASS.
- `git diff --check`: PASS.
- Complete FireEdge production build, including LayerSentry bundle and all module-federation remotes: PASS.
- Existing upstream module-export and bundle-size warnings remain non-fatal and were present before this gap-closure patch.
