# OneDRS cascading failures — source-only verified delta, 14 November 2026

**Location:** adaptgurus/one, branch fix/onedrs-cascade-admission-20261114-chatgpt, stacked on PR57 source head e0743025b42fba6e1c2f78a54fdd198a60058c96.

## Corrected native scheduler defect (RED → GREEN)

Previously the resilience admission checked aggregate survivor CPU/RAM, single-VM eligible hosts and per-group anti-affinity independently. That is not a constructive joint placement proof. Three fresh tests against the unchanged source reproduced unsafe false admission for (1) two 6-GiB VMs competing for the sole 10-GiB capable survivor; (2) three large VMs with only two capable survivors; and (3) failure of a rack followed by one more host with sufficient *summed* capacity but impossible bin packing. Initial RED: red-aggregate-only.log.

Fix: demand validation (reject NaN/negative), duplicate host/VM IDs refusal, per-host reserve-compliant eligibility and a bounded joint placement feasibility witness across *all* VMs simultaneously. First-fit constructive proof is permitted only with no group constraints; otherwise or if greedy fails, a single bounded integer feasibility model with CPU/memory, per-VM eligibility, affinity, anti-affinity, optional failure-domain spread. CBC unavailable/time-limited/incomplete/over-budget => fail closed. Solver witness independently checked for integer assignment, per-host cap and all group constraints. Protection disabled preserves legacy behavior.

Combined host + failure-domain cascades are evaluated only when COMBINED_FAILURE_MODES explicitly enabled. Automatic remediation, physical recovery, real nonshared storage and hypervisor fencing are NOT implemented by this proof.

## Executed tests and deterministic evidence

- Native scheduler: **66/66 PASS** Python3.12 using OpenNebula system bundled Python libraries, including 12 new cascade/boundary tests. Full log scheduler-final-green.log.
- Original rollback guard/coordinator/native fake XML-RPC tests plus 5 new cascading Raft tests: **63/63 PASS** normal Python3.9, same63 repeated under Python -O. Logs rollback-plus-cascade-normal.log and rollback-plus-cascade-optimized.log.
- Brute-force independent small-state property matrix: **400/400 PASS**, 90 admitted and310 rejected, 0 false admissions and 0 false denials under the specified in-memory capacity/group models; deterministic seed20261114. Script independent_small_state_matrix.py and receipt independent-small-matrix-result.json.
- Existing 27000 finite Raft model combinations at prior PR57 PASS; no physical failure or actual network partition from model checks.
- Test cases include source refusal for missing solver, unknown solver status, NaN CPU, duplicate host IDs, impossible affinity/anti-affinity, per-host reserves, dual follower failure, leader+follower loss, contested leadership, stale follower, delayed restoration retains missed acceptance.
- No VM, OpenNebula, KVM, Galera, certificate, NFS, network, storage or original DR service mutation.

## Release boundary

This proof is **NOT 100% production readiness**: source-only, exact RPM not built from this branch, original DR1–3 still use R8, PR54/56/57 need independent review, R10 effectful fresh cohort and delayed rollback must be re-qualified. OneDRS scheduler capacity proof is necessary but insufficient for actual storage/fencing placement, GPU/PCI availability, safe cluster recovery, original tenant V7 lifecycle and real data integrity. DR4 is not enrolled in the 3-node Raft zone. Three Raft voters only tolerate one controller loss; two-control-plane-node cascade requires at least five voting controllers (or an independently reviewed design). Hardware fencer, nonshared VM11, Secure Boot/vTPM/NVRAM protection, multi-host partition/failover/rejoin, measured RTO/RPO, >900s candidate stress and 12h soak remain physical/release gates.

**Do not install or use this unreviewed source branch on original DR1–3.** Protect original26 VM records, NFS-backed datastores, credentials and concurrent module owners.
