"""Independent bounded brute-force oracle for native OneDRS recovery admission.

No native API calls, no random seed dependence, and no QEMU/storage effects.
"""
import itertools
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "src/schedm_mad/remotes/one_drs"
sys.path.insert(0, str(ROOT))

from lib.mapper.model import Capacity, HostCapacity, VMGroup, VMRequirements, VMState
from lib.resilience import ResiliencePolicy, validate_resilience

SEED = 20261114
rng = random.Random(SEED)


def feasible(survivors, vms, groups, mem_reserve, cpu_reserve, spread):
    if not survivors:
        return False
    by_id = {h.id: h for h in survivors}
    if (sum(vm.memory for vm in vms)
            > sum(h.memory.total * (1 - mem_reserve / 100) for h in survivors)):
        return False
    if (sum(vm.cpu_ratio for vm in vms)
            > sum(h.cpu.total * (1 - cpu_reserve / 100) for h in survivors)):
        return False
    options = [
        [
            h.id for h in survivors
            if (vm.host_ids is None or h.id in vm.host_ids)
            and h.memory.total * (1-mem_reserve/100) >= vm.memory
            and h.cpu.total * (1-cpu_reserve/100) >= vm.cpu_ratio
        ]
        for vm in vms
    ]
    if not all(options):
        return False
    for placement in itertools.product(*options):
        assignments = dict(zip((vm.id for vm in vms), placement))
        if any(
            sum(vm.memory for vm in vms if assignments[vm.id] == h.id)
            > h.memory.total * (1-mem_reserve/100) + 1e-7
            or sum(vm.cpu_ratio for vm in vms if assignments[vm.id] == h.id)
            > h.cpu.total * (1-cpu_reserve/100) + 1e-7
            for h in survivors
        ):
            continue
        groups_ok = True
        for group in groups:
            members = [assignments[i] for i in group.vm_ids if i in assignments]
            if group.affined and len(set(members)) > 1:
                groups_ok = False
                break
            if not group.affined and len(set(members)) < len(members):
                groups_ok = False
                break
            if not group.affined and spread:
                domains = [
                    by_id[h].failure_domain or f"host:{h}"
                    for h in members
                ]
                if len(set(domains)) < len(domains):
                    groups_ok = False
                    break
        if groups_ok:
            return True
    return False


def oracle(hosts, vms, groups, policy):
    if policy.host_failure_tolerance >= len(hosts):
        return False
    domains = {d.failure_domain for d in hosts}
    if policy.failure_domain_tolerance >= len(domains) and policy.failure_domain_tolerance:
        return False
    scenarios = [
        {h.id for h in failed}
        for failed in itertools.combinations(hosts, policy.host_failure_tolerance)
    ]
    if policy.failure_domain_tolerance:
        domain_losses = [
            {h.id for h in hosts if h.failure_domain in set(domains_failed)}
            for domains_failed in itertools.combinations(
                sorted(domains), policy.failure_domain_tolerance
            )
        ]
        scenarios.extend(domain_losses)
        if policy.combined_failure_modes and policy.host_failure_tolerance:
            for dset in domain_losses:
                remaining = [h for h in hosts if h.id not in dset]
                for failed in itertools.combinations(
                    remaining, policy.host_failure_tolerance
                ):
                    scenarios.append(dset | {h.id for h in failed})
    return all(
        feasible(
            [h for h in hosts if h.id not in failed],
            vms, groups,
            policy.memory_reserve_percent,
            policy.cpu_reserve_percent,
            policy.failure_domain_spread,
        )
        for failed in scenarios
    )


def main():
    cases = []
    mismatches = []
    started = time.monotonic()
    for case_id in range(400):
        n_host = rng.randrange(2, 6)
        n_vm = rng.randrange(1, 6)
        hosts = []
        domains = ["rack-a", "rack-b", "rack-c", "rack-d"]
        for i in range(n_host):
            hosts.append(HostCapacity(
                id=i, memory=Capacity(total=rng.randrange(3, 16), usage=0),
                cpu=Capacity(total=rng.randrange(3, 16), usage=0),
                failure_domain=domains[rng.randrange(min(n_host, len(domains)))],
            ))
        vms = []
        for i in range(n_vm):
            host_ids = None
            if rng.random() < 0.3:
                host_ids = set(rng.sample(range(n_host), rng.randrange(1, n_host+1)))
            vms.append(VMRequirements(
                id=i, state=VMState.RUNNING,
                memory=rng.randrange(1, 10),
                cpu_ratio=rng.randrange(1, 10),
                host_ids=host_ids,
            ))
        groups = []
        if n_vm >= 2 and rng.random() < .35:
            members = set(rng.sample(range(n_vm), rng.randrange(2, n_vm+1)))
            groups.append(VMGroup(
                id=1, affined=rng.random()<.25, vm_ids=members
            ))
        if n_vm >= 3 and rng.random() < .2:
            members = set(rng.sample(range(n_vm), rng.randrange(2, n_vm+1)))
            groups.append(VMGroup(
                id=2, affined=rng.random()<.2, vm_ids=members
            ))
        host_fail = rng.choice([0, 1])
        domain_fail = rng.choice([0, 1]) if len({h.failure_domain for h in hosts})>=2 else 0
        policy = ResiliencePolicy(
            enabled=True, host_failure_tolerance=host_fail,
            failure_domain_tolerance=domain_fail,
            combined_failure_modes=bool(host_fail and domain_fail and rng.randrange(2)),
            failure_domain_spread=bool(rng.randrange(2)),
            memory_reserve_percent=rng.choice([0, 10, 20]),
            cpu_reserve_percent=rng.choice([0, 10, 20]),
            max_failure_scenarios=1024,
        )
        expected = oracle(hosts, vms, groups, policy)
        try:
            actual = validate_resilience(hosts, vms, policy, groups)
            accepted = bool(actual)
            error = None
        except ValueError as e:
            accepted = False
            error = str(e)[:180]
        sample = {
            "case": case_id,
            "expected": expected,
            "accepted": accepted,
            "hosts": [(h.id, h.memory.total, h.cpu.total, h.failure_domain) for h in hosts],
            "vms": [(v.id, v.memory, v.cpu_ratio, sorted(v.host_ids) if v.host_ids else None) for v in vms],
            "groups": [(g.id, g.affined, sorted(g.vm_ids)) for g in groups],
            "policy": str(policy),
            "error": error,
        }
        if accepted != expected:
            mismatches.append(sample)
            if len(mismatches)>=5: break
        cases.append(sample)
    outcome = {
        "seed": SEED, "checked": len(cases),
        "expected_admitted": sum(x["expected"] for x in cases),
        "expected_rejected": sum(not x["expected"] for x in cases),
        "false_acceptances": sum(x["accepted"] and not x["expected"] for x in mismatches),
        "false_rejections": sum(x["expected"] and not x["accepted"] for x in mismatches),
        "examples": mismatches, "elapsed_seconds": round(time.monotonic()-started, 4),
        "conclusion": "PASS" if not mismatches and len(cases)==400 else "FAIL",
        "scope": "SIMULATED_HOST_DOMAIN_AND_VM_PLACEMENT_NOT_REAL_PHYSICAL_FAILURE",
    }
    path=Path(__file__).with_name("independent-small-matrix-result.json")
    path.write_text(json.dumps(outcome,indent=2,sort_keys=True)+"\n")
    print(json.dumps({k:v for k,v in outcome.items() if k!="examples"},sort_keys=True))
    if outcome["conclusion"]!="PASS":raise SystemExit(2)


if __name__=="__main__":main()
