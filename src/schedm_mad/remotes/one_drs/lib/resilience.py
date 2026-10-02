"""LayerSentry resilience admission helpers for OneDRS.

These checks deliberately complement, rather than replace, the ILP optimizer.
They provide conservative N+K admission control and correlated failure-domain
capacity validation before OneDRS emits a placement/optimization plan.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Collection

from .mapper.model import HostCapacity, VMRequirements, VMState


@dataclass(frozen=True)
class ResiliencePolicy:
    host_failure_tolerance: int = 1
    failure_domain_tolerance: int = 0
    cpu_reserve_percent: float = 0.0
    memory_reserve_percent: float = 0.0
    min_healthy_hosts: int = 1
    failure_domain_spread: bool = True
    max_group_migrations: int = 1

    def __post_init__(self) -> None:
        if self.host_failure_tolerance < 0:
            raise ValueError("host_failure_tolerance must be >= 0")
        if self.failure_domain_tolerance < 0:
            raise ValueError("failure_domain_tolerance must be >= 0")
        if not 0 <= self.cpu_reserve_percent < 100:
            raise ValueError("cpu_reserve_percent must be in [0, 100)")
        if not 0 <= self.memory_reserve_percent < 100:
            raise ValueError("memory_reserve_percent must be in [0, 100)")
        if self.min_healthy_hosts < 1:
            raise ValueError("min_healthy_hosts must be >= 1")
        if self.max_group_migrations < 0:
            raise ValueError("max_group_migrations must be >= 0")


@dataclass(frozen=True)
class ResilienceReport:
    healthy_hosts: int
    host_failure_tolerance: int
    failure_domain_tolerance: int
    memory_demand: float
    cpu_demand: float
    surviving_memory: float
    surviving_cpu: float
    surviving_domain_memory: float
    surviving_domain_cpu: float


def _usable(value: float, reserve_percent: float) -> float:
    return value * (1.0 - reserve_percent / 100.0)


def _worst_case_survivor_capacity(
    values: Collection[float], failures: int
) -> float:
    ordered = sorted((max(0.0, float(v)) for v in values), reverse=True)
    if failures <= 0:
        return sum(ordered)
    if failures >= len(ordered):
        return 0.0
    return sum(ordered[failures:])


def _demand(vm_requirements: Collection[VMRequirements], hosts: Collection[HostCapacity]):
    # Requested VM resources are preferred for admission control. Current host
    # usage is also included conservatively so a partial requirements set cannot
    # accidentally understate the cluster demand.
    # Admission includes both running and pending/requested VMs. Excluding
    # pending VMs would understate the post-placement demand and could admit a
    # cluster that cannot actually preserve the configured N+K reserve.
    req_mem = sum(float(vm.memory) for vm in vm_requirements)
    req_cpu = sum(float(vm.cpu_ratio) for vm in vm_requirements)
    host_mem = sum(float(host.memory.usage) for host in hosts)
    host_cpu = sum(float(host.cpu.usage) for host in hosts)
    return max(req_mem, host_mem), max(req_cpu, host_cpu)


def validate_resilience(
    host_capacities: Collection[HostCapacity],
    vm_requirements: Collection[VMRequirements],
    policy: ResiliencePolicy,
) -> ResilienceReport:
    healthy = [host for host in host_capacities if host.healthy]

    if len(healthy) < policy.min_healthy_hosts:
        raise ValueError(
            f"resilience admission failed: only {len(healthy)} healthy hosts, "
            f"minimum is {policy.min_healthy_hosts}"
        )

    if policy.host_failure_tolerance >= len(healthy):
        raise ValueError(
            "resilience admission failed: host failure tolerance leaves no "
            "surviving host"
        )

    memory_demand, cpu_demand = _demand(vm_requirements, healthy)

    surviving_memory = _worst_case_survivor_capacity(
        [host.memory.total for host in healthy],
        policy.host_failure_tolerance,
    )
    surviving_cpu = _worst_case_survivor_capacity(
        [host.cpu.total for host in healthy],
        policy.host_failure_tolerance,
    )

    usable_memory = _usable(surviving_memory, policy.memory_reserve_percent)
    usable_cpu = _usable(surviving_cpu, policy.cpu_reserve_percent)

    if memory_demand > usable_memory:
        raise ValueError(
            "resilience admission failed: memory demand "
            f"{memory_demand:.2f} exceeds N+{policy.host_failure_tolerance} "
            f"survivor capacity {usable_memory:.2f}"
        )
    if cpu_demand > usable_cpu:
        raise ValueError(
            "resilience admission failed: CPU demand "
            f"{cpu_demand:.2f} exceeds N+{policy.host_failure_tolerance} "
            f"survivor capacity {usable_cpu:.2f}"
        )

    domains: dict[str, list[HostCapacity]] = defaultdict(list)
    for host in healthy:
        domains[host.failure_domain or f"host:{host.id}"].append(host)

    domain_memory = [
        sum(float(host.memory.total) for host in members)
        for members in domains.values()
    ]
    domain_cpu = [
        sum(float(host.cpu.total) for host in members)
        for members in domains.values()
    ]

    if policy.failure_domain_tolerance >= len(domains) and policy.failure_domain_tolerance > 0:
        raise ValueError(
            "resilience admission failed: failure-domain tolerance leaves no "
            "surviving domain"
        )

    surviving_domain_memory = _worst_case_survivor_capacity(
        domain_memory, policy.failure_domain_tolerance
    )
    surviving_domain_cpu = _worst_case_survivor_capacity(
        domain_cpu, policy.failure_domain_tolerance
    )

    if policy.failure_domain_tolerance:
        usable_domain_memory = _usable(
            surviving_domain_memory, policy.memory_reserve_percent
        )
        usable_domain_cpu = _usable(
            surviving_domain_cpu, policy.cpu_reserve_percent
        )
        if memory_demand > usable_domain_memory:
            raise ValueError(
                "resilience admission failed: memory demand cannot survive "
                f"loss of {policy.failure_domain_tolerance} failure domain(s)"
            )
        if cpu_demand > usable_domain_cpu:
            raise ValueError(
                "resilience admission failed: CPU demand cannot survive "
                f"loss of {policy.failure_domain_tolerance} failure domain(s)"
            )

    return ResilienceReport(
        healthy_hosts=len(healthy),
        host_failure_tolerance=policy.host_failure_tolerance,
        failure_domain_tolerance=policy.failure_domain_tolerance,
        memory_demand=memory_demand,
        cpu_demand=cpu_demand,
        surviving_memory=surviving_memory,
        surviving_cpu=surviving_cpu,
        surviving_domain_memory=surviving_domain_memory,
        surviving_domain_cpu=surviving_domain_cpu,
    )
