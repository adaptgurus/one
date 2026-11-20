# Checked OneDRS capacity and recovery qualification

## Result and release boundary

The isolated vendor 7.4.1 native daemon passed 141 capacity, lifecycle, database-failure, and crash-recovery checks. The scheduler suite passed 103 tests in normal and optimized Python. This is source and private native contract evidence, not a hypervisor migration or original-controller rollout. The driver fixtures record requests and return controlled protocol responses; they never execute driver payloads.

The candidate remains held. Trusted optimizer-origin eligibility binding and current target constraints are being integrated separately. VMGroup admission, secure-state/local-storage recovery, and ordinary enforced deploy/migrate interoperability are not certified by this receipt. In particular, legacy deploy/migrate prechecks currently precede an asynchronous unchecked reservation; that remaining race must be closed before deployment. The capability VERSION=2 in this receipt describes this capacity layer only and must not by itself enable production Apply.

## Behavior covered

Checked plans are fully preflighted before APPLYING: stable RUNNING VMs, no pinning/NUMA/PCI, same datastore, cross-host movement, one action per VM, and a monitored target in the approved cluster. The API and LCM repeat the required checks. Checked migrations enter a native-owned durable pending state before asynchronous admission. Target capacity testing and reservation share the existing host lock. User templates cannot inject the checked identity.

The native history carries immutable plan generation, action, leader term, and a separate pending bit. Pending state rejects resize and generic recovery operations. Startup and leader-epoch recovery cancel requests that have not crossed the final admission marker. Cancellation releases target accounting and restores source history through checked, idempotent writes. Driver callbacks are generation-qualified, so late completion cannot finish a replacement plan with a reused action ID.

The successful native checks cover:

- Concurrent acceptance of one plan has exactly one winner; two checked migrations competing for one free slot dispatch one migration and finish one DONE/one ERROR.
- Target capacity reduced after API precheck is rejected before any migration driver request.
- Unsupported mixed plans reject before APPLYING and before any partial history.
- Abrupt restart before host commit, after host commit, and before the final admission marker restores source RUNNING and releases target capacity without a driver request.
- Every pending cancellation history/VM write fault remains pending until a successful retry; retries reuse the same source history sequence.
- A failed live completion source-ledger write cannot report DONE; explicit native recover-success retries the release idempotently.
- Late SUCCESS and FAILURE callbacks cannot mutate a replacement generation.

## Explicit crash boundary

A crash after the final pending=false history write but before the driver request is not automatically replayed or canceled. The canonical crash-image test preserves the reservation, performs no driver replay, reports native TIMEOUT, and proves explicit native recover-failure restores the source and reports ERROR. That interval requires reconciliation; this receipt does not claim automatic end-to-end recovery across it.

An older binary must not be started while a checked request is pending or applying, including a pending=false in-progress VM. The future rollback/cohort gate must enforce that before any R8 downgrade.

## Custody and reproduction

The exact private binary is SHA-256 `8a31919626c19a80739877690fa3ccd68133cd5f6f37ac888235f48c4fb89bf1`, built in `/root/ls-onedrs-r15-vendor-build-20261120` with the vendor 7.4.1 compatibility composition. The build receipt identifies the native patch and hardened build arguments. It carries a WIP build tag; a final release must be rebuilt from the integrated source commit and requalified.

Run directory on DC2: `/root/ls-onedrs-checked-api-runtime-vendor-r15-capacity-r6-20261120`. `prepare-private-runtime.py` records the exact preparation recipe. It copies an existing private prefix, substitutes inert fixtures, creates fresh private credentials, and verifies the binary hash. Execute the captured `native_capacity_contract.py` in a fresh mount, PID, and network namespace with `unshare --mount --pid --fork --mount-proc --net --propagation private`. Only the private prefix is bound onto the native data/config/log paths. The runtime has loopback and an inert, unaddressed DOWN kernel fallback VTI interface; it has no routes or external endpoint.

Intentional crash restarts remove only the reaped private daemon's stale O_EXCL lock, mirroring the packaged service's startup cleanup. They never run global cleanup scripts or touch installed lock files. No original service, guest, installed binary, package database, or trust store was changed.

Earlier private attempts remain retained: r4 exposed a test helper selecting the oldest history instead of maximum SEQ; r5 reached 46 checks and exposed missing private lock cleanup after SIGKILL. These were harness failures, not passing receipts. The successful r6 runner was captured before further edits; its SHA and the fixture SHA are recorded in `evidence-manifest.json`.

`native-capacity-result.json` contains each check and shutdown. The source runner and inert driver are in `tools/onedrs_qualification`. The optimizer HOST_AFFINED intersection regression is included in the 103-test scheduler result and prevents Python constraints from reintroducing native-denied hosts.
