# LayerSentry private-cloud UI requirement classification — 27 September 2026

Authority: `adaptgurus/codexagentlogic@97a204748abdb6e6654ea92d1b02bb7ef03da117`, `MASTER_CONTEXT.md` Section 12 and `tasks/private-cloud-ui-resume-20260927.md`.

Audited product ref before the fixes in this continuation: `adaptgurus/one@cff1efb259f94616bcefa284f889a1be204a28ec` on `feat/private-cloud-ux-completion-20260927`.

The classifications below describe source state, not production certification. `LIVE_QUALIFICATION_ONLY` still requires the API/readback, persistence, RBAC/IDOR, exact-build browser and failure evidence in Section 12.60/12.70/12.76. An item marked `INTENTIONALLY_DISABLED` stays unavailable until its backend and safety gates pass.

| Section | Classification | Audited basis / remaining gap |
| --- | --- | --- |
| 12.1 | IMPLEMENTED_BUT_GAP | Dedicated LayerSentry bundle, shell, tokens and login exist; Settings still links to a normal native interface and invalid entry routing is insufficiently guarded. |
| 12.2 | IMPLEMENTED_BUT_GAP | VM inventory and non-fabricated CPU/RAM/disk metrics exist; environment/tier, backup/DR and network telemetry are incomplete. |
| 12.3 | MISSING_SOURCE | Complete overflow lifecycle menu and accidental-deletion protection are absent from the LayerSentry VM detail surface. |
| 12.4 | IMPLEMENTED_BUT_GAP | Compute workspace has summary/admin controls but not the complete ten-tab detail information architecture. |
| 12.5 | MISSING_SOURCE | Customer checkbox compiler and effective anti-affinity preview are absent. |
| 12.6 | IMPLEMENTED_BUT_GAP | Host failure-domain readback exists; first-class Protection Zone create/edit validation does not. |
| 12.7 | MISSING_SOURCE | Safe durable VM autoscaling workflow is absent. |
| 12.8 | IMPLEMENTED_BUT_GAP | Agent-derived health is consumed in parts of the UI; the complete Agent & Automation tab is absent. |
| 12.9 | IMPLEMENTED_BUT_GAP | Storage attach/resize/detach is typed and gated; complete environment-scoped friendly Storage Class workflow is absent. |
| 12.10 | IMPLEMENTED_BUT_GAP | Native QoS fields exist; truthful pool-specific customer choices/readback are incomplete. |
| 12.11 | IMPLEMENTED_BUT_GAP | Native storage creation is reused; the complete Identity -> Discover/Validate -> Publish LayerSentry wizard is incomplete. |
| 12.12 | IMPLEMENTED_BUT_GAP | Native NFS form exists; cluster-wide validation/readback presentation is incomplete. |
| 12.13 | IMPLEMENTED_BUT_GAP | iSCSI/multipath backend source exists; the complete dual workflow and consistent-device admission UI are incomplete. |
| 12.14 | IMPLEMENTED_BUT_GAP | Native shared-filesystem controls exist; limitations are not consistently presented in the LayerSentry workflow. |
| 12.15 | IMPLEMENTED_BUT_GAP | Context-drive support exists in native VM source; dedicated LayerSentry separation is incomplete. |
| 12.16 | IMPLEMENTED_BUT_GAP | Firmware/security backend fields and DR manifest readback exist; VM create/edit Security State workflow is incomplete. |
| 12.17 | IMPLEMENTED_BUT_GAP | Native GPU/PCI/SR-IOV support exists and is capability gated; complete impact/preflight UX is incomplete. |
| 12.18 | IMPLEMENTED_BUT_GAP | Network selection and central Security Group authority exist; complete per-vNIC effective policy editing is incomplete. |
| 12.19 | IMPLEMENTED_BUT_GAP | Native Security Group page is bridged; customer-friendly reusable rule management needs final UX/readback qualification. |
| 12.20 | IMPLEMENTED_BUT_GAP | Network create validates CIDR/VLAN/MTU/OVS and readback; Cluster Fabric multi-host workflow is incomplete. |
| 12.21 | IMPLEMENTED_BUT_GAP | Backup plan UI and native authority exist; simplified per-VM current-plan presentation is incomplete. |
| 12.22 | IMPLEMENTED_BUT_GAP | Recovery points and verified RESTORABLE DR checkpoints exist; unified VM tab/dependency presentation is incomplete. |
| 12.23 | IMPLEMENTED_BUT_GAP | Native consoles and metrics exist; complete LayerSentry tab and clipboard policy presentation are incomplete. |
| 12.24 | IMPLEMENTED_BUT_GAP | DR v2 protection APIs/UI exist; the exact three-choice per-VM workflow is incomplete. |
| 12.25 | IMPLEMENTED_BUT_GAP | Existing pairing/replication lifecycle is preserved; simplified discovery/key lifecycle UI is incomplete. |
| 12.26 | IMPLEMENTED_BUT_GAP | Zone/site readback exists; mandatory visual DC -> DR mapping is incomplete. |
| 12.27 | LIVE_QUALIFICATION_ONLY | KubeOne-only list-first cluster workspace exists and is independently capability gated. |
| 12.28 | LIVE_QUALIFICATION_ONLY | Typed KubeOne create/scale/upgrade/kubeconfig/namespace actions exist; live action/readback qualification remains. |
| 12.29 | LIVE_QUALIFICATION_ONLY | Namespace creation uses the KubeOne portal API; RBAC/readback evidence remains. |
| 12.30 | IMPLEMENTED_BUT_GAP | Qualified application catalog source exists; complete category presentation/compatibility evidence remains. |
| 12.31 | MISSING_SOURCE | Enforced Kubernetes Network QoS workflow is absent. |
| 12.32 | IMPLEMENTED_BUT_GAP | Guardian evidence presentation exists for operations/backup/DR; full correlation coverage and safe-runbook admission are incomplete. |
| 12.33 | ALREADY_IMPLEMENTED | Capability model is fail closed and mutations remain backend-owned; deployment profile wiring is a proven runtime gap handled separately. |
| 12.34 | IMPLEMENTED_BUT_GAP | LayerSentry customer pages are branded; invalid/native entry paths and the Settings native link violate the boundary. |
| 12.35 | LIVE_QUALIFICATION_ONLY | Infrastructure Architecture source exists and reuses host/network/storage/DR authorities; live topology/readback evidence remains. |
| 12.36 | MISSING_SOURCE | VM anti-affinity checkbox/compiled-rule preview is absent. |
| 12.37 | IMPLEMENTED_BUT_GAP | Environment metadata and storage APIs exist; strict Storage Class eligibility UX is incomplete. |
| 12.38 | IMPLEMENTED_BUT_GAP | Central Security Group authority is reused; per-vNIC communication summary/override is incomplete. |
| 12.39 | IMPLEMENTED_BUT_GAP | DR v2 workflow exists; exact simplified three-mode VM presentation is incomplete. |
| 12.40 | IMPLEMENTED_BUT_GAP | Snapshot/DR state exists; Checkpoint Now and complete dual-side state presentation are incomplete. |
| 12.41 | MISSING_SOURCE | VM action overflow menu is absent. |
| 12.42 | IMPLEMENTED_BUT_GAP | Native firmware fields exist; LayerSentry create-time validation/storage binding is incomplete. |
| 12.43 | ALREADY_IMPLEMENTED | KubeOne portal is the only LayerSentry Kubernetes lifecycle path; retired OneKS is not used by the workspace. |
| 12.44 | MISSING_SOURCE | 60-day events date-window UI/admission is absent. |
| 12.45 | IMPLEMENTED_BUT_GAP | Safe plan clone/storage-change primitives exist; Compliance 6M built-in plan is absent. |
| 12.46 | MISSING_SOURCE | LayerSentry proxy and notification-policy settings UX is absent. |
| 12.47 | IMPLEMENTED_BUT_GAP | Password/TOTP backend and login enrollment states exist; mandatory all-user deployment enforcement and dedicated settings UX need qualification. |
| 12.48 | IMPLEMENTED_BUT_GAP | Host storage/device readback exists; automatic cluster-scoped onboarding discovery workflow is incomplete. |
| 12.49 | LIVE_QUALIFICATION_ONLY | Architecture summary exists; authoritative health/click-through evidence remains. |
| 12.50 | ALREADY_IMPLEMENTED | Existing VM-service/Ansible lifecycle is reused; no duplicate controller is introduced by this UI branch. |
| 12.51 | IMPLEMENTED_BUT_GAP | Application-specific production wizard exists; exact certified-tuple gating needs live/backend qualification. |
| 12.52 | IMPLEMENTED_BUT_GAP | OS-specific root/Administrator access request compiler exists; one-time handover live evidence remains. |
| 12.53 | IMPLEMENTED_BUT_GAP | Native HA fields exist; complete LayerSentry HA selection/effective prerequisites are incomplete. |
| 12.54 | IMPLEMENTED_BUT_GAP | LVM backend source exists; friendly shared-LVM admission/readback workflow is incomplete. |
| 12.55 | IMPLEMENTED_BUT_GAP | Backup Storage workspace/source exists; complete guided discovery/capacity workflow is incomplete. |
| 12.56 | IMPLEMENTED_BUT_GAP | Retention compiler exists; exact tiered policy/source and fault qualification are incomplete. |
| 12.57 | IMPLEMENTED_BUT_GAP | DR v2 measured transfer telemetry exists; unified per-VM immediate actions are incomplete. |
| 12.58 | IMPLEMENTED_BUT_GAP | Search and Guardian evidence components exist; authoritative cross-resource Guardian scoping is incomplete. |
| 12.59 | IMPLEMENTED_BUT_GAP | LayerSentry pages mostly normalize wording; bridged/native errors still need full normalization evidence. |
| 12.60 | LIVE_QUALIFICATION_ONLY | This is an acceptance gate; no production claim is permitted before exact-build evidence. |
| 12.61 | MISSING_SOURCE | Dedicated AD/LDAP and trusted-gateway OIDC LayerSentry settings workflows are absent. |
| 12.62 | MISSING_SOURCE | User/site timezone and locale UX with Asia/Kolkata default is absent. |
| 12.63 | IMPLEMENTED_BUT_GAP | Native cluster DRS source exists; dedicated LayerSentry DRS surface and fail-closed Full automation admission are incomplete. |
| 12.64 | IMPLEMENTED_BUT_GAP | Users/groups/VDC quotas/ACL source exists and is bridged; unified Project boundary/quotas/access-rule UX is incomplete. |
| 12.65 | IMPLEMENTED_BUT_GAP | Native zones/federation state exists; dedicated Sites & Federation health/staleness view is incomplete. |
| 12.66 | IMPLEMENTED_BUT_GAP | Native accounting/showback APIs and tabs exist; dedicated LayerSentry Usage & Showback surface is incomplete. |
| 12.67 | IMPLEMENTED_BUT_GAP | Native VM/service/backup scheduled-action controllers exist; unified LayerSentry inventory is incomplete. |
| 12.68 | IMPLEMENTED_BUT_GAP | Host/VM metrics are consumed; forecasting confidence/evidence presentation is incomplete. |
| 12.69 | IMPLEMENTED_BUT_GAP | Broad native parity navigation exists; missing dedicated DRS/federation/showback/schedules and branding normalization remain. |
| 12.70 | LIVE_QUALIFICATION_ONLY | Identity/DRS/native parity is an acceptance gate. |
| 12.71 | LIVE_QUALIFICATION_ONLY | First-class read-only Host Detail and authoritative VM placement/count source exist. |
| 12.72 | LIVE_QUALIFICATION_ONLY | Host Network tab defines all six roles and desired/observed attributes; live telemetry/readback evidence remains. |
| 12.73 | ALREADY_IMPLEMENTED | Host Detail is read-first and directs edits to owning workflows; it exposes no duplicate host controller. |
| 12.74 | LIVE_QUALIFICATION_ONLY | Storage & Devices inventory exists; exact host identity/path evidence remains. |
| 12.75 | IMPLEMENTED_BUT_GAP | Host page shows DRS/maintenance constraints; complete migration comparison/evacuation plan is incomplete. |
| 12.76 | LIVE_QUALIFICATION_ONLY | This is the mandatory Host Detail acceptance gate. |

## Runtime binding before mutation

Authorized runner audit run `36333714537` proved that `layersentry1` (`172.17.60.30`) runs `opennebula-fireedge-7.4.1-1.el9` from `/usr/lib/one/fireedge/dist/index.js`. The deployed `bundle.layersentry.js` SHA-256 is `729214f5f0818219bfef4a8219f41da7aec85206e65f5382cd91b65338d34414`; `index.js` is `dd614718582a1f528c6710f521ac2daeb673946db03207a660e3086ec6b40b6e`. Those hashes exactly match the ignored build output generated in the bound worktree immediately after `cff1efb259f94616bcefa284f889a1be204a28ec` and before the service start at 20:41 IST. No source checkout exists on the runtime host.

The same audit proves `/fireedge/undefined/` now server-redirects to `/fireedge/layersentry`, but the deployed capability configuration does not expose a capability file/profile and the owner-observed authenticated shell remains restricted to unconditional navigation. This is a deployed configuration/profile failure, not proof that the workspaces are absent from the matching bundle.
