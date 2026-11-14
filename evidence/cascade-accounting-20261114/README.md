# OneDRS cascading-failure unknown-commitment accounting guard
Date: 14 November 2026

## New proved source defect
The original joint recovery placement code (parent source PR58) models the selected VM requirements only. It uses the native per-host total capacity but can disregard host usage assigned to unselected active VM requirements. Aggregate demand can still be within total survivor memory, even where residual unknown workloads prevent any valid recovery placement. NaN values in host committed usage also bypass aggregate comparisons.

Four new test cases reproduce RED on parent PR58: (1) selected12 GiB / observed17 GiB cannot ignore residual 5; (2) unknown committed CPU; (3) no selected requirements but active host commitments; (4) nonfinite host committed memory. Retain raw RED log.

## Fix and limits
When resilience is explicitly enabled, require all *observable* host committed CPU and memory demand to be reconciled with nonpending selected native VM requirements, reject nonfinite or negative usage, and fail closed on unexplained residual. Pending VMs remain additive rather than counted twice. Resilience policy disabled retains earlier behavior. This is a conservative safety gate: a mismatch is not an excuse to silently advertise N+K. Native request scope and KB/MB/native CPU accounting may require redesign before this can be enabled for a production profile. Aggregate reconciliation alone cannot prove exact VM-by-host ownership, storage, device or topology safety. Do not deploy until that source contract is reviewed.

One existing test originally checked the failure message for too much summed memory. Updated to assert the stronger specific earlier failure on 210 units of committed memory with zero modeled VMs; this does not relax the admission check.

## Test receipts
- 73 native scheduler tests PASS on Python3.12 with vendor runtime PYTHONPATH, including seven new accounting cases
- 63 native rollback + simulated two-control-node cascading Raft cases PASS under Python3.9; same63 repeat PASS under python3 -O
- Existing seeded independent 400/400 brute-force model checks PASS; no false admissions/rejections under scope
- Original DR1-3 and NFS never changed; this is source-only

Production status: NO-GO; source branch stacked on PR58, PR57, PR56 and PR54. Exact release/independent CI and reviewer, original issuer, correct committed accounting/VM scope, candidate RPM installation, DR4/5-voter topology, fenced physical failure and nonshared/vTPM recovery remain unqualified.
