# OneDRS R10 — actual native rescheduling accepted; final management restoration pending

Checkpoint: 14 November 2026, 10:30 IST (05:00 UTC).

## Operational priority

**The actual native R10 placement/rescheduling test PASSED. The third cohort's automated rollback completion FAILED its 90-second synchronization deadline. Original r8 binaries and original deployment drivers have been restored, but the zone and native host objects remain disabled and ancillary management services remain paused. The exact final restoration call is awaiting the user's Desktop Commander review. Whole module: NO-GO.**

Latest independent read at 05:00:16 UTC: all three native servers agree on term 3531 and COMMIT=LOG_INDEX=138566. DR1 is leader; DR2/DR3 are followers. All 26 original VM identity/state/host/datastore/history records are identical. Zone0 is state1 (disabled); host objects0/1/2 are state4 (disabled). These are management/monitoring states, not physical host power-off. The original 14 running guest domains were not intentionally stopped.

The pending operation revalidates synchronized state, re-enables the original zone/host objects, starts the original ancillary services, verifies the original workload/domain inventory, and removes only this run's temporary lab verification key. It was blocked twice unchanged and submitted to the exact execution-review panel. No alternate tool, host, split command, agent or permission workaround was used. The readback contains no post-timeout-restoration receipt. **Do not claim full service restoration or start another rollout/fencing/provisioning operation before that exact restoration executes.**

## Approved DR3 follower canary — PASS

The user-approved existing call `3ff5f6c4-9a2c-4108-b281-b8615f6d9b09` ran exactly once, 04:16:20–04:16:54 UTC on 14 November. Its process180033 exited0; it was retrieved rather than reissued.

Actual signature-enforced DNF installed R10 on DR3, started native services, verified the running executable and authenticated API7.4.1, and observed synchronized follower state. It then installed the signed original r8 rollback artifact, restored the exact original driver and restarted services. All26 native VM records were preserved, DR1 remained leader, and that run's temporary key was removed. Candidate and rollback readiness observations were1.515s and0.561s respectively; these are polling observations after startup, not complete restart duration, guest outage or RTO.

## Three-controller qualification and actual scheduler result

The exact same-version R10 package was installed on DR1–DR3 in a bounded coordinated maintenance experiment. Each run checked stable VM states, pinned host identities/artifacts/configuration, backed up native databases and configuration root-privately, froze writes, stopped followers before the leader, used signature-enforced local DNF, and checked real running binaries and Raft state. No database schema migration or database restore was performed. Hypervisor networking and physical host power were not changed.

The independent third-run witness at04:52:52 UTC verifies on all3 hosts:
- installed AND `/proc/<pid>/exe` SHA256 `782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb`;
- package `opennebula-7.4.1-10.ls.onedrs.pr54.07c9128.el9.x86_64`;
- SELinux Enforcing; the original14 running domain UUIDs remained present.

Native scheduler configuration was unchanged: `one_sched -t 15 -p one_drs -o one_drs`.

### Disposable VM46: PASS_NATIVE_PLACEMENT_AND_RESCHEDULE

The existing `ls-onedrs-lab-svc` identity (UID10/GID107) instantiated one admin-prepared, scoped disposable template. Temporary USE ACLs applied only to this run's template and shared datastore. No globally privileged service identity was created.

Native OneDRS initially selected DR2/host1. One native reschedule request then selected DR1/host0. There were **zero manual deploy calls and zero manual migrate calls**, and no hard-pinned fallback. The native event log proves SAVE_MIGRATE, save, restore and RUNNING. `LIVE_RESCHEDS=0` was preserved, so this was native save/restore cold rescheduling—not a live-migration or physical-failure test.

| Witness | Observed result |
|---|---|
| Initial placement | host1, historyseq0, sharedDS121 |
| After native reschedule | host0, historyseq1, sameDS121 |
| Domain UUID | `005345c9-4234-427c-a48b-4ad95bd31978`, unchanged |
| Boot identity | unchanged; boot_count remained1 |
| Guest heartbeat | advanced from3 to13 |
| Guest data SHA256 | `5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a`, unchanged |
| Physical instance count | exactly one before and after, on the expected host |
| Reschedule request to fresh guest witness |21.196 seconds, includes scheduling/polling; NOT physical-failure RTO or pure downtime |
| Original workloads and HA policy |26 original VM records and original ONE_DRS policy unchanged |

Guest evidence came from the actual native PTY of the exact VM/domain UUID, with no mocked heartbeat or synthetic success. Native history PLAN_ID=-1 reflects this reschedule path; this is not acceptance of a global cluster-optimization plan, deployed AI approval/execution, or complete host-loss recovery.

VM46 reached DONE after testing. Its temporary template, datastore, ACLs and all3 bind mounts were removed. Small uniquely named NFS boot/diagnostic directories are retained; no shared NFS parent tree was deleted.

## Failed fixture controls retained

The first two cohort attempts are preserved as failures, not overwritten:
1. VM42: SELinux `virtlogd_t` denied writing the synthetic serial log on NFS (`nfs_t`). A private umask also masked requested directory permissions. Its cleanup encountered an already-removed ACL because native resource deletion had removed the rule. All3 original packages/services/keys and26 originalVM records were restored.
2. VM43: pre-created local logs had the correct native label, but the existing root-only `/var/log/libvirt` parents prevented oneadmin traversal. No DAC or SELinux policy was weakened. Idempotent exact-ACL cleanup was corrected; full cohort rollback and original inventory preservation passed.
3. PTY precheck VM44 on original r8 booted, but the observer mistakenly passed a UUID to `virsh domuuid`, which accepts a name or numeric ID. The corrected observer looks up `one-<owned VM ID>`, requires equality to the independently read native UUID, then reads only its assigned `/dev/pts/<number>`.
4. The corrected PTY fixture passed separately on original r8 with VM45 and was cleaned before the third R10 run. The inherited stdout label mentions R10, but this precheck is explicitly **original-r8 fixture validation**, not R10 acceptance.

The successful R10 guest test uses standard PTY serial/console devices, exact domain binding and unchanged host controls. No host-wide logging permissions, SELinux booleans, QEMU identity, security driver or HA admission policy was relaxed.

## Third-run rollback timeout — preserved failure

After the successful native reschedule and guest cleanup, all3 original r8 packages/drivers were restored and their cores restarted. The90-second strict Raft synchronization gate timed out while DR2 was one committed/log entry behind. The original `cohort-result.json` remains `FAIL_REQUIRES_RECONCILIATION`; the successful guest result does not override it.

Subsequent independent reads show DR2 caught up without a restart or database restoration. Nevertheless, the failed orchestrator did not execute the remaining zone/host enable, ancillary-service restoration or temporary-key removal. These steps are in the pending exact review. Do not count a later observed synchronized state as successful completion of the original automatic rollback deadline.

Current original core SHA256: `d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1` on all3. The third-run temporary LAB public key remains enrolled pending that cleanup; it is not production trust.

## Artifact and source identity

R10 signed RPM SHA256: `30d4cd97930281d699ad3aa45e434f1b87d43ddd23cb249a6c656b7b4088f7ed`.
Signed original-r8 rollback RPM SHA256: `f84b8c8936343cb37d8ea39728113182645a8fdb92a73fb7d275d47d3ea51b18`.
Original scheduler implementation: `3165fdb1603787a2ac4d9655a17999e0c189db47`.
Security-driver composition: `07c9128a55fea8c74aada3cf3d6e301ba59a840c`.
Starting evidence head: `8e976810e8423667fc9691238f7bc30a6dc7a08a`.

PR55's separate strict native-state/identity guard remains source-tested and unpackaged; it was not part of R10. Original DR1 NVRAM/vTPM preboot checks were retained in R10 and restored exactly on rollback. Secure-state helper enrollment remains absent on DR2/DR3; this ordinary disposable VM does not qualify secure-VM recovery.

## Remaining gates

Highest priority: execute and independently verify the exact pending restoration. Then harden/retest bounded rollback completion and source integration. DR4 qualification, true nonshared-storage recovery eligibility, independent physical fencing/power/network-partition acceptance, multi-host secure-state recovery, global optimizer/AI/application acceptance, independent release review, production trust and full soak remain open. This run does not establish production readiness.

## Evidence contents

Top-level files contain the original approved DR3 canary and custody record. `cohort-attempt1/` and `cohort-attempt2/` preserve failed fixtures and successful restoration. `pty-precheck1/` preserves the observer error; `pty-precheck2/` contains actual original-r8 fixture success. `cohort-attempt3/` contains actual guest PASS, independent3-host running witness, original rollback deadline FAIL, native VM log, driver selection and current paused-state readback. `SHA256SUMS` indexes every published evidence file.

Native database dumps, configuration/credential archives, private keys, RPM binaries and user authentication bytes are intentionally not published. Native backups and staged artifacts remain root-private on the lab hosts.
