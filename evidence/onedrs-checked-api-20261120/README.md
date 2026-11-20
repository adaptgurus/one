# Native checked OneDRS API contracts — 20 November 2026

## Behavior

The native API now binds approval to an immutable generated plan and the cluster template used to compute it. New XML-RPC methods deliberately have distinct names; an older daemon rejects them instead of silently ignoring additional legacy arguments.

| Method | Arguments after session | Permission |
|---|---|---|
| `one.cluster.planexecutechecked` | cluster ID, expected plan SHA-256, expected template SHA-256 | CLUSTER ADMIN |
| `one.cluster.updatedrschecked` | cluster ID, exactly one ONE_DRS vector, expected template SHA-256 | CLUSTER ADMIN |

Cluster readback exposes `TEMPLATE_SHA256` and `PLAN_SHA256`. The plan contains `GENERATION` (a persisted 256-bit random identity) and `TEMPLATE_SHA256` (the fingerprint echoed from the original scheduler request). Clients pass native fingerprints unchanged. Both checked operations lock the cluster before the plan. Validation and the durable READY-to-APPLYING transition occur under those locks. Policy update preserves unrelated attributes and rejects updates during an applying plan.

Checked execution accepts only nonempty READY migration plans under manual automation. It rejects stale templates, replaced plans, old unbound plans, mixed/power/deploy actions and replays. Regenerating identical actions creates a new generation. Delayed optimizer responses carrying an old template identity are discarded. Existing XML-RPC and gRPC legacy method signatures remain available; the missing ADMIN authorization checks in optimize, execute and delete are corrected in the preceding security commit.

## Executed validation

- A compiled source daemon passed **43 native XML-RPC contract checks** in fresh private mount, PID and network namespaces, with loopback only, a fresh SQLite database, private test credentials, and zero registered hosts or VMs.
- Negative authorization returned native error 512. Invalid identities and injected policy payloads returned native error 4096 without mutation.
- Simultaneous policy updates had exactly one winner; simultaneous execution of the same approval had exactly one winner.
- Native generation/policy fingerprints, NIC and timestamp readback, stale computed-response rejection, replay refusal and generation persistence through restart passed.
- Both daemon shutdowns exited 0. The test-only scheduler MAD supplied plans for nonexistent VM 999999; this is native API and transaction evidence, not a migration/recovery success.
- Scheduler safety tests passed **100/100 normal** and **100/100 optimized**, including seven new request-to-plan policy identity checks.
- Independent integration-agent review confirmed lock ordering, durable transition scope, fresh DB-backed PlanPool objects and the unchanged native fingerprint flow. Its Go parser consumed `native-cluster-ready.xml` as an actual wire fixture.

## Artifact boundary

This first contract binary reports **7.5.80**, the development source version. It is **not** the deployable vendor 7.4.1 package. A vendor 7.4.1 backport build, compatibility verification and package/canary gates remain required before installation. The original R8/R13 lab binaries and services were unchanged by these tests.

The first additional wire-capture fixture was rejected during native bootstrap because the copied prefix retained a generated service-auth file while the database was fresh. Its failed receipt is retained separately. A fresh prefix containing only new oneadmin test credentials passed all 43 checks; no product guard was weakened.

## Reproduction

`tools/onedrs_qualification/native_checked_api_contract.py` is the namespace-only native harness. Prepare a fresh private prefix from an installed candidate package, omit prior SQLite databases/logs/runtime PID files, remove generated service-auth files only in that disposable prefix, and generate a new private oneadmin credential. Copy `native_plan_mad_fixture.py` to the private prefix's scheduler MAD path. Record the parent mount/network/PID namespace identities in `host-namespaces.json`, then run the harness under `unshare --mount --pid --fork --mount-proc --net --propagation private`. It refuses real networking, shared namespaces and prior test databases/results. Do not use the fixture MAD outside this disposable prefix.
