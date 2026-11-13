# OneDRS continuation: strict native VM-state and identity admission

13 November 2026. **Source/test correction completed; not packaged or deployed.**
Implementation: `c33bab453d4a266166b2501e9a3d16178bf8db4b`.
Parent: R10 evidence head `8e976810e8423667fc9691238f7bc30a6dc7a08a`.
This is a separate stacked review branch. R10's exact prepared canary RPM,
rollback RPM and original deployment branch were not changed.

## Pending live execution checked first

The requested continuation began with read-only DR3 package/process/evidence
checks. DR3 still runs original r8 with PID2820, and the canary directory contains
only staged packages, public key and the earlier private database backup. No
canary result exists. A final three-host read verified original r8 running hashes
on DR1–DR3 and the exact R10 staged RPM hash on DR3. Therefore the prior DR3
signature-enforced install/restart/rollback operation has not executed. It was
not rerun, split or routed through another host/tool. DR4's earlier review remains
separate; this branch does not register DR4 or change its eligibility.

## Independently reproduced source defects

1. `OptimizerParser._map_vm_state()` previously returned RUNNING for every state
   outside its few recognized cases, including HOLD, SUSPENDED and active LCM
   transitions. It also accepted POWEROFF/PENDING regardless of their LCM state.
   Native `get_cluster_vms()` excludes DONE but does not restrict its selection
   to only stable RUNNING/POWEROFF states; silent fallback is therefore not an
   appropriate safety boundary. No actual unintended live guest boot is claimed.
2. The VM-pool dictionary silently overwrote duplicate native IDs. Missing
   requirement-referenced VMs were silently omitted instead of refusing the plan.
   Duplicate or wrongly typed required IDs also lacked explicit rejection.

The final new regression suite was run against the unchanged original parser:
13 tests ran, with52 failing subcases and0 errors. These are expected red results,
not a failed production operation. The initial development reproduction is also
retained. No workload power action was submitted to reproduce the issue.

## Correction

Only these exact integer state pairs are supported by the parser:

| Native STATE / LCM_STATE | Preserved scheduler meaning |
|---|---|
|1 /0 |PENDING |
|3 /3 |RUNNING |
|8 /0 |POWEROFF |

Other states, lifecycle transitions, missing values, booleans and coerced float
or string values raise a specific ValueError rather than becoming RUNNING.
Validation runs before the selected VM's storage requirements are interpreted.
Stable powered-off VMs remain POWEROFF: this patch does not restart them, remove
them from native resilience inventory, change their reservations or manufacture
protection approval. Existing VM11 survivor/storage admission remains independent.

Native identity and requirement collections must contain unique nonnegative
integer IDs; each required ID must be present. Invalid identities or ambiguous
requirements fail closed. VM0 remains valid. Unselected VMs are not assigned a
new power-state meaning. Original VM constraints, blocked-placement policy,
capacity amounts, storage calculations and per-VM eligible destinations remain.

The stricter parser can refuse optimization while a selected VM is in a lifecycle
transition. The intended behavior is retry after a fresh stable native snapshot,
not assume RUNNING or dispatch a competing operation. Real native plan application
must still independently validate current state: this parser is not a replacement
for transactional admission or stale-plan checks.

## Executed verification

-13 focused tests PASS on the corrected parser.
-All54 native Python scheduler tests PASS, including the existing resilience and
 CBC solver regressions.
-2,829 explicit STATE/LCM_STATE combinations checked; only the three exact supported
 pairs admitted. This exhaustive range is not a claim about every possible input.
-Seven actual xsdata/native-VM XML decoding cases checked: valid states preserve
 meanings; omitted/transient fields are rejected.
-Duplicate complete VM fixtures, missing required records, duplicate requirements,
 malformed IDs and refusal-before-storage cases verified. Selected VM requirement
 tests mock storage calculation, not a live hypervisor or database.
-Python byte compilation and git whitespace checks PASS.

This is targeted scheduler source acceptance, not a full native C++/RPM rebuild,
hosted CI certification, physical failure test or corrected-candidate runtime.

## Fresh actual inventory audit (read-only)

Two native reads around candidate state classification contained26 VMs:
14 RUNNING and12 POWEROFF. Every observed ID/name/owner/state/LCM/host/datastore/
history record remained identical between the reads. The candidate classified
the observed stable states correctly. No native mutation call was issued.

This proves correct classification of that observed inventory, not recovery
eligibility or VM availability after a failure. The existing two running
non-shared-storage workloads and constrained placements are not waived by this
change. A powered-off VM is not relabelled as unprotected merely to make a
cluster-level admission request pass.

## Remaining original task

The current release still needs the exact reviewed DR3 canary/rollback operation,
installed-candidate rescheduling and four-host qualification. DR4 registration,
secure-state helper enrollment, actual storage/placement recovery, independent
fencing and physical network/power-loss tests, deployed AI execution and guest/
application acceptance remain open. Production trust and soak are later separate
gates. No additional service account or broader administrator permissions were
needed for this independent correction.

All three live cores and the R10 artifacts remain unchanged. This source guard
requires independent review and later release integration; it is not part of the
R10 RPM already prepared for the pending review. Whole-module production readiness
has NOT been declared.

## Evidence

`original-final-tests-red.log`: final tests against unmodified parent source.
`fixed-focused.log`, `fixed-full.log`: corrected tests.
`live-state-classification.json`, `vm-before.json`, `vm-after.json`: read-only audit.
`current-deployment-readback.json`: actual live r8 hashes and staged R10 identity.
`summary.json`: exact result/limitation matrix.
`SHA256SUMS`: evidence digests.

Native lifecycle documentation consulted:
https://docs.opennebula.io/7.4/product/virtual_machines_operation/virtual_machines/vm_instances/
