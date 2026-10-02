#!/usr/bin/env python3
# -------------------------------------------------------------------------- #
# Copyright 2002-2026, OpenNebula Project, OpenNebula Systems                #
#                                                                            #
# Licensed under the Apache License, Version 2.0 (the "License"); you may    #
# not use this file except in compliance with the License. You may obtain    #
# a copy of the License at                                                   #
#                                                                            #
# http://www.apache.org/licenses/LICENSE-2.0                                 #
#                                                                            #
# Unless required by applicable law or agreed to in writing, software        #
# distributed under the License is distributed on an "AS IS" BASIS,          #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.   #
# See the License for the specific language governing permissions and        #
# limitations under the License.                                             #
# -------------------------------------------------------------------------- #

from collections import defaultdict
import io
import platform
import sys
from dataclasses import replace
from typing import Any

import yaml
from pulp import COIN_CMD, COINMP_DLL, GLPK_CMD
from xsdata.formats.dataclass.parsers import XmlParser

from lib.mapper.ilp_optimizer import ILPOptimizer
from lib.mapper.model import (
    Allocation,
    Capacity,
    DStoreCapacity,
    DStoreRequirement,
    HostCapacity,
    PCIDevice,
    PCIDeviceRequirement,
    VMGroup,
    VMRequirements,
    VMState,
    VNetCapacity,
)
from lib.models.scheduler_driver_action import SchedulerDriverAction
from lib.resilience import ResiliencePolicy, validate_resilience


class OptimizerParser:
    CONFIG_FILE_PATH = "/etc/one/schedulers/one_drs.conf"
    SOLVERS = {"GLPK": GLPK_CMD, "CBC": COIN_CMD, "COINMP": COINMP_DLL}
    # pulp ships the CBC solver under a per-architecture folder; map the
    # Linux uname -m value to pulp's folder name
    ARCH_MAP = {"x86_64": "i64", "aarch64": "arm64"}
    DATASTORE_TYPE = {
        # Standard datastore for disk images.
        0: "IMAGE_DS",
        # System datastore for disks of running VMs.
        1: "SYSTEM_DS",
        # File datastore for context, kernel, initrd files.
        2: "FILE_DS",
        # Backup datastore for VMs.
        3: "BACKUP_DS"
    }
    DEFAULT_CONFIG = {
        "DEFAULT_SCHED": {
            "SOLVER": "CBC",
            "SOLVER_PATH": "/usr/lib/one/python/pulp/solverdir/cbc/linux/$arch/cbc",
        },
        "PLACE": {
            "POLICY": "BALANCE",
            "WEIGHTS": {
                "CPU": 1
            },
        },
        "OPTIMIZE": {
            "POLICY": "BALANCE",
            "MIGRATION_THRESHOLD": -1,
            "HOST_MIGRATION_THRESHOLD": -1,
            "DS_MIGRATION_THRESHOLD": 0,
            "WEIGHTS": {
                "CPU_USAGE": 1,
            },
        },
        "PREDICTIVE": 0,
        "MEMORY_SYSTEM_DS_SCALE": 0,
        "DIFFERENT_VNETS": True,
        "RESILIENCE": {
            "ENABLED": False,
            "HOST_FAILURE_TOLERANCE": 1,
            "FAILURE_DOMAIN_TOLERANCE": 0,
            "CPU_RESERVE_PERCENT": 0,
            "MEMORY_RESERVE_PERCENT": 0,
            "MIN_HEALTHY_HOSTS": 1,
            "FAILURE_DOMAIN_SPREAD": False,
            "MAX_GROUP_MIGRATIONS": 1,
            "PAUSE_ON_DEGRADED": True,
            "FAILURE_DOMAIN_ATTRIBUTE": "LAYERSENTRY_FAILURE_DOMAIN",
        },
    }

    __slots__ = (
        "parser",
        "scheduler_driver_action",
        "config",
        "mode",
        "_plan_id",
        "_system_local_dstore_hosts",
        "_system_local_dstore_attrs",
        "_system_shared_dstore_attrs",
        "_image_dstore_attrs",
        "_curr_alloc",
        "_used_local_dstores",
        "_used_shared_dstores",
    )

    def __init__(self, stdin_data: bytes, mode: str):
        self.parser = XmlParser()
        self.parser.config.fail_on_unknown_properties = False
        self.scheduler_driver_action: SchedulerDriverAction = self.parser.parse(
            io.BytesIO(stdin_data), SchedulerDriverAction
        )
        self.config = self._load_config(mode)
        self.mode = mode
        self._plan_id = -1

        # The required attributes of the datastores.
        # Dict {dstore id: dstore attrs} for system local datastores.
        local_dstore_attrs: dict[int, dict[str, Any]] = {}
        # Dict {dstore id: dstore attrs} for system shared datastores.
        shared_dstore_attrs: dict[int, dict[str, Any]] = {}
        # Dict {dstore id: dstore attrs} for image datastores.
        image_dstore_attrs: dict[int, dict[str, Any]] = {}
        for data in self.scheduler_driver_action.datastore_pool.datastore:
            type_ = self.DATASTORE_TYPE[data.type_value]
            tm_mad = data.tm_mad.upper()
            attrs: dict[str, Any] = {"TYPE": type_, "TM_MAD": tm_mad}
            for item in data.template.children:
                if item.qname.upper() == "SHARED":
                    attrs["SHARED"] = item.text.upper()
                elif item.qname.upper() == "LIMIT_MB":
                    attrs["LIMIT_MB"] = int(item.text.upper())
                elif item.qname.upper() == "DS_MIGRATE":
                    attrs["DS_MIGRATE"] = item.text.upper() == "YES"
            if type_ == "SYSTEM_DS":
                if (shared := attrs.get("SHARED")) == "YES":
                    attrs["TOTAL_MB"] = data.total_mb
                    attrs["USED_MB"] = data.used_mb
                    attrs["CLUSTERS"] = data.clusters.id
                    shared_dstore_attrs[data.id] = attrs
                elif shared == "NO":
                    local_dstore_attrs[data.id] = attrs
            elif type_ == "IMAGE_DS":
                attrs["TOTAL_MB"] = data.total_mb
                attrs["USED_MB"] = data.used_mb
                attrs["CLUSTERS"] = data.clusters.id
                image_dstore_attrs[data.id] = attrs
        self._system_local_dstore_attrs = local_dstore_attrs
        self._system_shared_dstore_attrs = shared_dstore_attrs
        self._image_dstore_attrs = image_dstore_attrs

        # The hosts assiciated to the system local datastores.
        # Dict {dstore id: host ids} for system local datastores.
        local_dstore_hosts: defaultdict[int, set[int]] = defaultdict(set)
        for host_data in self.scheduler_driver_action.host_pool.host:
            host_id = host_data.id
            for dstore_data in host_data.host_share.datastores.ds:
                if dstore_data.id in local_dstore_attrs:
                    local_dstore_hosts[dstore_data.id].add(host_id)
        self._system_local_dstore_hosts = local_dstore_hosts

        # Currently used hosts and datastores.
        curr_alloc: dict[int, int] = {}
        used_local_dstores: dict[int, int] = {}
        used_shared_dstores: dict[int, int] = {}
        for data in self.scheduler_driver_action.vm_pool.vm:
            if vm_hist := data.history_records.history:
                vm_id = int(data.id)
                last_rec = max(vm_hist, key=lambda item: int(item.seq))
                if (host_id := last_rec.hid) is not None:
                    curr_alloc[vm_id] = int(host_id)
                if (dstore_id := last_rec.ds_id) is not None:
                    dstore_id_ = int(dstore_id)
                    if dstore_id_ in local_dstore_attrs:
                        used_local_dstores[vm_id] = dstore_id_
                    elif dstore_id_ in shared_dstore_attrs:
                        used_shared_dstores[vm_id] = dstore_id_
        self._curr_alloc = curr_alloc
        self._used_local_dstores = used_local_dstores
        self._used_shared_dstores = used_shared_dstores

    @property
    def plan_id(self) -> int:
        return self._plan_id

    @classmethod
    def _resolve_solver_path(cls, path: str) -> str:
        machine = platform.machine().lower()
        arch = cls.ARCH_MAP.get(machine)
        if arch is None:
            arch = "i64"
            cls.log_general(
                "WARNING",
                f"Unsupported architecture '{machine}', defaulting to '{arch}'.",
            )
        return path.replace("$arch", arch)

    @staticmethod
    def log_general(level: str, message: str):
        # Format: "LEVEL: <message>"
        sys.stderr.write(f"{level}: {message}\n")

    @staticmethod
    def log_vm(level: str, vm_id: int, message: str):
        # Format: "LEVEL: [vm_id] <message>"
        sys.stderr.write(f"{level}: {vm_id} {message}\n")

    @classmethod
    def _load_config(cls, mode: str) -> dict:
        try:
            with open(cls.CONFIG_FILE_PATH, "r") as file:
                config_data = yaml.safe_load(file)
        except Exception as e:
            cls.log_general("ERROR", f"Error loading config: {e}")
            sys.exit(1)

        # Select Policy based on mode
        mode_config = config_data.get(mode.upper(), {})
        default_mode_config = cls.DEFAULT_CONFIG.get(mode.upper(), {})

        if not mode_config:
            cls.log_general(
                "WARNING",
                f"Missing {mode} configuration. Using default options.",
            )
            mode_config = default_mode_config.copy()
        else:
            for key, value in default_mode_config.items():
                if key == "WEIGHTS":
                    continue
                mode_config.setdefault(key, value)

        # Optimizer solver
        default_solver = cls.DEFAULT_CONFIG["DEFAULT_SCHED"]
        default_sched = config_data.get("DEFAULT_SCHED", {})
        solver_name = default_sched.get("SOLVER", "").upper()
        solver_path = default_sched.get("SOLVER_PATH", None)
        if solver_name not in cls.SOLVERS or not solver_path:
            cls.log_general(
                "WARNING",
                f"Invalid or missing solver '{solver_name}' at '{solver_path}'. Using default.",
            )
            solver_name, solver_path = (
                default_solver["SOLVER"],
                default_solver["SOLVER_PATH"],
            )
        solver_path = cls._resolve_solver_path(solver_path)
        solver = cls.SOLVERS[solver_name](msg=False, timeLimit=60, path=solver_path)
        if not solver.available():
            cls.log_general("ERROR", f"Solver {solver_name} is not available.")
            sys.exit(1)

        # Schedule configuration
        sched_config = {}
        sched_config["MEMORY_SYSTEM_DS_SCALE"] = config_data.get(
            "MEMORY_SYSTEM_DS_SCALE", cls.DEFAULT_CONFIG["MEMORY_SYSTEM_DS_SCALE"]
        )
        sched_config["DIFFERENT_VNETS"] = config_data.get(
            "DIFFERENT_VNETS", cls.DEFAULT_CONFIG["DIFFERENT_VNETS"]
        )
        sched_config["PREDICTIVE"] = config_data.get(
            "PREDICTIVE", cls.DEFAULT_CONFIG["PREDICTIVE"]
        )
        resilience = cls.DEFAULT_CONFIG["RESILIENCE"].copy()
        resilience.update(config_data.get("RESILIENCE", {}) or {})
        sched_config["RESILIENCE"] = resilience

        return {
            "MODE": mode_config,
            "SOLVER": solver,
            **sched_config,
        }

    def build_optimizer(self) -> ILPOptimizer:
        cluster_config = {}

        if self.mode.upper() == "PLACE":
            criteria = self.config["MODE"]["POLICY"].lower()
            if criteria.upper() == "BALANCE":
                weights = self.config["MODE"].get(
                    "WEIGHTS", self.DEFAULT_CONFIG[self.mode.upper()]["WEIGHTS"]
                )
                criteria = self._normalize_weights(weights)
            allowed_migrations = -1
            allowed_host_migrations = -1
            allowed_storage_migrations = 0
            migration_priority = None
        else:
            cluster_config = self._parse_cluster()
            policy = cluster_config.get(
                "POLICY", self.config["MODE"]["POLICY"]
            )
            allowed_migrations = cluster_config.get(
                "MIGRATION_THRESHOLD",
                self.config["MODE"]["MIGRATION_THRESHOLD"]
            )
            allowed_host_migrations = cluster_config.get(
                "HOST_MIGRATION_THRESHOLD",
                self.config["MODE"]["HOST_MIGRATION_THRESHOLD"],
            )
            allowed_storage_migrations = cluster_config.get(
                "DS_MIGRATION_THRESHOLD",
                self.config["MODE"]["DS_MIGRATION_THRESHOLD"],
            )
            smp = self.config["MODE"].get("PRIORITIZE_STORAGE_MIGRATIONS", "")
            migration_priority = (
                "storage"
                if smp is True or str(smp).upper() == "YES"
                else "host"
            )
            self.config["PREDICTIVE"] = cluster_config.get(
                "PREDICTIVE", self.config["PREDICTIVE"]
            )
            criteria = (
                self._normalize_weights(cluster_config["WEIGHTS"])
                if policy.upper() == "BALANCE"
                else policy.lower()
            )
            self._plan_id = (
                self.scheduler_driver_action.cluster_pool.cluster[0].id
            )

        vmg, affined_hosts, anti_affined_hosts = self._parse_vm_groups()
        vm_reqs_dict = self._parse_vm_requirements()

        for vm_req in self.scheduler_driver_action.requirements.vm:
            vm_id = int(vm_req.id)
            if vm_id not in vm_reqs_dict:
                continue
            if vm_id in affined_hosts:
                new_host_ids = set(affined_hosts[vm_id])
            elif vm_id in anti_affined_hosts:
                current_ids = vm_reqs_dict[vm_id].host_ids or set()
                new_host_ids = current_ids - anti_affined_hosts[vm_id]
            else:
                continue
            vm_reqs_dict[vm_id] = replace(
                vm_reqs_dict[vm_id], host_ids=new_host_ids
            )

        migrations = None if allowed_migrations == -1 else allowed_migrations
        host_migrations = (
            None
            if allowed_host_migrations == -1
            else allowed_host_migrations
        )
        storage_migrations = (
            None
            if allowed_storage_migrations == -1
            else allowed_storage_migrations
        )

        used_local_dstores = self._used_local_dstores
        used_shared_dstores = self._used_shared_dstores
        curr_placement: list[Allocation] = []
        for vm_id, host_id in self._curr_alloc.items():
            if (dstore_id := used_local_dstores.get(vm_id)) is not None:
                alloc = Allocation(vm_id, host_id, dstore_id, "local")
            elif (dstore_id := used_shared_dstores.get(vm_id)) is not None:
                alloc = Allocation(vm_id, host_id, dstore_id, "shared")
            else:
                alloc = Allocation(vm_id, host_id)
            curr_placement.append(alloc)

        resilience_config = self.config["RESILIENCE"].copy()
        if self.mode.upper() == "OPTIMIZE":
            key_map = {
                "RESILIENCE_ENABLED": "ENABLED",
                "HOST_FAILURE_TOLERANCE": "HOST_FAILURE_TOLERANCE",
                "FAILURE_DOMAIN_TOLERANCE": "FAILURE_DOMAIN_TOLERANCE",
                "CPU_RESERVE_PERCENT": "CPU_RESERVE_PERCENT",
                "MEMORY_RESERVE_PERCENT": "MEMORY_RESERVE_PERCENT",
                "MIN_HEALTHY_HOSTS": "MIN_HEALTHY_HOSTS",
                "FAILURE_DOMAIN_SPREAD": "FAILURE_DOMAIN_SPREAD",
                "MAX_GROUP_MIGRATIONS": "MAX_GROUP_MIGRATIONS",
                "PAUSE_ON_DEGRADED": "PAUSE_ON_DEGRADED",
                "FAILURE_DOMAIN_ATTRIBUTE": "FAILURE_DOMAIN_ATTRIBUTE",
            }
            for source_key, target_key in key_map.items():
                if cluster_config.get(source_key) is not None:
                    resilience_config[target_key] = cluster_config[source_key]
        else:
            # PLACE batches can span multiple clusters. Applying one cluster's
            # N+K policy to a global pending batch is mathematically invalid.
            # LayerSentry performs cluster-scoped admission before VM creation;
            # OneDRS enforces the resilience profile during cluster OPTIMIZE.
            resilience_config["ENABLED"] = False

        def as_bool(value) -> bool:
            return value is True or str(value).strip().upper() == "YES"

        resilience_policy = ResiliencePolicy(
            enabled=as_bool(resilience_config["ENABLED"]),
            host_failure_tolerance=max(
                0, int(resilience_config["HOST_FAILURE_TOLERANCE"])
            ),
            failure_domain_tolerance=max(
                0, int(resilience_config["FAILURE_DOMAIN_TOLERANCE"])
            ),
            cpu_reserve_percent=float(
                resilience_config["CPU_RESERVE_PERCENT"]
            ),
            memory_reserve_percent=float(
                resilience_config["MEMORY_RESERVE_PERCENT"]
            ),
            min_healthy_hosts=max(
                1, int(resilience_config["MIN_HEALTHY_HOSTS"])
            ),
            failure_domain_spread=as_bool(
                resilience_config["FAILURE_DOMAIN_SPREAD"]
            ),
            max_group_migrations=max(
                0, int(resilience_config["MAX_GROUP_MIGRATIONS"])
            ),
            pause_on_degraded=as_bool(
                resilience_config["PAUSE_ON_DEGRADED"]
            ),
            failure_domain_attribute=str(
                resilience_config["FAILURE_DOMAIN_ATTRIBUTE"]
            ).strip().upper(),
        )

        host_capacities = self._parse_host_capacities(
            resilience_policy.failure_domain_attribute
        )
        shared_dstore_capacities = self._parse_shared_dstore_capacities()
        image_dstore_capacities = self._parse_image_dstore_capacities()
        vnet_capacities = self._parse_vnet_capacities()

        if resilience_policy.enabled:
            host_by_id = {host.id: host for host in host_capacities}
            dstore_by_id = {
                dstore.id: dstore for dstore in shared_dstore_capacities
            }
            candidate_hosts: dict[int, set[int]] = {}

            for vm_req in vm_reqs_dict.values():
                matches = vm_req.find_host_matches(
                    host_capacities, vnet_capacities, free=False
                )
                candidates = set(matches.hosts)

                # A failover host is useful only if every storage requirement
                # can be satisfied there. This catches local-only and
                # cluster-inaccessible datastore paths that aggregate CPU/RAM
                # admission would otherwise miss.
                storage_matches = vm_req.find_storage_matches(
                    [
                        host_by_id[hid]
                        for hid in candidates
                        if hid in host_by_id
                    ],
                    shared_dstore_capacities,
                    free=False,
                )
                for storage_match in storage_matches:
                    viable: set[int] = set(storage_match.local_dstores)
                    for dstore_id in storage_match.shared_dstores:
                        dstore = dstore_by_id.get(dstore_id)
                        if dstore is None:
                            continue
                        for host_id in candidates:
                            host = host_by_id.get(host_id)
                            if (
                                host is not None
                                and host.cluster_id in dstore.cluster_ids
                            ):
                                viable.add(host_id)
                    candidates &= viable

                candidate_hosts[vm_req.id] = candidates

            cluster_host_count = None
            if self.mode.upper() == "OPTIMIZE":
                clusters = self.scheduler_driver_action.cluster_pool.cluster
                if clusters:
                    cluster_host_count = len(clusters[0].hosts.id)

            report = validate_resilience(
                host_capacities,
                list(vm_reqs_dict.values()),
                resilience_policy,
                candidate_hosts=candidate_hosts,
                cluster_host_count=cluster_host_count,
            )
            self.log_general(
                "INFO",
                "Resilience admission passed: "
                f"healthy_hosts={report.healthy_hosts} "
                f"protected_vms={report.protected_vms} "
                f"remaining_host_failures="
                f"{report.remaining_host_failure_tolerance} "
                f"domain_failures={report.failure_domain_tolerance}",
            )

        return ILPOptimizer(
            current_placement=curr_placement,
            vm_requirements=list(vm_reqs_dict.values()),
            vm_groups=vmg,
            host_capacities=host_capacities,
            dstore_capacities=shared_dstore_capacities,
            image_dstore_capacities=image_dstore_capacities,
            vnet_capacities=vnet_capacities,
            criteria=criteria,
            preemptive=False,
            allowed_migrations=migrations,
            allowed_host_migrations=host_migrations,
            allowed_storage_migrations=storage_migrations,
            migration_priority=migration_priority,
            failure_domain_spread=(
                resilience_policy.enabled
                and resilience_policy.failure_domain_spread
            ),
            max_group_migrations=(
                resilience_policy.max_group_migrations
                if resilience_policy.enabled
                else None
            ),
            solver=self.config["SOLVER"],
        )

    def _parse_vm_requirements(self) -> dict[int, VMRequirements]:
        vm_requirements = {}
        vm_pool = {
            vm.id: vm for vm in self.scheduler_driver_action.vm_pool.vm
        }
        for vm_req in self.scheduler_driver_action.requirements.vm:
            if vm := vm_pool.get(vm_req.id):
                sys_storage, img_storage = self._build_vm_storage(vm, vm_req)
                cpu_current = float(vm.monitoring.cpu or 0)
                cpu_forecast = float(vm.monitoring.cpu_forecast or 0)
                net_current = float(vm.monitoring.nettx_bw or 0) + float(
                    vm.monitoring.netrx_bw or 0
                )
                net_forecast = float(vm.monitoring.nettx_bw_forecast or 0) + float(
                    vm.monitoring.netrx_bw_forecast or 0
                )
                disk_current = float(vm.monitoring.diskrdbytes_bw or 0) + float(
                    vm.monitoring.diskwrbytes_bw or 0
                )
                disk_forecast = float(
                    vm.monitoring.diskrdbytes_bw_forecast or 0
                ) + float(vm.monitoring.diskwrbytes_bw_forecast or 0)
                # Predictive factor only for 'optimize'
                cpu_usage = (
                    self._apply_predictive_adjustment(cpu_current, cpu_forecast)
                    if self.mode.upper() == "OPTIMIZE"
                    else cpu_current
                ) / 100.0
                net_usage = (
                    self._apply_predictive_adjustment(net_current, net_forecast)
                    if self.mode.upper() == "OPTIMIZE"
                    else net_current
                )
                disk_usage = (
                    self._apply_predictive_adjustment(disk_current, disk_forecast)
                    if self.mode.upper() == "OPTIMIZE"
                    else disk_current
                )

                host_ids = set(vm_req.hosts.id)
                resilience_protected = True
                if vm.user_template is not None:
                    for item in vm.user_template.any_element:
                        name = item.qname.upper()
                        value = str(item.text or "").strip().upper()
                        if (
                            name == "LAYERSENTRY_RESILIENCE"
                            and value in {"EXCLUDED", "NO", "DISABLED"}
                        ) or (
                            name == "LAYERSENTRY_HA_PROTECTED"
                            and value == "NO"
                        ):
                            resilience_protected = False
                            break

                if (
                    self.mode.upper() == "OPTIMIZE"
                    and vm.user_template is not None
                ):
                    for item in vm.user_template.any_element:
                        if (
                            item.qname.upper() == "ONEDRS_BLOCKED"
                            and (item.text or "").upper() == "YES"
                        ):
                            curr_host_id = self._curr_alloc.get(vm.id)
                            host_ids &= {curr_host_id}
                            break

                vm_requirements[int(vm_req.id)] = VMRequirements(
                    id=int(vm_req.id),
                    state=self._map_vm_state(vm.state, vm.lcm_state),
                    memory=int(vm.template.memory),
                    cpu_ratio=float(vm.template.cpu),
                    cpu_usage=cpu_usage,
                    storage=sys_storage,
                    image_storage=img_storage,
                    disk_usage=disk_usage,
                    pci_devices=self._build_pci_devices_requirements(
                        vm.template.pci
                    ),
                    host_ids=host_ids,
                    share_vnets=not self.config["DIFFERENT_VNETS"],
                    nic_matches={nic.id: nic.vnets.id for nic in vm_req.nic},
                    net_usage=net_usage,
                    resilience_protected=resilience_protected,
                )
        return vm_requirements

    def _parse_vm_groups(self) -> list[VMGroup]:
        """Translate native VM Group semantics for the current scheduler mode.

        PLACE anchors pending members against already-running members.
        OPTIMIZE keeps all requested group members as joint decision variables;
        it must not convert their current hosts into permanent exclusions.
        """

        allowed_vm_ids = {
            int(vm.id) for vm in self.scheduler_driver_action.requirements.vm
        }

        groups: dict[int, dict[str, set[int]]] = {}
        for vm in self.scheduler_driver_action.vm_pool.vm:
            if not vm.template.vmgroup:
                continue
            attrs = {
                child.qname.upper(): child.text
                for child in vm.template.vmgroup.children
            }
            gid = int(attrs.get("VMGROUP_ID"))
            role = attrs.get("ROLE")
            groups.setdefault(gid, {}).setdefault(role, set()).add(int(vm.id))

        # All explicitly-declared VM-to-VM relationships. Roles without POLICY
        # are kept only as references for role-to-role rules; they are not
        # silently converted into anti-affinity.
        relations: list[VMGroup] = []
        role_refs: dict[tuple[int, str], VMGroup] = {}
        affined_hosts: dict[int, set[int]] = {}
        anti_affined_hosts: dict[int, set[int]] = {}
        idx = 0

        for group in self.scheduler_driver_action.vm_group_pool.vm_group:
            gid = int(group.id)
            if gid not in groups:
                continue
            for role_obj in group.roles.role:
                role_name = role_obj.name
                if role_name not in groups[gid]:
                    continue
                members = set(groups[gid][role_name])

                if (
                    role_obj.host_affined is not None
                    or role_obj.host_anti_affined is not None
                ):
                    target_hosts = (
                        affined_hosts
                        if role_obj.host_affined is not None
                        else anti_affined_hosts
                    )
                    host_list = role_obj.host_affined or role_obj.host_anti_affined
                    parsed_hosts = {
                        int(value.strip())
                        for value in str(host_list).split(",")
                        if value.strip()
                    }
                    for vm_id in members:
                        target_hosts.setdefault(vm_id, set()).update(parsed_hosts)

                policy = str(role_obj.policy or "").strip().upper()
                if policy in {"AFFINED", "ANTI_AFFINED"}:
                    relation = VMGroup(
                        id=idx,
                        affined=policy == "AFFINED",
                        vm_ids=members,
                    )
                    relations.append(relation)
                    role_refs[(gid, role_name)] = relation
                    idx += 1
                else:
                    # Reference only. The affinity bit has no semantic meaning
                    # until an explicit role-to-role relation is created.
                    role_refs[(gid, role_name)] = VMGroup(
                        id=-1, affined=False, vm_ids=members
                    )

        def role_names(value) -> list[str]:
            return [
                item.strip()
                for item in str(value or "").split(",")
                if item.strip()
            ]

        # Role-to-role rules are explicit cross-role relationships.
        for group in self.scheduler_driver_action.vm_group_pool.vm_group:
            gid = int(group.id)
            if gid not in groups or not group.template:
                continue

            for child in group.template.children:
                name = child.qname.upper()
                names = role_names(child.text)
                refs = [
                    role_refs[(gid, role)]
                    for role in names
                    if (gid, role) in role_refs
                ]
                if len(refs) < 2:
                    continue

                if name == "AFFINED":
                    members: set[int] = set()
                    for ref in refs:
                        members.update(ref.vm_ids)
                    relations.append(
                        VMGroup(id=idx, affined=True, vm_ids=members)
                    )
                    idx += 1

                elif name == "ANTI_AFFINED":
                    # Cross-role anti-affinity must not accidentally impose
                    # anti-affinity *within* a role that is itself AFFINED.
                    for left_pos in range(len(refs)):
                        for right_pos in range(left_pos + 1, len(refs)):
                            left = refs[left_pos].vm_ids
                            right = refs[right_pos].vm_ids
                            for left_vm in left:
                                for right_vm in right:
                                    relations.append(
                                        VMGroup(
                                            id=idx,
                                            affined=False,
                                            vm_ids={left_vm, right_vm},
                                        )
                                    )
                                    idx += 1

        current_placement = self._curr_alloc
        result: list[VMGroup] = []

        if self.mode.upper() == "OPTIMIZE":
            # All requested members are movable together. Current placement is
            # an objective/initial state, not a hard affinity constraint.
            for relation in relations:
                members = relation.vm_ids & allowed_vm_ids
                if len(members) > 1:
                    result.append(
                        VMGroup(
                            id=len(result),
                            affined=relation.affined,
                            vm_ids=set(members),
                        )
                    )
        else:
            # Initial placement: running group members are fixed external
            # anchors while pending members are the actual decision variables.
            for relation in relations:
                target_hosts = (
                    affined_hosts if relation.affined else anti_affined_hosts
                )
                pending_members = relation.vm_ids & allowed_vm_ids

                for vm_id in pending_members:
                    for aux_vm_id in relation.vm_ids:
                        if aux_vm_id == vm_id:
                            continue
                        if aux_vm_id in current_placement:
                            target_hosts.setdefault(vm_id, set()).add(
                                current_placement[aux_vm_id]
                            )

                if not (relation.vm_ids & current_placement.keys()):
                    if len(pending_members) > 1:
                        result.append(
                            VMGroup(
                                id=len(result),
                                affined=relation.affined,
                                vm_ids=set(pending_members),
                            )
                        )

        # Merge overlapping AFFINED relations transitively without mutating a
        # list under fixed-range iteration. Anti-affinity relations remain
        # separate constraints.
        changed = True
        while changed:
            changed = False
            for i in range(len(result)):
                if not result[i].affined:
                    continue
                for j in range(i + 1, len(result)):
                    if (
                        result[j].affined
                        and result[i].vm_ids & result[j].vm_ids
                    ):
                        result[i].vm_ids.update(result[j].vm_ids)
                        result.pop(j)
                        changed = True
                        break
                if changed:
                    break

        result = [
            VMGroup(
                id=idx,
                affined=relation.affined,
                vm_ids=set(relation.vm_ids),
            )
            for idx, relation in enumerate(result)
        ]

        return result, affined_hosts, anti_affined_hosts

    def _parse_host_capacities(
        self, failure_domain_attribute: str = "LAYERSENTRY_FAILURE_DOMAIN"
    ) -> list[HostCapacity]:
        result = []
        domain_key = str(failure_domain_attribute or "").strip().upper()
        for host in self.scheduler_driver_action.host_pool.host:
            attrs = {
                child.qname.upper(): str(child.text or "").strip()
                for child in (host.template.children if host.template else [])
            }
            failure_domain = attrs.get(domain_key) or f"host:{host.id}"
            result.append(
                HostCapacity(
                    id=int(host.id),
                    memory=Capacity(
                        total=host.host_share.max_mem / 1000,
                        usage=self._apply_predictive_adjustment(
                            float(host.monitoring.capacity.used_memory or 0),
                            float(host.monitoring.capacity.used_memory_forecast or 0),
                        )
                        / 1000,
                    ),
                    cpu=Capacity(
                        total=host.host_share.max_cpu / 100,
                        usage=self._apply_predictive_adjustment(
                            float(host.host_share.cpu_usage or 0),
                            float(host.monitoring.capacity.used_cpu_forecast or 0),
                        )
                        / 100,
                    ),
                    dstores=self._parse_local_dstore_capacities(host),
                    net=Capacity(total=self._build_net_capacity(host), usage=0.0),
                    pci_devices=self._build_pci_devices(
                        host.host_share.pci_devices.pci
                    ),
                    cluster_id=int(host.cluster_id),
                    failure_domain=failure_domain,
                    healthy=int(host.state) == 2,
                )
            )
        return result

    def _parse_local_dstore_capacities(self, host) -> dict[int, Capacity]:
        # Returns the capacities of the host system local datastores.
        local_dstore_ids = set(self._system_local_dstore_attrs)
        local_dstore_attrs = self._system_local_dstore_attrs
        caps: dict[int, Capacity] = {}
        for data in host.host_share.datastores.ds:
            if data.id not in local_dstore_ids:
                continue
            if (
                (attrs := local_dstore_attrs.get(data.id))
                and (limit := attrs.get("LIMIT_MB")) is not None
            ):
                total_size = int(limit)
            else:
                total_size = data.total_mb
            cap = Capacity(total=total_size, usage=data.used_mb)
            caps[data.id] = cap
        return caps

    def _parse_dstore_capacities(
            self, all_attrs: dict[int, dict[str, Any]]
        ) -> list[DStoreCapacity]:
        # Returns the capacities of the system shared datastores.
        caps: list[DStoreCapacity] = []
        for id_, attrs in all_attrs.items():
            if (limit := attrs.get("LIMIT_MB")) is not None:
                total_size = limit
            else:
                total_size = attrs["TOTAL_MB"]
            size = Capacity(total=total_size, usage=attrs["USED_MB"])
            cluster_ids = attrs["CLUSTERS"]
            cap = DStoreCapacity(id=id_, size=size, cluster_ids=cluster_ids)
            caps.append(cap)

        return caps

    def _parse_shared_dstore_capacities(self) -> list[DStoreCapacity]:
        return self._parse_dstore_capacities(self._system_shared_dstore_attrs)

    def _parse_image_dstore_capacities(self) -> list[DStoreCapacity]:
        return self._parse_dstore_capacities(self._image_dstore_attrs)

    def _parse_vnet_capacities(self) -> list[VNetCapacity]:
        return [
            VNetCapacity(
                id=int(vnet.id),
                n_free_ip_addresses=int(vnet.ar_pool.ar[0].size)
                - int(vnet.used_leases),
                cluster_ids=vnet.clusters.id,
            )
            for vnet in self.scheduler_driver_action.vnet_pool.vnet
        ]

    def _parse_current_placement(self) -> dict[int, int]:
        alloc: dict[int, int] = {}
        for vm in self.scheduler_driver_action.vm_pool.vm:
            if vm_hist := vm.history_records.history:
                last_rec = max(vm_hist, key=lambda item: item.seq)
                alloc[int(vm.id)] = int(last_rec.hid)
        return alloc

    def _parse_cluster(self) -> dict:
        result = {}
        one_drs = next(
            (
                child
                for child in self.scheduler_driver_action.cluster_pool.cluster[
                    0
                ].template.children
                if child.qname.upper() == "ONE_DRS"
            ),
            None,
        )
        if one_drs is None:
            return {
                **self.config["MODE"].copy(),
                "PREDICTIVE": self.config["PREDICTIVE"],
            }

        for child in one_drs.children:
            name = child.qname.upper()
            if name == "MIGRATION_THRESHOLD":
                result["MIGRATION_THRESHOLD"] = max(-1, int(child.text))
            elif name == "HOST_MIGRATION_THRESHOLD":
                result["HOST_MIGRATION_THRESHOLD"] = max(-1, int(child.text))
            elif name == "DS_MIGRATION_THRESHOLD":
                result["DS_MIGRATION_THRESHOLD"] = max(-1, int(child.text))
            elif name in {
                "HOST_FAILURE_TOLERANCE",
                "FAILURE_DOMAIN_TOLERANCE",
                "MIN_HEALTHY_HOSTS",
                "MAX_GROUP_MIGRATIONS",
            }:
                result[name] = max(0, int(child.text))
            elif name in {"CPU_RESERVE_PERCENT", "MEMORY_RESERVE_PERCENT"}:
                result[name] = max(0.0, min(99.0, float(child.text)))
            elif name in {
                "RESILIENCE_ENABLED",
                "FAILURE_DOMAIN_SPREAD",
                "PAUSE_ON_DEGRADED",
            }:
                result[name] = str(child.text).upper() == "YES"
            elif name == "FAILURE_DOMAIN_ATTRIBUTE":
                result[name] = str(child.text or "").strip().upper()
        policy = next(
            (
                child.text
                for child in one_drs.children
                if child.qname.upper() == "POLICY"
            ),
            None,
        )
        predictive = next(
            (
                OptimizerParser._sanity_check(float(child.text))
                for child in one_drs.children
                if child.qname.upper() == "PREDICTIVE"
            ),
            None,
        )
        weights = self._get_weights(one_drs)

        result |= {
            "POLICY": policy,
            "WEIGHTS": weights,
            "PREDICTIVE": predictive,
        }
        return result

    @staticmethod
    def _build_pci_devices_requirements(pci_list) -> list[PCIDeviceRequirement]:
        requirements = []
        for pci in pci_list or []:
            attrs = {child.qname.upper(): child.text for child in pci.children}
            requirements.append(
                PCIDeviceRequirement(
                    short_address=attrs.get("SHORT_ADDRESS", ""),
                    vendor_id=attrs.get("VENDOR", ""),
                    device_id=attrs.get("DEVICE", ""),
                    class_id=attrs.get("CLASS", ""),
                )
            )
        return requirements

    @staticmethod
    def _build_pci_devices(pci_list) -> list[PCIDevice]:
        return [
            PCIDevice(
                short_address=pci.short_address,
                vendor_id=pci.vendor,
                device_id=pci.device,
                class_id=pci.class_value,
                vm_id=pci.vmid,
            )
            for pci in pci_list
        ]

    @staticmethod
    def _map_vm_state(state: int, lcm_state: int) -> VMState:
        if state == 3 and lcm_state == 3:
            return VMState.RUNNING
        elif state == 8:
            return VMState.POWEROFF
        elif state == 1:
            return VMState.PENDING
        else:
            return VMState.RUNNING  # TODO: default value

    @staticmethod
    def _get_weights(one_drs):
        weight_map = {
            "CPU_USAGE_WEIGHT": "CPU_USAGE",
            "CPU_WEIGHT": "CPU",
            "MEMORY_WEIGHT": "MEMORY",
            "DISK_WEIGHT": "DISK",
            "NET_WEIGHT": "NET",
        }

        return {
            weight_map[child.qname.upper()]: OptimizerParser._sanity_check(
                float(child.text)
            )
            for child in one_drs.children
            if child.qname.upper() in weight_map
        }

    @staticmethod
    def _sanity_check(value):
        return max(0, min(1, value))

    def _find_datastores(self, vm_req) -> dict[str, Any]:
        # Finds datastore candidates according to the VM requirements.
        local_dstore_ids: defaultdict[int, list[int]] = defaultdict(list)
        shared_dstore_ids: list[int] = []

        local_dstore_hosts = self._system_local_dstore_hosts
        local_dstore_attrs = self._system_local_dstore_attrs
        shared_dstore_attrs = self._system_shared_dstore_attrs
        used_local_dstores = self._used_local_dstores
        used_shared_dstores = self._used_shared_dstores
        vm_id = int(vm_req.id)
        host_ids = set(vm_req.hosts.id)

        if (curr_dstore_id := used_local_dstores.get(vm_id)) is not None:
            # VM already allocated to a local datastore.
            curr_dstore_attrs = local_dstore_attrs.get(curr_dstore_id) or {}
            if curr_dstore_attrs.get("DS_MIGRATE"):
                dstore_ids = vm_req.datastores.id
            else:
                dstore_ids = [curr_dstore_id]

            for dstore_id in dstore_ids:
                if (
                    # The datastore is among the local datastores.
                    dstore_id in local_dstore_attrs
                    # There are hosts associated to the datastore.
                    and (match_host_ids := local_dstore_hosts.get(dstore_id))
                ):
                    for host_id in host_ids & match_host_ids:
                        local_dstore_ids[host_id].append(dstore_id)

        elif (curr_dstore_id := used_shared_dstores.get(vm_id)) is not None:
            # VM already allocated to a shared datastore.
            curr_dstore_attrs = shared_dstore_attrs.get(curr_dstore_id) or {}
            tm_mad = curr_dstore_attrs.get("TM_MAD")
            if curr_dstore_attrs.get("DS_MIGRATE"):
                dstore_ids = vm_req.datastores.id
            else:
                dstore_ids = [curr_dstore_id]

            for dstore_id in dstore_ids:
                if (
                    # The datastore is among the shared datastores.
                    (attrs := shared_dstore_attrs.get(dstore_id)) is not None
                    # The datastore has the same driver.
                    and attrs.get("TM_MAD") == tm_mad
                ):
                    shared_dstore_ids.append(dstore_id)

        else:
            # VM not allocated to any datastore.
            for dstore_id in vm_req.datastores.id:
                if match_host_ids := local_dstore_hosts.get(dstore_id):
                    # Local datastore with the associated hosts.
                    for host_id in host_ids & match_host_ids:
                        local_dstore_ids[host_id].append(dstore_id)
                elif dstore_id in shared_dstore_attrs:
                    # Shared datastore.
                    shared_dstore_ids.append(dstore_id)

        return {
            "local_dstore_ids": dict(local_dstore_ids),
            "shared_dstore_ids": shared_dstore_ids
        }

    def _build_vm_storage(self, vm, vm_req):
        sys_storage: dict[int, DStoreRequirement] = {}
        img_storage: dict[int, int] = {}

        sys_size = 0
        volatiles = {"SWAP", "FS"}
        for attr in vm.template.disk:
            disk = {e.qname.upper(): e.text for e in attr.any_element}

            if not disk:
                continue

            size_ = disk.get("SIZE")
            if size_ is None:
                continue
            size = int(size_)

            snapshoot_size = disk.get("DISK_SNAPSHOT_TOTAL_SIZE")
            if snapshoot_size is not None:
                size += int(snapshoot_size)

            if disk.get("TYPE", "").upper() in volatiles:
                # Is volatile.
                sys_size += size
            else:
                dstore_id_ = disk.get("DATASTORE_ID")
                if dstore_id_ is None:
                    continue
                dstore_id = int(dstore_id_)

                img_storage.setdefault(dstore_id, 0)

                clone = disk.get("CLONE")
                if clone is None:
                    continue

                if clone.upper() == "YES":
                    st = disk.get("CLONE_TARGET")
                else:
                    st = disk.get("LN_TARGET")
                if st is not None:
                    st = st.upper()

                if st == "SELF":
                    img_storage[dstore_id] += size
                elif st == "SYSTEM":
                    sys_size += size

        memory = int(vm.template.memory)
        factor = self.config["MEMORY_SYSTEM_DS_SCALE"]
        if memory > 0 and factor >= 0:
            sys_size += int(memory * factor)

        kwa = self._find_datastores(vm_req)
        req = DStoreRequirement(id=0, vm_id=int(vm.id), size=sys_size, **kwa)
        sys_storage = {0: req}
        if self.mode.upper() != "PLACE":
            img_storage.clear()

        return sys_storage, img_storage

    def _build_dstores(self, vm_req, storage_map):
        host_disks, share_ds = defaultdict(set), []
        all_shared, _, host_ds = storage_map
        for _ds_id in vm_req.datastores.id:
            if _ds_id in host_ds:
                host_ids = host_ds[_ds_id]
                for host_id in host_ids:
                    host_disks[host_id].add(0)
            elif _ds_id in all_shared:
                share_ds.append(_ds_id)
        # TODO: Formulate the logic to decide whether shared or local
        # datastores are allowed <MS 2025-08-25>.
        # NOTE: Currently, the original logic is kept, which assumes
        # allowing local (and forbidding shared) datastores if they are
        # given in the VM requirements <MS 2025-08-25>.
        host_disks_ = {
            host_id: list(disk_ids) for host_id, disk_ids in host_disks.items()
        }
        return host_disks_, share_ds, bool(host_disks)

    def _build_disk_capacity(self, host):
        dstores = host.host_share.datastores
        used = dstores.used_disk
        free = dstores.free_disk
        return {0: Capacity(total=free + used, usage=used)}

    def _build_used_dstores(self, vm):
        if vm_hist := vm.history_records.history:
            last_rec = max(vm_hist, key=lambda item: item.seq)
            # NOTE: We can take this from the current placement.
            ds_id = last_rec.ds_id
            # Host DS
            all_shared, _, host_ds = self.get_ds_map()
            if ds_id in host_ds.keys():
                # NOTE: These are host disks, not datastores.
                self.used_local_dstores[vm.id, 0] = 0
            # Shared system ds or image ds
            elif ds_id in all_shared:
                self.used_shared_dstores[vm.id, 0] = ds_id

    def get_ds_map(self) -> tuple[set[int], set[int], dict[int, list[int]]]:
        # NOTE: Retuned items:
        # [0]: `set` of the IDs of shared system datastores
        # [1]: `set` of the IDs of image datastores
        # [2]: `dict` of the IDs of shared local datastores (keys) and
        #      `list` of the IDs of the corresponding hosts (values)
        shared_ds, image_ds = set(), set()
        for ds in self.scheduler_driver_action.datastore_pool.datastore:
            ds_attrs = {
                child.qname.upper(): child.text.upper()
                for child in ds.template.children
            }
            if ds_attrs.get("TYPE") == "IMAGE_DS":
                image_ds.add(int(ds.id))
            elif ds_attrs.get("SHARED") == "YES":
                shared_ds.add(int(ds.id))
        host_ds_dict: defaultdict[int, list[int]] = defaultdict(list)
        for host in self.scheduler_driver_action.host_pool.host:
            host_id = int(host.id)
            for host_ds in host.host_share.datastores.ds:
                host_ds_dict[int(host_ds.id)].append(host_id)
        return shared_ds, image_ds, dict(host_ds_dict)

    def get_system_ds(self, host_id):
        host = next(
            (h for h in self.scheduler_driver_action.host_pool.host if h.id == host_id),
            None,
        )
        if not host:
            return None
        for ds in self.scheduler_driver_action.datastore_pool.datastore:
            ds_attrs = {
                child.qname.upper(): child.text.upper()
                for child in ds.template.children
            }
            if (
                ds_attrs.get("TYPE") == "SYSTEM_DS"
                and host.cluster_id in ds.clusters.id
            ):
                return int(ds.id)
        return None

    def _apply_predictive_adjustment(
        self, current: float, forecast: float = None
    ) -> float:
        predictive = self.config.get("PREDICTIVE", 0)
        if predictive > 0 and forecast > 0:
            return current * (1 - predictive) + forecast * predictive
        return current

    def _normalize_weights(self, cluster_config):
        keys = ["CPU_USAGE", "CPU", "MEMORY", "DISK", "NET"]
        provided = {
            k: OptimizerParser._sanity_check(cluster_config[k])
            for k in keys
            if k in cluster_config
        }
        if not 0 < sum(provided.values()) <= 1:
            provided = self.DEFAULT_CONFIG[self.mode.upper()]["WEIGHTS"].copy()
        result = {}
        for key, weight in provided.items():
            lower_key = key.lower()
            if key == "CPU":
                new_key = f"{lower_key}_ratio"
            elif key in ["DISK", "NET"]:
                new_key = f"{lower_key}_usage"
            else:
                new_key = lower_key
            result[f"{new_key}_balance"] = weight
        return result

    def _get_cluster_placement(self):
        cluster_placement = {}
        for host in self.scheduler_driver_action.host_pool.host:
            cluster_placement.setdefault(host.cluster_id, set()).update(
                set(host.vms.id)
            )
        return cluster_placement

    def _build_disk_io_capacity(self, host) -> float:
        cluster_placement = self._get_cluster_placement()
        if host.cluster_id not in cluster_placement:
            return 0.0

        disk_io = sum(
            float(vm.monitoring.diskrdbytes_bw or 0)
            + float(vm.monitoring.diskwrbytes_bw or 0)
            for vm in self.scheduler_driver_action.vm_pool.vm
            if str(vm.id) in map(str, cluster_placement[host.cluster_id])
        )
        return disk_io

    def _build_net_capacity(self, host) -> float:
        cluster_placement = self._get_cluster_placement()
        if host.cluster_id not in cluster_placement:
            return 0.0

        net = sum(
            float(vm.monitoring.nettx_bw or 0) + float(vm.monitoring.netrx_bw or 0)
            for vm in self.scheduler_driver_action.vm_pool.vm
            if str(vm.id) in map(str, cluster_placement[host.cluster_id])
        )
        return net
