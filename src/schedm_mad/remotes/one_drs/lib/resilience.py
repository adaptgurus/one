"""Scenario-based resilience admission helpers for LayerSentry OneDRS.

The native OneDRS ILP remains the placement engine. These helpers validate
whether a requested protection policy remains feasible after concrete host or
failure-domain losses before a plan is emitted.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass
from itertools import combinations
from math import comb

from .mapper.model import HostCapacity, VMGroup, VMRequirements, VMState


@dataclass(frozen=True)
class ResiliencePolicy:
    enabled: bool = False
    host_failure_tolerance: int = 0
    failure_domain_tolerance: int = 0
    cpu_reserve_percent: float = 0.0
    memory_reserve_percent: float = 0.0
    min_healthy_hosts: int = 1
    failure_domain_spread: bool = False
    require_failure_domain_labels: bool = False
    combined_failure_modes: bool = False
    max_group_migrations: int | None = None
    max_failure_scenarios: int = 1024

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
        if self.max_group_migrations is not None and self.max_group_migrations < 0:
            raise ValueError("max_group_migrations must be >= 0 or disabled")
        if self.max_failure_scenarios < 1:
            raise ValueError("max_failure_scenarios must be >= 1")


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
    scenarios_checked: int = 0


def _usable(value: float, reserve_percent: float) -> float:
    return value * (1.0 - reserve_percent / 100.0)


def _demand(
    vm_requirements: Collection[VMRequirements],
    hosts: Collection[HostCapacity],
) -> tuple[float, float]:
    # Host usage covers workloads that may be absent from the scheduler's
    # requirements list. Non-pending requested capacity is a second view of
    # existing demand. Pending VMs are additive because they are not reflected
    # in current host usage yet.
    pending_mem = sum(
        float(vm.memory)
        for vm in vm_requirements
        if vm.state is VMState.PENDING
    )
    pending_cpu = sum(
        float(vm.cpu_ratio)
        for vm in vm_requirements
        if vm.state is VMState.PENDING
    )
    existing_req_mem = sum(
        float(vm.memory)
        for vm in vm_requirements
        if vm.state is not VMState.PENDING
    )
    existing_req_cpu = sum(
        float(vm.cpu_ratio)
        for vm in vm_requirements
        if vm.state is not VMState.PENDING
    )
    host_mem = sum(
        float(
            host.committed_memory
            if host.committed_memory is not None
            else host.memory.usage
        )
        for host in hosts
    )
    host_cpu = sum(
        float(
            host.committed_cpu
            if host.committed_cpu is not None
            else host.cpu.usage
        )
        for host in hosts
    )
    return (
        max(host_mem, existing_req_mem) + pending_mem,
        max(host_cpu, existing_req_cpu) + pending_cpu,
    )


def _eligible_survivors(
    vm: VMRequirements,
    survivor_ids: set[int],
) -> set[int]:
    eligible = (
        set(survivor_ids)
        if vm.host_ids is None
        else set(vm.host_ids) & survivor_ids
    )

    # If a storage requirement has no shared datastore candidate and carries
    # explicit host-local datastore matches, only those hosts are valid
    # recovery targets. This prevents aggregate CPU/RAM headroom from
    # pretending a local-storage VM is freely movable.
    for storage in vm.storage.values():
        if storage.shared_dstore_ids:
            continue
        if storage.local_dstore_ids is not None:
            eligible &= set(storage.local_dstore_ids)

    return eligible


def _has_distinct_assignment(
    vm_ids: list[int],
    candidates: dict[int, set[int]],
    key_for_host,
) -> bool:
    ordered = sorted(vm_ids, key=lambda vm_id: len(candidates[vm_id]))
    used = set()

    def assign(index: int) -> bool:
        if index == len(ordered):
            return True
        vm_id = ordered[index]
        for host_id in candidates[vm_id]:
            key = key_for_host(host_id)
            if key in used:
                continue
            used.add(key)
            if assign(index + 1):
                return True
            used.remove(key)
        return False

    return assign(0)


def _validate_placement_reachability(
    survivors: list[HostCapacity],
    vm_requirements: Collection[VMRequirements],
    vm_groups: Collection[VMGroup],
    failure_domain_spread: bool,
) -> None:
    survivor_ids = {host.id for host in survivors}
    host_by_id = {host.id: host for host in survivors}
    candidates: dict[int, set[int]] = {}

    for vm in vm_requirements:
        eligible = _eligible_survivors(vm, survivor_ids)
        # Also require the VM to fit individually. Aggregate capacity alone
        # cannot detect a large VM that fits nowhere after a failure.
        eligible = {
            host_id
            for host_id in eligible
            if host_by_id[host_id].memory.total >= vm.memory
            and host_by_id[host_id].cpu.total >= vm.cpu_ratio
        }
        if not eligible:
            raise ValueError(
                f"resilience admission failed: VM {vm.id} has no eligible "
                "surviving host"
            )
        candidates[vm.id] = eligible

    for group in vm_groups:
        if group.affined:
            continue
        members = sorted(vm_id for vm_id in group.vm_ids if vm_id in candidates)
        if len(members) < 2:
            continue

        if not _has_distinct_assignment(
            members, candidates, lambda host_id: host_id
        ):
            raise ValueError(
                f"resilience admission failed: anti-affinity group {group.id} "
                "cannot map to distinct surviving hosts"
            )

        if failure_domain_spread and not _has_distinct_assignment(
            members,
            candidates,
            lambda host_id: host_by_id[host_id].failure_domain
            or f"host:{host_id}",
        ):
            raise ValueError(
                f"resilience admission failed: anti-affinity group {group.id} "
                "cannot map to distinct surviving failure domains"
            )


def _scenario_count(n: int, failures: int) -> int:
    if failures <= 0:
        return 1
    if failures > n:
        return 0
    return comb(n, failures)


def _evaluate_scenario(
    survivors: list[HostCapacity],
    vm_requirements: Collection[VMRequirements],
    vm_groups: Collection[VMGroup],
    policy: ResiliencePolicy,
    memory_demand: float,
    cpu_demand: float,
    label: str,
) -> tuple[float, float]:
    if not survivors:
        raise ValueError(
            f"resilience admission failed: {label} leaves no surviving host"
        )

    memory = sum(float(host.memory.total) for host in survivors)
    cpu = sum(float(host.cpu.total) for host in survivors)
    usable_memory = _usable(memory, policy.memory_reserve_percent)
    usable_cpu = _usable(cpu, policy.cpu_reserve_percent)

    if memory_demand > usable_memory:
        raise ValueError(
            f"resilience admission failed: memory demand {memory_demand:.2f} "
            f"exceeds survivor capacity {usable_memory:.2f} after {label}"
        )
    if cpu_demand > usable_cpu:
        raise ValueError(
            f"resilience admission failed: CPU demand {cpu_demand:.2f} "
            f"exceeds survivor capacity {usable_cpu:.2f} after {label}"
        )

    _validate_placement_reachability(
        survivors,
        vm_requirements,
        vm_groups,
        policy.failure_domain_spread,
    )
    return memory, cpu


def validate_resilience(
    host_capacities: Collection[HostCapacity],
    vm_requirements: Collection[VMRequirements],
    policy: ResiliencePolicy,
    vm_groups: Collection[VMGroup] = (),
) -> ResilienceReport:
    healthy = [host for host in host_capacities if host.healthy]

    if not policy.enabled:
        return ResilienceReport(
            healthy_hosts=len(healthy),
            host_failure_tolerance=0,
            failure_domain_tolerance=0,
            memory_demand=0,
            cpu_demand=0,
            surviving_memory=sum(float(h.memory.total) for h in healthy),
            surviving_cpu=sum(float(h.cpu.total) for h in healthy),
            surviving_domain_memory=sum(float(h.memory.total) for h in healthy),
            surviving_domain_cpu=sum(float(h.cpu.total) for h in healthy),
            scenarios_checked=0,
        )

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

    if (
        policy.require_failure_domain_labels
        and (policy.failure_domain_tolerance or policy.failure_domain_spread)
        and any(not host.failure_domain_labeled for host in healthy)
    ):
        raise ValueError(
            "resilience admission failed: explicit failure-domain labels are "
            "required for all healthy hosts"
        )

    memory_demand, cpu_demand = _demand(vm_requirements, host_capacities)

    host_scenarios = _scenario_count(
        len(healthy), policy.host_failure_tolerance
    )

    domains: dict[str, list[HostCapacity]] = defaultdict(list)
    for host in healthy:
        domains[host.failure_domain or f"host:{host.id}"].append(host)

    if (
        policy.failure_domain_tolerance > 0
        and policy.failure_domain_tolerance >= len(domains)
    ):
        raise ValueError(
            "resilience admission failed: failure-domain tolerance leaves no "
            "surviving domain"
        )

    domain_scenarios = (
        _scenario_count(len(domains), policy.failure_domain_tolerance)
        if policy.failure_domain_tolerance
        else 0
    )
    combined_scenarios = 0
    if (
        policy.combined_failure_modes
        and policy.failure_domain_tolerance
        and policy.host_failure_tolerance
    ):
        domain_names = sorted(domains)
        for failed_domains in combinations(
            domain_names, policy.failure_domain_tolerance
        ):
            remaining_hosts = sum(
                len(members)
                for domain, members in domains.items()
                if domain not in set(failed_domains)
            )
            if remaining_hosts <= policy.host_failure_tolerance:
                raise ValueError(
                    "resilience admission failed: combined failure policy "
                    f"after domains {sorted(failed_domains)} leaves only "
                    f"{remaining_hosts} hosts for additional tolerance "
                    f"{policy.host_failure_tolerance}"
                )
            combined_scenarios += _scenario_count(
                remaining_hosts, policy.host_failure_tolerance
            )

    total_scenarios = host_scenarios + domain_scenarios + combined_scenarios
    if total_scenarios > policy.max_failure_scenarios:
        raise ValueError(
            "resilience admission failed: configured failure policy requires "
            f"{total_scenarios} scenarios, exceeding safety limit "
            f"{policy.max_failure_scenarios}"
        )

    min_host_memory = float("inf")
    min_host_cpu = float("inf")
    checked = 0
    healthy_by_id = {host.id: host for host in healthy}
    healthy_ids = sorted(healthy_by_id)

    failed_host_sets = (
        combinations(healthy_ids, policy.host_failure_tolerance)
        if policy.host_failure_tolerance
        else [()]
    )
    for failed in failed_host_sets:
        failed_set = set(failed)
        survivors = [
            host
            for host_id, host in healthy_by_id.items()
            if host_id not in failed_set
        ]
        memory, cpu = _evaluate_scenario(
            survivors,
            vm_requirements,
            vm_groups,
            policy,
            memory_demand,
            cpu_demand,
            f"host loss {sorted(failed_set)}",
        )
        min_host_memory = min(min_host_memory, memory)
        min_host_cpu = min(min_host_cpu, cpu)
        checked += 1

    min_domain_memory = sum(float(h.memory.total) for h in healthy)
    min_domain_cpu = sum(float(h.cpu.total) for h in healthy)

    if policy.failure_domain_tolerance:
        domain_names = sorted(domains)
        min_domain_memory = float("inf")
        min_domain_cpu = float("inf")
        for failed_domains in combinations(
            domain_names, policy.failure_domain_tolerance
        ):
            failed = set(failed_domains)
            survivors = [
                host
                for domain, members in domains.items()
                if domain not in failed
                for host in members
            ]
            memory, cpu = _evaluate_scenario(
                survivors,
                vm_requirements,
                vm_groups,
                policy,
                memory_demand,
                cpu_demand,
                f"failure-domain loss {sorted(failed)}",
            )
            min_domain_memory = min(min_domain_memory, memory)
            min_domain_cpu = min(min_domain_cpu, cpu)
            checked += 1

    if (
        policy.combined_failure_modes
        and policy.failure_domain_tolerance
        and policy.host_failure_tolerance
    ):
        domain_names = sorted(domains)
        for failed_domains in combinations(
            domain_names, policy.failure_domain_tolerance
        ):
            failed_domain_set = set(failed_domains)
            domain_survivors = [
                host
                for domain, members in domains.items()
                if domain not in failed_domain_set
                for host in members
            ]
            survivor_by_id = {host.id: host for host in domain_survivors}
            for failed_hosts in combinations(
                sorted(survivor_by_id), policy.host_failure_tolerance
            ):
                failed_host_set = set(failed_hosts)
                survivors = [
                    host
                    for host_id, host in survivor_by_id.items()
                    if host_id not in failed_host_set
                ]
                _evaluate_scenario(
                    survivors,
                    vm_requirements,
                    vm_groups,
                    policy,
                    memory_demand,
                    cpu_demand,
                    "combined loss domains="
                    f"{sorted(failed_domain_set)} hosts="
                    f"{sorted(failed_host_set)}",
                )
                checked += 1

    return ResilienceReport(
        healthy_hosts=len(healthy),
        host_failure_tolerance=policy.host_failure_tolerance,
        failure_domain_tolerance=policy.failure_domain_tolerance,
        memory_demand=memory_demand,
        cpu_demand=cpu_demand,
        surviving_memory=min_host_memory,
        surviving_cpu=min_host_cpu,
        surviving_domain_memory=min_domain_memory,
        surviving_domain_cpu=min_domain_cpu,
        scenarios_checked=checked,
    )
