# OneDRS restoration completed; bounded rollback continuation qualified in source

## Immediate operational result

The exact user-approved restoration ran once on DR1, process2669536, remote
call8b32e37c-d58d-4387-a481-237166711c71, completing on14 November2026 at
06:09:59UTC /11:39:59IST. Its complete receipt is
`approved-post-timeout-recovery.json` with PASS_POST_TIMEOUT_RESTORATION.
It was not rerun. This supersedes the previous pending-review/paused-management
status. The original R10 rescheduling PASS and original90-second rollback
deadline FAIL are both retained without rewriting either result.

Independent live readback06:11UTC confirmed zone0 enabled, all3 native hosts
MONITORED, one leader/two followers with equal term3531 and committed/log index,
all26 original VM records identical, originalr8 installed and running on all3,
exact original deployment drivers/configuration, all previously active services,
original per-host running-domain UUIDs, no temporaryaa428403 verification key,
and SELinux Enforcing. No new service account, privilege expansion, controller
restart, database restore, signing trust enrollment or NFS deletion was performed
in this continuation. Existing ls-onedrs-lab-svc remains the test identity.

## Root cause that is actually established

The attempted coordinator placed synchronization and all remaining restore steps
inside one broad try block. When quorum(90) raised, the exception path recorded
the failure and skipped unfreeze, ancillary services and key cleanup. Its bare
assertions also discarded the lagging-node diagnostic. Tests execute the actual
original finalization AST and reproduce that skipped restoration path.

Additional reproduced hazards: the original quorum reader ignored SERVER_ID and
could accept COMMIT greater than LOG_INDEX; optimized Python disables its
assertion-based checks. These are qualification-tool defects, not a demonstrated
fault in native Raft. The underlying cause of DR2's historical late last-entry
catch-up is not established by this work. No network/storage RCA or Raft tuning
fix is claimed, and no native safety setting was weakened.

## Corrections and actual validation

Source is under `tools/onedrs_qualification/`. A strict bounded checker and
restoration continuation are integrated into a generated candidate coordinator.
Two complete same-authority samples with closing leader reads are required.
Malformed identities, term/role drift, regressing commits and invalid geometry
refuse action. A separate bounded recovery window can complete original-state
restoration after a missed deadline, but acceptance remains FAILED. Existing
original cores are not unnecessarily reinstalled/restarted. Exact original
binaries/driver/configuration/domain inventory are checked before unfreezing.

58 distinct test methods PASS on Python3.9, again under Python optimization, and
on Python3.12. These repeats are not174 distinct tests. The58 include9 tests of
the generated coordinator's actual finalization code and6 tests over actual
loopback HTTP/XML-RPC with effect spies. Source generation, compilation and
whitespace checks pass. The executor itself explicitly rejects optimized Python
before any native action. A retained initial optimized test failure documented
the legacy assertion bypass; the corrected test checks that behavior explicitly.

27,000 finite role/commit/uncommitted-suffix combinations were checked:9 admitted
valid combinations,26,991 refused, no false acceptance/rejection against the
specified model. This is not physical fencing/partition failure injection.

The corrected read-only guard was also run against the actual restored native
APIs: two complete synchronized samples, leader0, term3531, common index138818,
1.027967seconds observed, zero mutation calls. See
`actual-native-strict-probe.json`. No secret or private authentication bytes are
included in that receipt.

## Observation and exact limits

The separate finite15-minute original-r8 observation PASSED from06:14:12 to
06:29:13UTC (11:44:12 to11:59:13IST),901.184seconds. It contains181 real Raft
samples and31 original PID/configuration/VM/domain/service/trust checks, with
zero sampled commit gap, no restart or detected original-workload change, and
no errors. Full timestamped data are in `postrestore-observation/`. It is explicitly
**read-only original-r8 stability**, NOT an R10 load/stress test, candidate soak,
physical failure recovery, or the required12-hour production soak.

The new candidate runner has NOT been used for another effectful cohort upgrade
or rollback. Its source/fault tests and read-only native probe do not close that
live replay gate. Original historical90-second rollback failure remains failed.
No new production signature, package rebuild, merge, runtime guard installation
or DR4 registration occurred. PR55 is not incorporated or deployed.

## Remaining release work

Review and effectfully replay the revised runner on a fresh admitted lab cohort;
qualify interruption recovery; integrate/rebuild/test the final source including
the separate VM-state guard; complete DR4 and true nonshared-storage eligibility,
physical power/fencing/network-partition tests, multi-host secure-state recovery,
global optimizer/AI/application acceptance, candidate stress and full soak,
independent review and production release trust. Whole module remains NO-GO.

The immediate management restoration blocker is closed. Existing15-minute
qualification-watch timer remains enabled; its release gate correctly remains
NO_GO. No new recurring automation was created.
