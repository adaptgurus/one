# Enforced native admission and recovery qualification

## Verified result

One captured private native run passed **320 checks** on vendor 7.4.1 binary SHA-256 `e93458d6aeec3eb59e5671e45dfb535338f664efc8b517a7d86b5f834f1ffd8c`. The tested native patch is `0a423129a021dbc04a72649273f3d15c98292df0b0190785143afa21d88719e0`; it was compared byte-for-byte with the source patch when this evidence was captured. Scheduler tests passed 103/103 in normal and optimized Python; rollback/qualification tests passed 79/79 in both modes, including 16 downgrade-state guard cases.

This run uses the real native XML-RPC, SQL pools, plan manager, dispatch manager, LCM, host accounting, and driver protocol. Disposable drivers return controlled responses and never execute guest payloads. It does not prove an actual hypervisor migration, original controller deployment, or full production readiness. Original services and guests were not changed.

## Defect reproduced and corrected

The ordinary native deploy/migrate API checked `enforce=true` before publishing target history, but LCM later reserved capacity without that intent. The retained `legacy-red-result.json` demonstrates this in the prior capacity binary: an exact database trigger reduced target capacity after the API precheck, and both ordinary deploy and migration still dispatched a driver while accounting exceeded the reduced limit. Its result is `REPRODUCED`, not a safety pass.

The native history now persists `ENFORCE_CAPACITY`. Old histories default to false. Enforced deploy, migration, and resize use the same host lock for final capacity testing and reservation. An allocation's native VM metadata is persisted before the host accounting commit; failed writes prevent driver dispatch. Explicit direct API `enforce=false` retains the existing override and is tested separately as an intentional override.

Deployment refusal enters native PROLOG_FAILURE without TM/VMM work. Ordinary same-datastore, same-cluster, unpinned running migration can restore source history using checked writes. Enforced offline admission refuses before releasing source capacity or starting transfer. Retry cannot bypass final capacity admission, and recover-success cannot declare an unreserved operation successful. Resize also refuses an enforced migration's open previous-history interval.

Cold migration and recovery paths check source/target histories, host accounting, and VM state before the next driver step. Prolog completion defers RESTORE/DEPLOY until the BOOT state is durably recorded. Recovery from an offline transfer failure uses idempotent target release, enforced source reservation, and history upsert. For the admitted simple recovery shape, canonical VM placement remains at the failed target until source accounting commits, so an ambiguous committed reservation can be adopted on retry.

Enforced source recovery involving pinning, PCI, NUMA, datastore changes, or cluster changes remains explicit unresolved reconciliation; it is not reported as restored. The native checked Apply scope already excludes those workload shapes. These broader workload recovery features remain a separate release requirement.

## What the 320-check run covers

The complete run repeats the original checked-plan race, stale-capacity, whole-plan shape, native history injection, pending-state exclusion, restart, cancellation, terminal accounting, and stale-generation callback tests. It adds:

- Every cold SAVE-to-TM persistence boundary and every native failure-restoration history/accounting boundary.
- Initial API history-insert and VM-body failures. An unreferenced failed history remains invisible to the source VM; a new generation replaces only its own next sequence and dispatches with its own identity.
- Enforced ordinary deploy, live migration and cold migration refusal after a stale precheck, with no driver dispatch; successful retry after capacity becomes available.
- Enforce intent surviving restart, missing-reservation recover-success rejection, and retry rechecking current capacity.
- Three actual concurrent checked-Apply/ordinary-deploy races and one checked-Apply/resize race, each with one winner for one free slot.
- Enforced resize database-write failure rejecting the request without a driver action or VM resource change.
- Offline refusal recovery both without a target reservation and after a failed transfer with a committed target reservation and released source capacity.
- Target/source host-write, target/restored history, and VM-write failures during offline recovery, preserving failed-target identity until retry succeeds and reusing one history sequence.
- Source capacity consumed before rollback, which blocks recovery instead of overcommitting; successful recovery after capacity returns.
- An offline retry refusing TM while source-accounting release fails.
- Checked cold RESTORE withheld when final prolog history or BOOT-state persistence fails, followed by successful native recovery.

The earlier final-marker boundary remains explicit: a crash after pending=false but before driver dispatch is not automatically replayed or canceled. The native plan times out and requires reconciliation. The combined run proves native recover-failure for that canonical crash image; it does not claim exactly-once external guest execution.

## Downgrade gate

`tools/onedrs_qualification/native_downgrade_guard.py` opens SQLite read-only and checks the authoritative history selected by each VM body. It blocks LCM state72, native pending history, checked/enforced in-progress VMs, APPLYING plans, and GENERATING or unknown planning requests. It preserves terminal request identifiers in its report because R8 may discard unknown request metadata on later writes; error text is represented by a hash.

Three actual native database snapshots were checked: stable baseline allowed, reserved pending request refused, and completed callbacks allowed. Database hashes remained unchanged. An orphan history row is not mistaken for an active VM. The rollout caller must first freeze placement/plan writers, synchronize replication, and stop the controller; a live database snapshot alone does not authorize rollback. Retain the report before starting an older binary.

## Custody and remaining candidate work

The successful full run is `/root/ls-onedrs-checked-api-runtime-vendor-r16-full-r2-20261120` on DC2. Its captured runner SHA and inert driver SHA are in `evidence-manifest.json`. `prepare-private-runtime.py` records preparation; its optional binary and build-receipt arguments verify exact custody. Execution requires fresh private mount, PID and network namespaces. The fixture has no external network route and binds only its own native data/config/log directories.

The hardened native build receipt and earlier red/green receipts are retained. The initial API-history r1 attempt failed in a test configuration regex after bootstrap; corrected r2 passed 25 checks, and all those cases are included in this 320-check run. No earlier failure is relabeled as a pass.

Before a deployable candidate is frozen, integrate the independently tested optimizer-origin eligibility layer, native planner enforce defaults and generic generation binding, checked Generate/Reject, and the separately qualified VMGroup support. Rebuild from the immutable combined commit, qualify the exact package/signature and old-binary rollback gate, refresh original guest custody, and perform the authorized follower/candidate live tests. This receipt deliberately does not substitute for those remaining gates or for hosted CI, which is externally blocked.
