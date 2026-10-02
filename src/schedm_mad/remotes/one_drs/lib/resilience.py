"""LayerSentry resilience admission helpers for OneDRS.

The resilience layer is deliberately policy/admission logic around OneDRS. It
must not become a second scheduler. It is disabled by default and is intended
to be enabled per cluster after the exact failure model is qualified.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from itertools import combinations
from math import ceil
from typing import Collection, Mapping, Optional

from pulp import (
    LpMinimize,
    LpProblem,
    LpVariable,
    lpSum,
)

from .mapper.model import HostCapacity, VMGroup, VMRequirements


class ResilienceAdmissionError(ValueError):
    """The requested resilience guarantee cannot be proved."""


class ResilienceDegradedError(ResilienceAdmissionError):
    """The cluster is already degraded and ordinary optimization must pause."""


@dataclass(frozen=True)
class ResiliencePolicy:
    enabled: bool = False
    host_failure_tolerance: int = 1
    failure_domain_tolerance: int = 0
    cpu_reserve_percent: float = 0.0
    memory_reserve_percent: float = 0.0
    min_healthy_hosts: int = 1
    failure_domain_spread: bool = False
    max_group_migrations: int = 1
    pause_on_degraded: bool = True
    failure_domain_attribute: str = "LAYERSENTRY_FAILURE_DOMAIN"
    exact_recovery_proof: bool = True
    max_exact_failure_scenarios: int = 64

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
        if not self.failure_domain_attribute.strip():
            raise ValueError("failure_domain_attribute is required")
        if self.max_exact_failure_scenarios < 1:
            raise ValueError("max_exact_failure_scenarios must be >= 1")


@dataclass(frozen=True)
class ResilienceReport:
    enabled: bool
    healthy_hosts: int
    protected_vms: int
    active_unavailable_hosts: int
    configured_host_failure_tolerance: int
    remaining_host_failure_tolerance: int
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


def _protected_requirements(
    vm_requirements: Collection[VMRequirements],
) -> list[VMRequirements]:
    return [vm for vm in vm_requirements if vm.resilience_protected]


def _demand(vm_requirements: Collection[VMRequirements]) -> tuple[float, float]:
    # Failover admission is reservation/request based, not transient-utilization
    # based. DRS load balancing can use observed/predicted utilization, but an
    # N+K guarantee must be deterministic from resources needing restart.
    protected = _protected_requirements(vm_requirements)
    return (
        sum(float(vm.memory) for vm in protected),
        sum(float(vm.cpu_ratio) for vm in protected),
    )


def _candidate_union(
    protected: Collection[VMRequirements],
    candidate_hosts: Mapping[int, Collection[int]] | None,
    healthy_ids: set[int],
) -> set[int]:
    if candidate_hosts is None:
        return set(healthy_ids)
    result: set[int] = set()
    for vm in protected:
        result.update(int(hid) for hid in candidate_hosts.get(vm.id, ()))
    return result & healthy_ids


def _failure_scenarios(
    healthy: Collection[HostCapacity],
    host_failures: int,
    domain_failures: int,
) -> list[frozenset[int]]:
    """Return independent Host-loss and domain-loss scenarios.

    HOST_FAILURE_TOLERANCE and FAILURE_DOMAIN_TOLERANCE are separate
    guarantees. They are not silently combined into a stronger K-host +
    D-domain simultaneous guarantee.
    """

    healthy_ids = sorted(host.id for host in healthy)
    scenarios: set[frozenset[int]] = set()

    if host_failures > 0:
        for failed in combinations(healthy_ids, host_failures):
            scenarios.add(frozenset(failed))
    else:
        scenarios.add(frozenset())

    if domain_failures > 0:
        domains: dict[str, set[int]] = defaultdict(set)
        for host in healthy:
            domains[host.failure_domain].add(host.id)
        domain_names = sorted(domains)
        for failed_domains in combinations(domain_names, domain_failures):
            failed_hosts: set[int] = set()
            for domain in failed_domains:
                failed_hosts.update(domains[domain])
            scenarios.add(frozenset(failed_hosts))

    return sorted(scenarios, key=lambda value: (len(value), tuple(sorted(value))))


def _exact_recovery_feasible(
    healthy: Collection[HostCapacity],
    protected: Collection[VMRequirements],
    candidate_hosts: Mapping[int, Collection[int]],
    vm_groups: Collection[VMGroup],
    policy: ResiliencePolicy,
    host_failures: int,
    *,
    solver=None,
) -> None:
    """Prove restart placement for every configured failure scenario.

    A single feasibility model contains one independent placement copy per
    failure scenario, so solver timeout applies to the whole proof instead of
    once per scenario.
    """

    if not protected:
        return

    scenarios = _failure_scenarios(
        healthy,
        host_failures,
        policy.failure_domain_tolerance,
    )
    if len(scenarios) > policy.max_exact_failure_scenarios:
        raise ResilienceAdmissionError(
            "resilience admission cannot exactly prove the configured failure "
            f"model: {len(scenarios)} scenarios exceed the bounded limit "
            f"{policy.max_exact_failure_scenarios}; raise the reviewed limit "
            "or qualify a larger-cluster admission profile"
        )

    host_by_id = {host.id: host for host in healthy}
    protected_by_id = {vm.id: vm for vm in protected}
    protected_ids = set(protected_by_id)
    groups = [
        VMGroup(
            id=group.id,
            affined=group.affined,
            vm_ids=set(group.vm_ids & protected_ids),
        )
        for group in vm_groups
        if len(group.vm_ids & protected_ids) > 1
    ]

    model = LpProblem("onedrs_resilience_recovery_proof", LpMinimize)
    variables: dict[tuple[int, int, int], LpVariable] = {}

    for scenario_id, failed in enumerate(scenarios):
        surviving_ids = set(host_by_id) - set(failed)
        scenario_candidates: dict[int, set[int]] = {
            vm.id: {
                int(host_id)
                for host_id in candidate_hosts.get(vm.id, ())
                if int(host_id) in surviving_ids
            }
            for vm in protected
        }

        # Affinity is a same-host requirement. Restrict every member to the
        # common candidate set before creating decision variables.
        for group in groups:
            if not group.affined:
                continue
            common = set.intersection(
                *(scenario_candidates[vm_id] for vm_id in group.vm_ids)
            )
            for vm_id in group.vm_ids:
                scenario_candidates[vm_id] &= common

        for vm in protected:
            candidates = scenario_candidates[vm.id]
            if not candidates:
                raise ResilienceAdmissionError(
                    "resilience admission failed: failure scenario "
                    f"{scenario_id} removes every recovery host for VM {vm.id}"
                )
            for host_id in candidates:
                variables[scenario_id, vm.id, host_id] = LpVariable(
                    f"r_{scenario_id}_{vm.id}_{host_id}",
                    cat="Binary",
                )

            model += (
                lpSum(
                    variables[scenario_id, vm.id, host_id]
                    for host_id in candidates
                )
                == 1,
                f"scenario_{scenario_id}_vm_{vm.id}_one_host",
            )

        # Exact CPU/RAM packing closes aggregate-capacity fragmentation gaps.
        for host_id in surviving_ids:
            host = host_by_id[host_id]
            assigned = [
                (
                    protected_by_id[vm_id],
                    var,
                )
                for (sid, vm_id, hid), var in variables.items()
                if sid == scenario_id and hid == host_id
            ]
            if not assigned:
                continue
            model += (
                lpSum(vm.memory * var for vm, var in assigned)
                <= host.memory.total,
                f"scenario_{scenario_id}_host_{host_id}_memory",
            )
            model += (
                lpSum(vm.cpu_ratio * var for vm, var in assigned)
                <= host.cpu.total,
                f"scenario_{scenario_id}_host_{host_id}_cpu",
            )

        for group in groups:
            if group.affined:
                members = sorted(group.vm_ids)
                first = members[0]
                relevant_hosts = set().union(
                    *(scenario_candidates[vm_id] for vm_id in members)
                )
                for host_id in relevant_hosts:
                    base = variables.get(
                        (scenario_id, first, host_id),
                        0,
                    )
                    for vm_id in members[1:]:
                        other = variables.get(
                            (scenario_id, vm_id, host_id),
                            0,
                        )
                        model += (
                            base == other,
                            f"scenario_{scenario_id}_affinity_{group.id}_"
                            f"{first}_{vm_id}_{host_id}",
                        )
            else:
                for host_id in surviving_ids:
                    terms = [
                        variables[scenario_id, vm_id, host_id]
                        for vm_id in group.vm_ids
                        if (scenario_id, vm_id, host_id) in variables
                    ]
                    if len(terms) > 1:
                        model += (
                            lpSum(terms) <= 1,
                            f"scenario_{scenario_id}_anti_{group.id}_"
                            f"{host_id}",
                        )

                if policy.failure_domain_spread:
                    domains: dict[str, set[int]] = defaultdict(set)
                    for host_id in surviving_ids:
                        host = host_by_id[host_id]
                        domains[host.failure_domain].add(host_id)
                    active_domains = [
                        domain
                        for domain, host_ids in domains.items()
                        if any(
                            scenario_candidates[vm_id] & host_ids
                            for vm_id in group.vm_ids
                        )
                    ]
                    if active_domains:
                        limit = ceil(len(group.vm_ids) / len(active_domains))
                        for domain in active_domains:
                            terms = [
                                variables[scenario_id, vm_id, host_id]
                                for vm_id in group.vm_ids
                                for host_id in domains[domain]
                                if (
                                    scenario_id,
                                    vm_id,
                                    host_id,
                                ) in variables
                            ]
                            if terms:
                                safe_domain = "".join(
                                    ch if ch.isalnum() else "_"
                                    for ch in domain
                                )
                                model += (
                                    lpSum(terms) <= limit,
                                    f"scenario_{scenario_id}_spread_"
                                    f"{group.id}_{safe_domain}",
                                )

    # Feasibility only.
    model += 0
    status = model.solve(solver=solver) if solver is not None else model.solve()
    if status != 1:
        raise ResilienceAdmissionError(
            "resilience admission failed: exact recovery placement proof is "
            f"not feasible for all {len(scenarios)} configured failure "
            f"scenario(s), solver_status={status}"
        )


def validate_resilience(
    host_capacities: Collection[HostCapacity],
    vm_requirements: Collection[VMRequirements],
    policy: ResiliencePolicy,
    *,
    candidate_hosts: Mapping[int, Collection[int]] | None = None,
    vm_groups: Collection[VMGroup] | None = None,
    cluster_host_count: int | None = None,
    solver=None,
) -> ResilienceReport:
    """Validate cluster resilience without changing placement.

    candidate_hosts should be the final host candidates after native
    requirements, CPU/RAM, PCI/device and storage portability filtering.

    cluster_host_count is authoritative membership including unavailable or
    disabled members, allowing consumed failure budget to be distinguished.
    """

    healthy = [host for host in host_capacities if host.healthy]
    healthy_ids = {host.id for host in healthy}
    protected = _protected_requirements(vm_requirements)

    if not policy.enabled:
        return ResilienceReport(
            enabled=False,
            healthy_hosts=len(healthy),
            protected_vms=len(protected),
            active_unavailable_hosts=0,
            configured_host_failure_tolerance=policy.host_failure_tolerance,
            remaining_host_failure_tolerance=0,
            failure_domain_tolerance=policy.failure_domain_tolerance,
            memory_demand=0.0,
            cpu_demand=0.0,
            surviving_memory=0.0,
            surviving_cpu=0.0,
            surviving_domain_memory=0.0,
            surviving_domain_cpu=0.0,
        )

    if len(healthy) < policy.min_healthy_hosts:
        raise ResilienceAdmissionError(
            f"resilience admission failed: only {len(healthy)} healthy hosts, "
            f"minimum is {policy.min_healthy_hosts}"
        )

    if (
        policy.failure_domain_tolerance > 0
        or policy.failure_domain_spread
    ):
        unlabeled = [
            host.id for host in healthy if not host.failure_domain_explicit
        ]
        if unlabeled:
            raise ResilienceAdmissionError(
                "resilience admission failed: rack/zone protection requested "
                "but configured failure-domain attribute "
                f"{policy.failure_domain_attribute!r} is missing on Hosts "
                f"{unlabeled}"
            )

    active_unavailable = 0
    if cluster_host_count is not None:
        active_unavailable = max(0, int(cluster_host_count) - len(healthy))

    if active_unavailable and policy.pause_on_degraded:
        raise ResilienceDegradedError(
            "resilience degraded: "
            f"{active_unavailable} cluster host(s) already unavailable; "
            "ordinary OneDRS optimization is paused until the recovery owner "
            "restores or acknowledges capacity"
        )

    remaining_host_tolerance = max(
        0, policy.host_failure_tolerance - active_unavailable
    )

    if remaining_host_tolerance >= len(healthy):
        raise ResilienceAdmissionError(
            "resilience admission failed: remaining host failure tolerance "
            "leaves no surviving host"
        )

    if candidate_hosts is not None:
        required_hosts = remaining_host_tolerance + 1
        required_domains = policy.failure_domain_tolerance + 1
        host_by_id = {host.id: host for host in healthy}

        for vm in protected:
            if vm.pci_devices and not vm.resilience_device_qualified:
                raise ResilienceAdmissionError(
                    "resilience admission failed: VM "
                    f"{vm.id} has PCI/GPU/SR-IOV requirements but redundant "
                    "device failover is not qualified; set "
                    "LAYERSENTRY_DEVICE_HA_QUALIFIED=YES only after exact "
                    "device-pool recovery qualification"
                )
            if not vm.resilience_storage_qualified:
                raise ResilienceAdmissionError(
                    "resilience admission failed: VM "
                    f"{vm.id} depends on local/non-shared storage whose data "
                    "failover is not qualified; set "
                    "LAYERSENTRY_STORAGE_HA_QUALIFIED=YES only after exact "
                    "replication/recovery qualification"
                )
            candidates = {
                int(hid)
                for hid in candidate_hosts.get(vm.id, ())
                if int(hid) in healthy_ids
            }
            if len(candidates) < required_hosts:
                raise ResilienceAdmissionError(
                    f"resilience admission failed: VM {vm.id} has "
                    f"{len(candidates)} eligible healthy host(s), "
                    f"{required_hosts} required for N+"
                    f"{remaining_host_tolerance}"
                )
            if policy.failure_domain_tolerance:
                domains = {
                    host_by_id[hid].failure_domain or f"host:{hid}"
                    for hid in candidates
                }
                if len(domains) < required_domains:
                    raise ResilienceAdmissionError(
                        f"resilience admission failed: VM {vm.id} has "
                        f"{len(domains)} eligible failure domain(s), "
                        f"{required_domains} required"
                    )

        protected_ids = {vm.id for vm in protected}
        for group in vm_groups or ():
            members = sorted(group.vm_ids & protected_ids)
            if len(members) < 2:
                continue
            member_candidates = [
                {
                    int(hid)
                    for hid in candidate_hosts.get(vm_id, ())
                    if int(hid) in healthy_ids
                }
                for vm_id in members
            ]
            if group.affined:
                common = set.intersection(*member_candidates)
                group_memory = sum(
                    float(vm.memory)
                    for vm in protected
                    if vm.id in members
                )
                group_cpu = sum(
                    float(vm.cpu_ratio)
                    for vm in protected
                    if vm.id in members
                )
                common = {
                    host_id
                    for host_id in common
                    if host_by_id[host_id].memory.total >= group_memory
                    and host_by_id[host_id].cpu.total >= group_cpu
                }
                if len(common) < required_hosts:
                    raise ResilienceAdmissionError(
                        "resilience admission failed: affined VM group "
                        f"{group.id} has only {len(common)} common recovery "
                        f"host(s) able to fit the whole group, "
                        f"{required_hosts} required"
                    )
            else:
                required_distinct = len(members) + remaining_host_tolerance
                union = set().union(*member_candidates)
                if len(union) < required_distinct:
                    raise ResilienceAdmissionError(
                        "resilience admission failed: anti-affined VM group "
                        f"{group.id} has {len(union)} distinct recovery host(s), "
                        f"{required_distinct} required to preserve host "
                        "anti-affinity after failures"
                    )

                # Robust Hall condition. A group remains matchable after any K
                # host failures iff every subset S of VMs has at least
                # |S| + K neighboring candidate Hosts. Identical candidate
                # sets use the cheap exact form; heterogeneous groups are
                # exhaustively checked up to a bounded size.
                first = member_candidates[0]
                if all(candidates == first for candidates in member_candidates):
                    continue

                max_exact_members = 12
                if len(members) > max_exact_members:
                    raise ResilienceAdmissionError(
                        "resilience admission cannot exactly prove N+K for "
                        f"heterogeneous anti-affined VM group {group.id} with "
                        f"{len(members)} members; split the group, normalize "
                        "eligibility, or qualify it through an explicit "
                        "large-group policy"
                    )

                for subset_size in range(1, len(members) + 1):
                    for positions in combinations(
                        range(len(members)), subset_size
                    ):
                        neighborhood: set[int] = set()
                        for position in positions:
                            neighborhood.update(member_candidates[position])
                        required = subset_size + remaining_host_tolerance
                        if len(neighborhood) < required:
                            subset = [members[pos] for pos in positions]
                            raise ResilienceAdmissionError(
                                "resilience admission failed: anti-affined "
                                f"group {group.id} subset {subset} has only "
                                f"{len(neighborhood)} recovery host(s), "
                                f"{required} required for failure-safe "
                                "distinct placement"
                            )

    if policy.exact_recovery_proof and protected:
        if candidate_hosts is None:
            raise ResilienceAdmissionError(
                "resilience admission requires authoritative per-VM recovery "
                "candidates when exact recovery proof is enabled"
            )
        _exact_recovery_feasible(
            healthy,
            protected,
            candidate_hosts,
            list(vm_groups or ()),
            policy,
            remaining_host_tolerance,
            solver=solver,
        )

    memory_demand, cpu_demand = _demand(protected)

    reserve_host_ids = _candidate_union(protected, candidate_hosts, healthy_ids)
    reserve_hosts = [host for host in healthy if host.id in reserve_host_ids]
    if protected and not reserve_hosts:
        raise ResilienceAdmissionError(
            "resilience admission failed: protected workloads have no "
            "eligible healthy recovery hosts"
        )

    surviving_memory = _worst_case_survivor_capacity(
        [host.memory.total for host in reserve_hosts],
        remaining_host_tolerance,
    )
    surviving_cpu = _worst_case_survivor_capacity(
        [host.cpu.total for host in reserve_hosts],
        remaining_host_tolerance,
    )

    usable_memory = _usable(surviving_memory, policy.memory_reserve_percent)
    usable_cpu = _usable(surviving_cpu, policy.cpu_reserve_percent)

    if memory_demand > usable_memory:
        raise ResilienceAdmissionError(
            "resilience admission failed: protected memory demand "
            f"{memory_demand:.2f} exceeds survivor capacity "
            f"{usable_memory:.2f}"
        )
    if cpu_demand > usable_cpu:
        raise ResilienceAdmissionError(
            "resilience admission failed: protected CPU demand "
            f"{cpu_demand:.2f} exceeds survivor capacity {usable_cpu:.2f}"
        )

    domains: dict[str, list[HostCapacity]] = defaultdict(list)
    for host in reserve_hosts:
        domains[host.failure_domain or f"host:{host.id}"].append(host)

    domain_memory = [
        sum(float(host.memory.total) for host in members)
        for members in domains.values()
    ]
    domain_cpu = [
        sum(float(host.cpu.total) for host in members)
        for members in domains.values()
    ]

    if (
        policy.failure_domain_tolerance > 0
        and policy.failure_domain_tolerance >= len(domains)
    ):
        raise ResilienceAdmissionError(
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
            raise ResilienceAdmissionError(
                "resilience admission failed: protected memory demand cannot "
                f"survive loss of {policy.failure_domain_tolerance} failure "
                "domain(s)"
            )
        if cpu_demand > usable_domain_cpu:
            raise ResilienceAdmissionError(
                "resilience admission failed: protected CPU demand cannot "
                f"survive loss of {policy.failure_domain_tolerance} failure "
                "domain(s)"
            )

    return ResilienceReport(
        enabled=True,
        healthy_hosts=len(healthy),
        protected_vms=len(protected),
        active_unavailable_hosts=active_unavailable,
        configured_host_failure_tolerance=policy.host_failure_tolerance,
        remaining_host_failure_tolerance=remaining_host_tolerance,
        failure_domain_tolerance=policy.failure_domain_tolerance,
        memory_demand=memory_demand,
        cpu_demand=cpu_demand,
        surviving_memory=surviving_memory,
        surviving_cpu=surviving_cpu,
        surviving_domain_memory=surviving_domain_memory,
        surviving_domain_cpu=surviving_domain_cpu,
    )
