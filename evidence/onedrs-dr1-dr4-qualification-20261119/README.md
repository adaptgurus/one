# OneDRS DR1–DR4 live read-only/source qualification — 19 November 2026

**Decision: NO-GO for final candidate; source regression and shared-NFS connectivity checks PASS.**

This is new evidence generated against the actual DR lab. It does not claim deployment of the proposed scheduler into any OpenNebula daemon, a successful optimizer execution over tenant VMs, physical failure recovery, or production acceptance.

## Exact source under test

- `adaptgurus/one` PR #60 branch `fix/onedrs-kib-mib-reconciliation-20261115`, exact pre-evidence code HEAD `006ec0d47313327742efef0cc19afe9016a7f78f`.
- DR3 isolated sparse checkout: `/root/onedrs-pr60-retest-20261119`, source-only; running OpenNebula and existing VMs untouched.
- Python 3.12 native OneDRS scheduler test discovery: **75/75 PASS**.
- Python 3.12 -O: **75/75 PASS**.
- Python 3.9 rollback/strict Raft/finite cascade test discovery: **63/63 PASS**.
- Python 3.9 -O: **63/63 PASS**.
- Python 3.12 `compileall`: PASS; `git diff --check`: PASS. Logs in the DR3 isolated checkout: `test-py312.log`, `test-py312-O.log`, `test-py39-rollback.log`, `test-py39-rollback-O.log`.
- Test checkout includes sparse paths `src/schedm_mad/remotes/one_drs`, `src/cluster`, `src/schedm`, `share/etc`, `tools/onedrs_qualification`, `evidence/onedrs-r10-live-reschedule-20261114/cohort-attempt3`. Unqualified sparse checkouts of fewer paths can falsely report missing-file test errors.

## Native DR cluster state at live read

- DR1, DR2, DR3: `opennebula-7.4.1-8.ls.onedrs.e39bf32.el9.x86_64`, OpenNebula active. The PR #60 scheduler is **not installed**.
- DR1 leader, DR2/DR3 followers, Raft term **3531**, index/commit **164622** across all three in the sampled snapshot.
- Native VM pool: **26 records**, 14 running, 12 powered off. No unrecognized VM host assignments.
- Native HostShare commitments were checked against `onevm list -x` template demands, rather than synthetic fixture totals:

| Host | VM records | Running/off | HostShare memory KiB converted to MiB | VM TEMPLATE memory MiB | HostShare CPU /100 | VM TEMPLATE CPU | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| DR1/0 | 13 | 4/9 | 29696 | 29696 | 15.0 | 15.0 | PASS |
| DR2/1 | 6 | 5/1 | 22528 | 22528 | 11.0 | 11.0 | PASS |
| DR3/2 | 7 | 5/2 | 20608 | 20608 | 10.1 | 10.1 | PASS |

DR1 receipt: `/root/onedrs-pr60-live-inventory-20261119.json`. This is original native read-back, not a VM migration test.

## DR4 shared-NFS cross-host non-destructive qualification

- DR4 `172.17.60.88` **not enrolled** into original OpenNebula cluster; `br-mgmt` absent and `/etc/one` absent. Eight OVN-related libvirt test guests were running at preflight and after test.
- Existing datastores **104 and 105 remain mounted read-only**, intentionally. Prior DR4 read-only mount preflight had passed.
- A disposable, uniquely named directory was created **outside any existing datastore** under the shared NFS `files` parent using `oneadmin` UID 9869; no existing VM, datastore or NFS export was altered.
- DR4 wrote **1 MiB**; DR1, DR2 and DR3 independently read and hashed the same contents: SHA-256 `938ae74d606b20c28b9a745e414428a432f9f978ed4053dc29dbec676e6d7f4b`.
- DR1 wrote **256 KiB**; DR2, DR3 and DR4 independently read and hashed the same contents: SHA-256 `00db1d9e779897b02c4735068f95ac23a0f08ec5cc0bfac006f01a4678084bc4`.
- Both exact owned files and their directory were deleted after verification. DR4 still had **8 running VMs**; DS 104/105 still read-only.
- DR4 receipt: `/root/onedrs-dr1-dr4-nfs-crosshost-20261119.json`.

**Storage scope:** PASS cross-host NFS read/write for a disposable shared-parent path. This does **not** qualify OpenNebula datastore 104/105 write admission, secure-state recovery, nonshared VM relocation, or DR4 network compatibility.

## Remaining release blockers (not overridden by generic lab permission)

1. Integrate PR #54 and the strict admission/rollback/cascade/units chain through PR #60 into one reviewed, CI-tested, version-compatible candidate. Verify exact built/running hashes, signing trust and reversible lab canary/rollback.
2. Qualify the DR4 management/guest network without interrupting eight live OVN test guests; qualify safe datastore write/placement semantics; only then enroll and mark it scheduler-eligible.
3. Establish independent fencing, single and compounded host/rack/partition failure recovery, secure vTPM/NVRAM/nonshared storage outcomes, and an appropriate quorum design. A three-controller Raft deployment does not tolerate two controller losses.
4. Run **disposable owned-VM** native placement, blocked-move, rescheduling, migration, recovery, data-integrity, original-VM preservation and rollback E2E against the **installed candidate**, plus authenticated V7/BFF actions.
5. Run a fresh **12-hour installed-candidate soak** after passing the above. The existing R8 runtime and source-only suites do not satisfy this gate.

**Safety boundary:** no production workload migration, guest deletion, control-plane restart, host admission, policy weakening, or original datastore write was performed in this qualification.
