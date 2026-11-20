# Pending native admission entry guards

This source follow-up closes concrete overwrite and identity-mutation paths found after the 517-check generation/recovery slice dc7c988e. It has focused actual native qualification; the 517-check predecessor run is not relabeled as a run of the newer binary.

## Changes

Deploy, migrate, user-template update and updateconf reject a pending admission while holding the VM lock. Resize rejects pending state both before quota calculation and at the authoritative locked DispatchManager entry. These guards cover a canonical HOLD/SEQ0 after the final deployment-state write fails, and a partially canceled offline migration whose predecessor is already closed while its durable cancellation marker remains set. Recovery must finish before a new request changes that canonical state.

VMM response processing rejects pending admissions before mutable response handling. DEPLOY checks again under the VM lock before assigning deploy_id, closing the gap between its preliminary state observation and mutation. The same predicate continues to leave ordinary stable operations available.

## Existing validation preserved here

The old revision failed the deployment-ID invariant after 10 checks. The new revision passed all 12 callback-guard checks. The corrected old pending-entry suite failed after 41 checks with five accepting/mutating paths: initial deploy, resize and user-template update; and partially canceled offline migrate and user-template update. The new focused suite passed 42 checks with no pending-entry violations. It also proves native cancellation and subsequent stable template update, resize and placement remain available. The green resize probe uses a smaller valid demand change to avoid relying on a target-capacity rejection.

An initial pending-entry run assumed a fixed sequence after offline resize. That expectation was corrected to use canonical current sequence plus one; its receipt digest is retained. These were private PID/mount/network namespace tests with inert protocol drivers. No driver payload or original guest workload was executed or changed. This evidence preservation step only read and copied already-saved results; it did not start new fault tests or control services.

## Compiler metadata caveat

The exact vendor 7.4.1 build passed with the retained distribution hardening and gRPC/MySQL/SQLite configuration. Both oned and onemonitord hashes are recorded. The reused compiler-settings object retained the older source_head field 626d7345. generation-build-r4-source-custody.json explicitly records the actual dc7c988e source parent plus the uncommitted guard delta and verifies the native manifest against that worktree. The original compiler receipt is preserved unchanged. A frozen final candidate needs its own combined build receipt.

## Unresolved same-VM callback release risk

The separate counterexample is intentionally retained as FAIL. Checked migration A reaches driver dispatch; explicit native recover-failure restores the VM without DRIVER_CANCEL; checked B then starts on the same VM with another generation. Releasing one held old A reply causes B to report DONE. The protocol currently correlates by VM ID, and reading the generation from current history cannot distinguish that old response.

The new pre-driver cancellation path has never sent a guest request, and the qualified gateway does not expose post-dispatch recover. Those boundaries do not close the native administrative recovery risk. A verified native quiescence/refusal mechanism or actual response correlation is still required before a production claim. This follow-up does not claim to solve that risk, VMGroup admission, reserve freshness, final package installation, or controller rollout qualification.
