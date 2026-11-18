# OneDRS native memory-unit defect: reproduction and correction
Date: 15 November 2026. Source-only worktree stacked on PR59 `8f7c1eb3e16d923e0d22ef5a2c637e8784e194bc`.

## Live read-only RCA
Native OpenNebula `HOST_SHARE/MEM_USAGE` and `MAX_MEM` values are KiB; `VM/TEMPLATE/MEMORY` and OneDRS VMRequirements.memory are MiB. The parent scheduler used divisor 1000 for three native host memory inputs instead of 1024, inflating both commitments and survivor capacities.

| DR host | Native MEM_USAGE KiB | Correct MiB (/1024) | VM templates running + powered-off (MiB) |
|---|---:|---:|---:|
| DR1 / 0 | 30,408,704 | 29,696 | 12,288 + 17,408 |
| DR2 / 1 | 23,068,672 | 22,528 | 18,432 + 4,096 |
| DR3 / 2 | 21,102,592 | 20,608 | 16,384 + 4,224 |

Host CPU commitments independently reconcile to all assigned VM CPU: 15.0, 11.0, 10.1. Across 26 original VM records, 14 RUNNING and 12 POWEROFF were represented. The incorrect /1000 path produces memory commitments 30,408.704, 23,068.672, 21,102.592 MiB and 1,048.576 MiB capacity from a native 1-GiB host.

## Scoped fix and validation
In `src/schedm_mad/remotes/one_drs/lib/optimizer_parser.py`, all three native host memory quantities (total, usage, committed) are now converted from KiB to MiB with divisor 1024. CPU (/100) remains unchanged. Two exact parser regression tests protect committed inventory reconciliation and a 1 GiB capacity boundary.

RED (before fix): 2/2 new tests FAIL, reproducing 1048.576 vs 1024 and 30408.704 vs 29696.
GREEN: 2/2 focused; 75/75 full scheduler suite Python3.12; 75/75 Python3.12 -O; 63/63 rollback+simulated cascade Python3.9; 63/63 Python3.9 -O.
Raw logs are stored alongside this README. No original DR1-DR4 runtime changes.

## Release boundary
SOURCE_TESTED ONLY, **production NO-GO**. Still required: independent review/CI; native scheduler request/inventory provenance; unknown workload and VM-state handling; integrated signed R10+ candidate; safely qualified DR4 networking/writeable storage; original independent compute/storage fencing; real partition, secure-state and nonshared storage recovery; rollback/canary, V7 authenticated E2E and 12-hour candidate soak. The protected DR1-DR3 R8 binaries remain untouched.
