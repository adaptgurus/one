# Integrated OneDRS VM admission + rollback source guard — 14 Nov 2026

Source-only combination of adaptgurus/one PR55 VM identity/stable-state admission and PR56 bounded rollback restoration, based on PR56 and PR54. No production installation or original R8 service mutation. Historical R10 native cold reschedule was LAB PASS; historical 90-second R10 rollback gate FAILED; the separate later management restoration PASS must not be conflated with acceptance.

## New executed checks
- Production-bundled Python dependencies with Python 3.12.14: all 54 scheduler Python tests PASS. Prior Python3.9 run could not import newer bundled xsdata and is recorded, not silently ignored.
- 58 rollback guard/coordinator/XMLRPC tests PASS under normal Python3.9; identical 58 repeat PASS under Python -O.
- 27000 finite Raft topology combinations checked with model sweep (not physical partitions). Exact model JSON retained.
- Real DR1->DR2->DR3 read-only native Raft status: strict guard PASS, leader DR1 term 3531, zero native mutation calls. All 26 original VM records preserved in stable fields; host inventory unchanged. Observed only elapsed-time text differences in VM listing.
- On DR1 DR2 DR3 the original r8-running oned SHA256 was d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1, SELinux Enforcing.
- No VM/host/SQL/PKI/NFS mutations, package installations, restarts, failover, rollback replay or tenant workload effects performed.

## Remaining gates
Independent PR54/55/56 source review/integration; R10 exact signed rebuild and carefully approved fresh live 3-host candidate & delayed-quorum rollback replay; physical host fencing, controlled partition and RTO/RPO; DR4 enrollment/qualification; VM11 nonshared-storage placement, real vTPM/NVRAM/Secure Boot restoration; 900s stress, 12h candidate soak and independent production approval. SOURCE_TESTED + R8_LIVE_READONLY_PASS; release NO-GO.

## Reproduction
cd src/schedm_mad/remotes/one_drs && PYTHONPATH=/usr/lib/one/python python3.12 -m unittest discover -s tests -p test_*.py -q
cd tools/onedrs_qualification && python3 -m unittest -q test_rollback_guard test_cohort_candidate test_xmlrpc_boundary && python3 -O -m unittest -q test_rollback_guard test_cohort_candidate test_xmlrpc_boundary && python3 topology_sweep.py

Canonical live JSON files: live-qualification-summary.json and strict-native-raft.json. Full raw baseline inventory stored privately on DR1 local-only /root/onedrs-strict-native-probe-20261114-chatgpt.
