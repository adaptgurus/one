# Native plan generation and enforced admission recovery

This evidence qualifies a bounded source change against the retained vendor 7.4.1 native build. It is not an original-controller deployment or a hypervisor migration result.

## Problem and resulting behavior

Native scheduler actions previously acquired their history ownership after asynchronous dispatch. A late completion could affect a replacement plan that reused an action ID, and ordinary scheduler migration passed `enforce=false` despite a prior capacity estimate. Every native plan action now persists its immutable generation before dispatch, the VM history receives that identity under the VM lock, and callbacks require the exact generation. Native planner deploy/migrate enforce capacity at final admission; an explicit direct administrative force request retains its existing override.

An enforced request can stop after its target history is published and before LCM consumes the queued event. Native history now records the original VM state and a durable cancellation marker. For the qualified unpinned, no-PCI/NUMA, same-datastore and same-cluster shape, `one.vm.recover(session, vm_id, 0)` cancels that pre-driver admission without replaying a guest action. It releases a target reservation, reacquires source capacity through the current authoritative ledger when needed, and restores the source history/state. Each failed history, VM or host write leaves a retryable unresolved request; recovery success requires durable completion. Initial HOLD/PENDING deployment supports repeated cancel/redeploy, including a canonical closed prior canceled attempt.

A failed API VM write can leave an unreferenced next history row. Enforced requests and native plan-owned requests now reuse only that next sequence derived from the exclusively locked canonical VM history. They do not invent a new sequence or replay an old request. Unsupported hardware/storage/origin shapes remain explicitly unresolved.

Scheduler response transport identity is also checked before a plan can be stored: OPTIMIZE payload cluster must equal its native envelope cluster, and PLACE must use the native placement plan ID -1.

## Validation

The exact r3 binary passed 517 checks in the combined private native XML-RPC suite. The suite includes checked capacity and crash recovery, current capacity contention with ordinary deploy/resize, cold persistence and terminal source accounting faults, generation-qualified late success/failure against an actually APPLYING replacement, response resource mismatch, ordinary API-to-LCM restart reconciliation, repeated initial cancellation, target-reserved and source-released crash images, cancellation write retries, source-capacity drift, and orphan-history retry.

The native crash images were captured from real native SQLite commits using private observation triggers. Restarts use those captured canonical rows. Driver protocol fixtures are inert and never execute a guest payload; PID, mount and network namespaces are isolated with loopback-only networking. Raw databases/authentication files remain private and are not committed here.

The focused reserved-ledger suite passed 30 checks, and the focused orphan retry suite passed 17 checks. Python scheduler tests passed 131 tests in normal mode and 131 under `-O`; qualification/rollback tests passed 92 in each mode. The native C++ driver lifecycle implementation is unchanged by this slice; its earlier lifecycle qualification is not re-labeled as a new run.

## Retained failures and build custody

`retained-runs.json` distinguishes two reproduced native defects from test setup/protocol mistakes. The old binary failed a second initial cancellation and ordinary retry after an orphan history write. Other retained failures came from wrong log locations, a cold setting carried into a live-only test, and an inert DEPLOY reply missing its required deploy ID. Native correctly rejected that malformed reply. The final combined run includes an explicit driver fixture revision receipt: the reply correction was installed before the affected companion test and loaded on the next native restart.

The vendor build uses the existing distribution hardening, gRPC, MySQL and SQLite flags. `native-build-receipt.json` records both oned and onemonitord hashes, exact compile command, base binary, source delta hash and all changed native source hashes. `changed-source-manifest.json` binds the source and qualification code in this slice. The build label identifies an uncommitted-source qualification build; a later frozen combined candidate requires its own final build and package receipt.

## Callback correlation boundary

The proved stale callback cases retain action A as the current history on VM A while a replacement plan action B is actually APPLYING on VM B. They do not prove transport correlation after an operator forces post-dispatch recovery of A and starts B on the same VM. The existing MAD protocol carries VM ID; native recover-failure for an admitted MIGRATE can enqueue LCM failure without DRIVER_CANCEL. Such force/recovery is outside the qualified pre-driver cancellation path and requires explicit reconciliation of the outstanding guest action. The new pre-driver cancel path has sent no guest action. A separate follow-up is testing rejection of a stale DEPLOY reply before it can alter deploy_id during pending admission.

## Release limits

This slice does not close the native VMGroup admission hook/runtime gate, N+1/N+2 material freshness and reserve proof gate, complete typed operator feature scope, dependency-complete candidate installation, or original-controller deployment/rollback/custody gates. No original service, VM, host membership or policy was changed by these private tests. Preserve the current downgrade guard and inspect authoritative canonical VM/history/plan rows after writers are frozen and the controller stopped; a live observation alone does not authorize rollback.
