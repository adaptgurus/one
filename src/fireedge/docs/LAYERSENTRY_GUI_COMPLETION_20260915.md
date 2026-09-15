# LayerSentry GUI Completion — 2026-09-15

Status: SOURCE_COMPLETE for the non-Kubernetes custom GUI scope; LIVE_DEPLOYMENT_PENDING at this commit point.

Owner scope change: the dedicated Kubernetes UX/add-on catalog is deferred. Native OneKS lifecycle remains available inside LayerSentry and is not redesigned in this slice.

## Completed product surfaces

- First-class FireEdge application at `/fireedge/layersentry/`; bare FireEdge requests redirect to LayerSentry instead of Sunstone.
- Responsive LayerSentry shell with grouped navigation, global search, project context, operations/alerts, support, settings and mobile navigation.
- Compute workspace with VM inventory/summary, create workflow, native lifecycle actions and provider-detail hardening.
- Storage workspace with create persistent disk, attach existing disk, resize, detach-with-preserve behavior and separately confirmed permanent image deletion.
- Network workspace with environment/tier naming guidance plus Networks, Firewall Rules and Network Blueprints.
- Protection workspace with Backup Plans and Backups/Restore, plus explicit snapshot/backup/restore semantics.
- Applications workspace with My Applications, Application Catalog and deploy workflow backed by OneFlow.
- Operations workspace with Health & Alerts, Support and explicit audit-backend boundary.
- Access/admin navigation for Users, Teams, Projects, Roles, Limits and Access Rules, including create flows where native APIs exist.
- Infrastructure/admin navigation for Hosts, Compute Clusters, Storage Pools, Zones / Sites and Providers, including create flows where native APIs exist.
- Platform/admin navigation for Images, VM Blueprints and Application Definitions.
- Settings retains explicit admin-only native Sunstone fallback for emergency troubleshooting; native Sunstone is not the default product entry.
- Search covers VMs, OneKS clusters, networks, applications, images/disks and backup plans visible to the current role.

## Kubernetes boundary

LayerSentry exposes the current OneKS list/create/detail/scale/upgrade/recover/kubeconfig lifecycle through the existing authorized FireEdge components. A dedicated LayerSentry Kubernetes design, add-on catalog and install UX are intentionally deferred by owner direction.

## Qualification evidence

- Full LayerSentry source/regression suite: 182/182 PASS.
- Full FireEdge client/server ESLint: PASS.
- `git diff --check`: PASS.
- Complete production build: PASS for client bundles, server bundle and all module-federation remotes.
- Dedicated `bundle.layersentry.js` produced successfully.
## Remaining qualification boundaries

The GUI source is complete for the agreed non-Kubernetes scope, but source completeness is not the same as production certification. After deployment, the clean LayerSentry URL, FireEdge service health, OpenNebula inventory and browser login rendering must be rechecked. Authenticated browser automation may remain limited by credential-safety controls; this does not justify bypassing them.

Destructive storage and infrastructure actions remain protected by backend authorization and explicit confirmation. No customer data disk is treated as disposable merely because a UI action exists.
