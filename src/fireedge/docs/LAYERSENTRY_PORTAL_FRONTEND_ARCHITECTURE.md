# LayerSentry Unified Portal — Frontend Architecture

Status: PARTIAL — portal foundation source-complete; full product workflows pending
Date: 2026-09-15
Integrated P2 base: `adaptgurus/one` @ `a83be8a4b4220dfbd5cbe9552256b3a68d984b38`
Central authority: `adaptgurus/codexagentlogic` @ `4f51de3e393c9619f3e5530d37fe6c25b7ec8b92`

## Product boundary

LayerSentry is the default product UI. OpenNebula, OneKS and OneFlow remain the lifecycle engines. Native Sunstone stays installed for explicitly authorized platform administrators, but it is not the normal portal and is never exposed to tenant users.

The portal reuses the existing FireEdge authentication, session, Redux/RTK Query services, OpenNebula API routing, OneKS/OneFlow APIs, console transports and resource state machines. It does not call the OpenNebula database directly and does not add browser-side privileged XML-RPC.

## Integration strategy

The initial implementation lives inside the existing FireEdge Sunstone bundle so it can reuse the supported session and API infrastructure without duplicating authentication. After authentication, LayerSentry owns the shell, routes, navigation, terminology and visual system. Existing OpenNebula resource components are reached through an explicit bridge while each product area is progressively replaced by LayerSentry-native views.

The P2 third-pass provider-boundary hardening was qualified, committed separately, and integrated before the unified portal commit. The deployed portal source includes that P2 base and preserves the native FireEdge/OpenNebula lifecycle boundaries.
## UX architecture

The shell is one coherent product for all roles: top bar, grouped left navigation, page frame, status language, search, notifications/help affordances and account controls. Capability changes are role-driven; the product does not fork into unrelated UIs.

Primary navigation:

- Overview
- Compute
- Kubernetes
- Storage
- Network
- Protection
- Security
- Operations
- Support
- Settings

Platform administrators additionally receive Infrastructure, Access and Platform groups. Technical provider fields remain out of tenant data paths, not merely visually hidden.

## Visual system

The visual reference is the current Cozystack console's quiet enterprise treatment: neutral white/slate surfaces, strong typography, thin borders, compact radius, restrained motion and schema-driven consistency. LayerSentry keeps its own identity with navy navigation, royal-blue actions and limited cyan/teal accents.

All colors are semantic tokens. Components must not embed brand hex values. Theme changes, customer branding and future dark mode must be possible from central token sources.
## Route contract

LayerSentry routes are product routes; backend resource paths are implementation details.

| Product route | Backend authority |
| --- | --- |
| `/overview` | aggregated FireEdge/OneAPI queries |
| `/compute` | `/vm` |
| `/compute/create` | `/vm/create` |
| `/kubernetes` | `/kubernetes` |
| `/kubernetes/create` | `/kubernetes/create` |
| `/storage` | `/datastore` plus VM disk actions |
| `/network` | `/virtual-network` |
| `/security` | `/security-group` |
| `/protection` | `/backupjobs` and `/backup` |
| `/applications` | `/service` |
| `/infrastructure/*` | host/cluster/datastore admin resources |
| `/access/*` | user/group/VDC/ACL admin resources |

The resource bridge resolves only routes already authorized by the current OpenNebula view. A missing authorized endpoint becomes a clear unavailable state; it must never bypass RBAC.

## Native Sunstone fallback

Native Sunstone is preserved but hidden from normal navigation. Only an authorized platform-admin view may deliberately request it. The normal portal does not expose the legacy appearance switch. Direct native compatibility remains available for emergency administration and troubleshooting.