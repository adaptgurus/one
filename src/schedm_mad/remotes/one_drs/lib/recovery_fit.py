"""Bounded joint capacity proof for OneDRS cascading host/domain failures.

The normal scheduler remains responsible for selecting the optimal placement.
This module only refuses *resilience guarantees* when the complete set of
affected VMs cannot be simultaneously placed on the surviving hosts.
"""
from __future__ import annotations

from math import isfinite
from time import monotonic

from pulp import (
    LpMinimize,
    LpProblem,
    LpStatusOptimal,
    LpVariable,
    PULP_CBC_CMD,
    lpSum,
)

from .mapper.model import HostCapacity, VMGroup, VMRequirements

MAX_RECOVERY_EDGES = 4096
JOINT_FIT_BUDGET_SECONDS = 10.0
CBC_SOLVE_LIMIT_SECONDS = 2.0
EPSILON = 1e-7


def _validated_demand(value, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError(
            f"resilience admission failed: invalid {label}"
        ) from exc
    if not isfinite(number) or number < 0:
        raise ValueError(f"resilience admission failed: invalid {label}")
    return number


def validate_joint_recovery_fit(
    survivors: list[HostCapacity],
    requirements: list[VMRequirements],
    groups: list[VMGroup],
    candidates: dict[int, set[int]],
    *,
    memory_reserve_percent: float,
    cpu_reserve_percent: float,
    failure_domain_spread: bool,
    label: str,
    deadline: float | None = None,
) -> None:
    """Prove full modeled workload fits after a loss, or fail closed.

    No effectful native operation is made. A bounded CBC feasibility problem
    considers all modeled VM placements at once (not only aggregate capacity),
    anti-affinity, domain spreading, and affinity. Missing solver, timeout, or
    over-limit problems reject the admission. This cannot prove readiness of
    physical fencing, storage or network paths; those require native acceptance.
    """
    if not requirements:
        return
    if deadline is None:
        deadline = monotonic() + JOINT_FIT_BUDGET_SECONDS
    if monotonic() >= deadline:
        raise ValueError(
            "resilience admission failed: joint placement proof time budget exhausted"
        )

    by_host = {host.id: host for host in survivors}
    by_vm = {vm.id: vm for vm in requirements}
    if len(by_host) != len(survivors) or len(by_vm) != len(requirements):
        raise ValueError("resilience admission failed: duplicate host or VM identity")
    mem_cap = {
        host.id: _validated_demand(
            host.memory.total, f"host {host.id} memory capacity"
        ) * (1.0 - memory_reserve_percent / 100.0)
        for host in survivors
    }
    cpu_cap = {
        host.id: _validated_demand(
            host.cpu.total, f"host {host.id} CPU capacity"
        ) * (1.0 - cpu_reserve_percent / 100.0)
        for host in survivors
    }
    demands = {
        vm.id: (
            _validated_demand(vm.memory, f"VM {vm.id} memory"),
            _validated_demand(vm.cpu_ratio, f"VM {vm.id} CPU"),
        )
        for vm in requirements
    }
    eligible = {
        vm.id: tuple(
            sorted(
                host_id
                for host_id in candidates[vm.id]
                if mem_cap[host_id] + EPSILON >= demands[vm.id][0]
                and cpu_cap[host_id] + EPSILON >= demands[vm.id][1]
            )
        )
        for vm in requirements
    }
    for vm_id, options in eligible.items():
        if not options:
            raise ValueError(
                f"resilience admission failed: VM {vm_id} has no "
                f"reserve-compliant survivor after {label}"
            )

    edges = sum(map(len, eligible.values()))
    if edges > MAX_RECOVERY_EDGES:
        raise ValueError(
            "resilience admission failed: joint placement proof "
            f"requires {edges} edges above safety limit {MAX_RECOVERY_EDGES}"
        )

    # Cheap constructive proof: if a full assignment fits, no solver is needed.
    # Groups require a simultaneous model because independent greedy groups
    # can make incompatible decisions on the same recovery capacity.
    involved = any(
        len(set(group.vm_ids) & by_vm.keys()) > 1 for group in groups
    )
    if not involved:
        remaining_mem = mem_cap.copy()
        remaining_cpu = cpu_cap.copy()
        sorted_vms = sorted(
            requirements,
            key=lambda vm: (
                len(eligible[vm.id]),
                -max(
                    demands[vm.id][0] / max(
                        max(mem_cap.values()), EPSILON
                    ),
                    demands[vm.id][1] / max(
                        max(cpu_cap.values()), EPSILON
                    ),
                ),
                vm.id,
            ),
        )
        all_fit = True
        for vm in sorted_vms:
            memory, cpu = demands[vm.id]
            possible = [
                host_id
                for host_id in eligible[vm.id]
                if remaining_mem[host_id] + EPSILON >= memory
                and remaining_cpu[host_id] + EPSILON >= cpu
            ]
            if not possible:
                all_fit = False
                break
            # Pack tightly to preserve hosts with larger headroom.
            host_id = min(
                possible,
                key=lambda h: (
                    remaining_mem[h] - memory,
                    remaining_cpu[h] - cpu,
                    h,
                ),
            )
            remaining_mem[host_id] -= memory
            remaining_cpu[host_id] -= cpu
        if all_fit:
            return

    remaining_time = deadline - monotonic()
    if remaining_time <= 0:
        raise ValueError(
            "resilience admission failed: joint placement proof time budget exhausted"
        )

    model = LpProblem("OneDRSJointRecoveryFit", LpMinimize)
    assignment = {
        (vm_id, host_id): LpVariable(f"recover_{vm_id}_{host_id}", cat="Binary")
        for vm_id, options in eligible.items()
        for host_id in options
    }
    model += 0
    for vm_id, options in eligible.items():
        model += lpSum(assignment[vm_id, h] for h in options) == 1

    for host_id in by_host:
        model += lpSum(
            demands[vm_id][0] * assignment[vm_id, host_id]
            for vm_id in eligible
            if (vm_id, host_id) in assignment
        ) <= mem_cap[host_id]
        model += lpSum(
            demands[vm_id][1] * assignment[vm_id, host_id]
            for vm_id in eligible
            if (vm_id, host_id) in assignment
        ) <= cpu_cap[host_id]

    for group in groups:
        members = sorted(set(group.vm_ids) & by_vm.keys())
        if len(members) < 2:
            continue
        if group.affined:
            first = members[0]
            for member in members[1:]:
                for host_id in by_host:
                    left = assignment.get((first, host_id))
                    right = assignment.get((member, host_id))
                    if left is None and right is None:
                        continue
                    model += (left if left is not None else 0) == (
                        right if right is not None else 0
                    )
        else:
            for host_id in by_host:
                model += lpSum(
                    assignment[member, host_id]
                    for member in members
                    if (member, host_id) in assignment
                ) <= 1
            if failure_domain_spread:
                domain_to_hosts: dict[str, list[int]] = {}
                for host_id, host in by_host.items():
                    domain = host.failure_domain or f"host:{host_id}"
                    domain_to_hosts.setdefault(domain, []).append(host_id)
                for hosts_in_domain in domain_to_hosts.values():
                    model += lpSum(
                        assignment[member, host_id]
                        for member in members
                        for host_id in hosts_in_domain
                        if (member, host_id) in assignment
                    ) <= 1

    solver = PULP_CBC_CMD(
        msg=False,
        threads=1,
        timeLimit=min(CBC_SOLVE_LIMIT_SECONDS, remaining_time),
    )
    if not solver.available():
        raise ValueError(
            "resilience admission failed: bounded recovery solver unavailable"
        )
    try:
        status = model.solve(solver)
    except (OSError, ValueError, RuntimeError) as exc:
        raise ValueError(
            f"resilience admission failed: joint recovery proof unavailable after {label}"
        ) from exc
    if status != LpStatusOptimal or monotonic() > deadline:
        raise ValueError(
            f"resilience admission failed: no verified simultaneous recovery "
            f"fit after {label} (solver status {model.status})"
        )

    # Verify the integer solution independently; a merely time-limited or
    # fractional solver return must never be accepted as a HA recovery proof.
    chosen = {}
    for vm_id, options in eligible.items():
        selected = [
            h for h in options if assignment[vm_id, h].varValue is not None
            and assignment[vm_id, h].varValue > 0.5
        ]
        if len(selected) != 1 or any(
            assignment[vm_id, h].varValue is None
            or abs(assignment[vm_id, h].varValue - round(assignment[vm_id, h].varValue))
            > EPSILON for h in options
        ):
            raise ValueError(
                "resilience admission failed: incomplete solver recovery witness"
            )
        chosen[vm_id] = selected[0]
    for host_id in by_host:
        assigned = [vm_id for vm_id, h in chosen.items() if h == host_id]
        if (sum(demands[v][0] for v in assigned) > mem_cap[host_id] + EPSILON
                or sum(demands[v][1] for v in assigned) > cpu_cap[host_id] + EPSILON):
            raise ValueError(
                "resilience admission failed: solver recovery witness exceeds capacity"
            )
    for group in groups:
        members = sorted(set(group.vm_ids) & chosen.keys())
        if len(members) < 2:
            continue
        placements = [chosen[v] for v in members]
        if group.affined and len(set(placements)) != 1:
            raise ValueError(
                "resilience admission failed: solver recovery witness violates affinity"
            )
        if not group.affined:
            if len(set(placements)) != len(placements):
                raise ValueError(
                    "resilience admission failed: solver recovery witness violates anti-affinity"
                )
            if failure_domain_spread:
                domains = [by_host[h].failure_domain or f"host:{h}" for h in placements]
                if len(set(domains)) != len(domains):
                    raise ValueError(
                        "resilience admission failed: solver recovery witness violates domain spread"
                    )
