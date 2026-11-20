# OneDRS R13 — independently repeated source and private native API test

Date: 19 November 2026 (Asia/Kolkata). **Source and isolated native API PASS; original DR1–DR3 remain on R8. Production NO-GO.**

## Exact composition

Original OpenNebula 7.4.1 native R8 executable SHA256 `d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1` → R13 native executable SHA256 `006c90bc98ab63336b0df24b58da44e95cced3b7cf0be6eb5282de8150a3272e` → original R8 executable.

R13 source commit `06dc1aaac0bce10d2cf06c56d9dd1f71e29d2054` contains the PR60 memory unit correction, pending/cascading HA and affinity policy validation, explicit UNKNOWN recovery controls, retained shared storage semantics, and native monitor/driver shutdown fixes. Source was **not** deployed onto original DR1–DR4 hosts.

Unsigned engineering RPM `opennebula-7.4.1-13.ls.onedrs.06dc1aaa.lab.el9.x86_64.rpm`, SHA256 `e4b80a7146a53e8c11101dd6341118070c36f782dd3579eba78f4e655a8abcce`. Repeated `rpm -K --nosignature` digest verification PASS. This is **not** a trusted installable production RPM.

## Fresh tests on DC2

- Native OneDRS scheduler Python 3.12: **93/93 PASS**
- Native OneDRS scheduler Python 3.12 optimized: **93/93 PASS**
- Strict rollback/finite cascading Raft model Python 3.9: **63/63 PASS**
- Strict rollback model Python 3.9 optimized: **63/63 PASS**
- `git diff --check` PASS, and signed/production trust *not* claimed
- Repeated original → candidate → original daemon lifecycle in **private mount, PID and network namespaces** with isolated SQLite database and loopback-only API: **PASS**; all three authenticated starts, writes and reads, clean shutdown exit 0, original R8 reads candidate-written native record, original cleans disposable record. No original cluster hosts were registered in this test.

Raw lab-only logs: `/root/ls-onedrs-r13-retest-20261119/` and `/root/ls-onedrs-r13-private-e2e-20261119/` on DC2. Portable redacted receipt `result.json` is included with exact source and package hashes.

The additional workflow `.github/workflows/onedrs-safety.yml` is a **source CI gate only**. A hosted CI PASS does not qualify binary ABI, signing or real HA recovery.

## Important pending lab gates

1. Independent source/package review, vetted signing and exact installed/running hash check with retained R8 rollback.
2. Protected DR4 migration/guest network and native datastore eligibility; do not alter its eight OVN canary guests.
3. OneDRS native VM owned-resource placement, optimizer/cooldown, negative placement, migration, error-hook recovery, stable boot/data/secure-state, fencing, quorum and partition tests. A 3-voter Raft setup is insufficient for 2 controller failures.
4. Authenticated LayerSentry V7/BFF operational E2E and 12-hour soak of the **actual** integrated candidate after deployment.

**NO-GO** until these pass. No generic lab permission substitutes for independent infrastructure identity, fencing or tenant data safety.
