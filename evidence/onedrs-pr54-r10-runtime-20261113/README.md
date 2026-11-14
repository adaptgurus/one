# OneDRS R10 — approved continuation and real isolated daemon acceptance

13 November 2026, approximately09:58–10:14 IST.

## Current decision

**The previously reviewed staging correction executed successfully, exactly once.
Real standalone native daemon/API upgrade and rollback now PASS on both SQLite
and a private MySQL backend. The native security-state driver composition conflict
is corrected in the R10 source/package. Live DR3 canary has NOT executed and awaits
its separate exact Desktop Commander review. Whole module remains NO-GO.**

The old "staging correction pending" status is superseded. The new execution
review is for an actual DR3 follower package install/restart/rollback, not another
copy-directory repair. DR4 enrollment remains a distinct prior pending operation.

## Approved call and runtime evidence

The user executed the existing staging-correction review. Its result was retrieved
using remote call870cc8f5-11cc-4384-8170-bfe5611ea00f and process1080394; the process
finished with exit0. It was not submitted again. Independent readback verified the
corrected directory, private test credential mode0600, exact original and candidate
binary hashes, and no preexisting test database.

### Actual SQLite daemon/API sequence

Using private mount, network and PID namespaces, only loopback/no routes, private
ONE_LOCATION and shadowed native data/config/log directories:

1. Started the ORIGINAL native oned binary normally (`-f`, NOT `-i`). Authenticated
   native API became ready; native host pool was empty.
2. Allocated one owned native cluster through the API and wrote a custody marker.
3. Stopped the original daemon cleanly, started the corrected full binary on the
   SAME private database, read the original marker and wrote a second marker.
4. Stopped the candidate cleanly, restarted the original binary, read the candidate
   write, then deleted the owned cluster through the original native API.

All three process exits were0; each running executable was checked against its
exact binary path/hash. Result: **PASS real standalone runtime upgrade/rollback**.
No external host, original database, actual VM or original daemon was used.

### Actual MySQL daemon/API sequence

Repeated the same NORMAL original→candidate→original daemon/API sequence using a
new isolated MariaDB10.5.29 instance and one empty private schema. The candidate
read and wrote real native objects, and the original binary read the candidate's
persisted write and cleaned the test cluster. All three shutdowns exited0.
Private MySQL stopped and the original private configuration was restored.

This is stronger than the previous40-table/bootstrap-only comparison. It remains
standalone runtime proof, NOT native HA replication, live package installation,
rescheduling, live VM migration, physical failure recovery or application RTO.

Two fixture defects were preserved as failed attempts, then corrected:
- First attempt reused generated SQLite service-identity files with a new empty
  MySQL database; ORIGINAL oned correctly refused the inconsistent bootstrap.
- Second fresh-prefix attempt supplied only16 MySQL connections, insufficient for
  oned's4 plus monitord's15. The ORIGINAL daemon could not start monitord. The
  corrected fixture has64 connection slots; native manager settings were not
  weakened. The full three-start sequence then passed.

These are test-environment corrections, not changes to a live database or native
product startup logic. Failed receipts remain next to the passing result.

## Security-state release composition corrected

New native source commit:
`07c9128a55fea8c74aada3cf3d6e301ba59a840c`.

`src/vmm_mad/remotes/kvm/deploy` now includes the EXACT current DR1 preboot and
verify-preboot checks. Driver SHA-256:
`3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b`.

The independently read DR1 script matched this digest before incorporation. No
live driver, helper or sudo policy was changed. This corrects the R9 package's
risk of replacing DR1's existing NVRAM/vTPM protections with the older upstream
script. It does not newly qualify the underlying security-state helper.

Executed the actual composed shell driver under private mounts with mocked
helper/sudo/virsh:7 cases PASS. Untagged and empty-tag native operation was retained;
tagged success required preboot→verify-preboot→domain creation in that order.
Preboot refusal, verification refusal, missing helper and sudo refusal all blocked
domain creation. These tests validate invocation ordering/refusal only, not actual
NVRAM/vTPM restoration or real guest boot.

Readback found the helper on DR1, not DR2/DR3. A tagged secure-state VM would
therefore fail closed on an unenrolled target. Multi-host helper enrollment and
secure-VM recovery acceptance remain open; no absent helper is treated as success.

Fresh scheduler regressions after composition:41 Python/CBC tests,10 explicit C++
cases and4,032 exhaustive cached-pool/destination combinations PASS. Scheduler
implementation remains3165fdb1603787a2ac4d9655a17999e0c189db47. The exact corrected
native core binary is unchanged by the shell-driver composition.

## R10 package and rollback artifacts

Candidate:
`opennebula-7.4.1-10.ls.onedrs.pr54.07c9128.el9.x86_64.rpm`

LAB-signed candidate SHA-256:
`30d4cd97930281d699ad3aa45e434f1b87d43ddd23cb249a6c656b7b4088f7ed`

LAB-signed original r8 rollback RPM SHA-256:
`f84b8c8936343cb37d8ea39728113182645a8fdb92a73fb7d275d47d3ea51b18`

Embedded candidate core SHA-256:
`782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb`

R10 is assembled from the retained original r8 package payload plus the tested
core and exact integrated driver. It is not a clean upstream source rebuild.
Audit of1482 paths verifies only the core and native deploy-driver contents plus
correct ELF build-ID artifacts changed. Original configuration flags, permissions,
ownership, lifecycle scripts and dependency expressions remain retained, with
the previously disclosed explicit config() provenance-marker difference.

Private signature/tamper-negative and original-install→candidate-upgrade→original-
downgrade package tests PASS. A synthetic DR1-like modified deploy driver survived
R10 installation. Rollback to old r8 necessarily restores its older packaged driver;
the test therefore explicitly restores the exact custodied pre-upgrade driver
BEFORE any service activation. That additional restore is required, not a claim
that the old RPM itself preserves new nonconfiguration hooks.

The package fixture uses dependency bypass ONLY inside its private root and a
recording-only systemctl. It is not a real native HA rollback. Both candidate and
rollback RPMs have a new ephemeral LAB-only signature; the private signing secret
was removed and its agent stopped. No system signing trust was enrolled.

## Native canary preparation and execution boundary

Read-only native checks showed DR1 leader, DR2/DR3 followers, matching term/commit
and no transient VM operations. DR3 identity was pinned to its actual hostname,
server role and hardware UUID. Candidate, signed rollback and public lab key were
staged in its root-private canary directory. Native `onedb backup` produced a
283,109,302-byte database backup with mode0600. This real lab backup remains local
and is NOT published as evidence. R10's RPM dependency/conflict dry-run passed.

The bounded DR3 operation checks quorum/role/pinned artifacts, snapshots native VM
records and protected configuration, uses signature-enforced local DNF installation,
starts previously active services, verifies the new running binary and synchronized
follower state, then rolls back to signed r8 and restores exact original driver
before restarting. It does not intentionally change leadership, disable a physical
host, migrate a VM or perform a schema migration.

The client stopped this exact call twice unchanged. It was submitted to the review
panel and is **awaiting user**. No canary result/script or lab trust import exists
on DR3 in the subsequent readback; no alternate-host/tool/split route was used.
The native package installation and restart did not happen. The raw backup and
staged package are preparation only, not canary success.

Official OpenNebula7.4 upgrade documentation describes a coordinated HA upgrade
and configuration/database handling. The proposed same-version lab follower patch
experiment is bounded qualification, not a claim to replace that supported release
procedure or to establish zero-downtime customer upgrade support.

## Cleanup and remaining module gates

All private test native daemons and MySQL processes stopped. The three isolated
MySQL data fixtures, new MySQL prefixes, generated standalone credentials and
private SQLite database were removed after evidence capture. No production database
was deleted or restored. Backups and signed canary artifacts remain root-private.

Final live hashes and PIDs remain original r8 on DR1–DR3. Their active services,
current native drivers and release trust are unchanged. Existing dedicated service
identity remains; no duplicate account or broader permissions were added.

Open gates: execute the new DR3 canary/rollback review and qualify any later cohort
rollout; run actual corrected scheduler rescheduling on installed code; complete
DR4's distinct review/enrollment; resolve original storage/placement eligibility;
qualify multi-host secure-state helpers, independent fencing and true power/network
partition recovery, actual deployed AI execution and guest/application availability.
Production signing/soak and independent review remain separate later gates.

## Evidence

`sqlite-runtime-result.json` and `mysql-runtime-result.json`: real normal daemon/API
upgrade/rollback. Failed MySQL controls are retained. `preboot-driver-tests.json`:
7 invocation/refusal cases. `rpm-validation.json`, `rpm-transaction-result.json`:
exact R10 package and rollback mechanics. `live-post-preflight-readback.json`:
unchanged running DR cores and unexecuted canary. `summary.json` and `cleanup.json`:
explicit scope and lifecycle. `SHA256SUMS`: immutable index.

Primary operational documentation consulted:
https://docs.opennebula.io/7.4/software/upgrade_process/upgrade_guide/upgrading_ha/
https://docs.opennebula.io/7.4/product/control_plane_configuration/high_availability/frontend_ha/
