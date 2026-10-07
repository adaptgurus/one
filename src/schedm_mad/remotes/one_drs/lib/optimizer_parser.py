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
import time
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
from lib.resilience import (
    ResiliencePolicy,
    migration_cooldown_holds,
    validate_resilience,
)


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
            "MIGRATION_COOLDOWN_SECONDS": 0,
            "WEIGHTS": {
                "CPU_USAGE": 1,
            },
        },
        "PREDICTIVE": 0,
        "MEMORY_SYSTEM_DS_SCALE": 0,
        "DIFFERENT_VNETS": True,
        "RESILIENCE": {
            "ENABLED": False,
            "HOST_FAILURE_TOLERANCE": 0,
            "FAILURE_DOMAIN_TOLERANCE": 0,
            "CPU_RESERVE_PERCENT": 0,
            "MEMORY_RESERVE_PERCENT": 0,
            "MIN_HEALTHY_HOSTS": 1,
            "FAILURE_DOMAIN_SPREAD": False,
            "REQUIRE_FAILURE_DOMAIN_LABELS": False,
            "COMBINED_FAILURE_MODES": False,
            "MAX_GROUP_MIGRATIONS": -1,
            "MAX_FAILURE_SCENARIOS": 1024,
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
                attrs["CLUSTERS"] = list(data.clusters.id)
                if (shared := attrs.get("SHARED")) == "YES":
                    attrs["TOTAL_MB"] = data.total_mb
                    attrs["USED_MB"] = data.used_mb
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
        host_cluster_ids: dict[int, int] = {}
        for host_data in self.scheduler_driver_action.host_pool.host:
            host_id = int(host_data.id)
            host_cluster_ids[host_id] = int(host_data.cluster_id)
            for dstore_data in host_data.host_share.datastores.ds:
                if dstore_data.id in local_dstore_attrs:
                    local_dstore_hosts[dstore_data.id].add(host_id)
        self._system_local_dstore_hosts = self._expand_local_dstore_hosts(
            local_dstore_hosts,
            local_dstore_attrs,
            host_cluster_ids,
        )

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
            migration_cooldown_seconds = 0
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
            migration_cooldown_seconds = cluster_config.get(
                "MIGRATION_COOLDOWN_SECONDS",
                self.config["MODE"].get("MIGRATION_COOLDOWN_SECONDS", 0),
            )
            smp = self.config["MODE"].get("PRIORITIZE_STORAGE_MIGRATIONS", "")
            if smp is True or str(smp).upper() == "YES":
                migration_priority = "storage"
            else:
                migration_priority = "host"
            self.config["PREDICTIVE"] = self._effective_predictive(
                cluster_config, self.config["PREDICTIVE"]
            )
            criteria = (
                self._normalize_weights(cluster_config["WEIGHTS"])
                if policy.upper() == "BALANCE"
                else policy.lower()
            )
            self._plan_id = self.scheduler_driver_action.cluster_pool.cluster[0].id
        vmg, affined_hosts, anti_affined_hosts = self._parse_vm_groups()
        vm_reqs_dict = self._parse_vm_requirements()
        for vm_req in self.scheduler_driver_action.requirements.vm:
            if vm_req.id in affined_hosts:
                # Available hosts are only the affined hosts
                new_host_ids = affined_hosts[vm_req.id]
            elif vm_req.id in anti_affined_hosts:
                # Remove anti-affined hosts from the available host_ids
                current_ids = vm_reqs_dict[vm_req.id].host_ids
                new_host_ids = current_ids - anti_affined_hosts[vm_req.id]
            else:
                continue
            vm_reqs_dict[vm_req.id] = replace(
                vm_reqs_dict[vm_req.id], host_ids=new_host_ids
            )

        if allowed_migrations == -1:
            migrations = None
        else:
            migrations = allowed_migrations
        if allowed_host_migrations == -1:
            host_migrations = None
        else:
            host_migrations = allowed_host_migrations
        if allowed_storage_migrations == -1:
            storage_migrations = None
        else:
            storage_migrations = allowed_storage_migrations

        curr_placement = self._build_current_placement(
            self._curr_alloc,
            self._used_local_dstores,
            self._used_shared_dstores,
            vm_reqs_dict,
        )

        host_capacities = self._parse_host_capacities()

        if self.mode.upper() == "OPTIMIZE" and migration_cooldown_seconds > 0:
            healthy_ids = {host.id for host in host_capacities if host.healthy}
            vm_pool = {
                int(vm.id): vm
                for vm in self.scheduler_driver_action.vm_pool.vm
            }
            now = int(time.time())
            for vm_id, vm_req in tuple(vm_reqs_dict.items()):
                current_host = self._curr_alloc.get(vm_id)
                vm_obj = vm_pool.get(vm_id)
                history = (
                    vm_obj.history_records.history
                    if vm_obj is not None and vm_obj.history_records
                    else []
                )
                if not history:
                    continue
                latest = max(history, key=lambda item: int(item.seq or 0))
                started = int(latest.stime or 0)
                if not migration_cooldown_holds(
                    current_host=current_host,
                    eligible_host_ids=vm_req.host_ids,
                    healthy_host_ids=healthy_ids,
                    last_placement_time=started,
                    cooldown_seconds=migration_cooldown_seconds,
                    now=now,
                ):
                    continue
                vm_reqs_dict[vm_id] = replace(
                    vm_req, host_ids={current_host}
                )
                self.log_vm(
                    "INFO",
                    vm_id,
                    "Host migration suppressed by OneDRS cooldown; "
                    f"{migration_cooldown_seconds - (now - started)}s remaining",
                )

        resilience_config = self.config["RESILIENCE"].copy()
        # Resilience is a cluster admission contract, so it must govern both
        # initial PLACE and later OPTIMIZE operations. Restricting cluster
        # overrides to OPTIMIZE would let a new VM bypass N+K admission.
        cluster_resilience = self._parse_cluster()
        for key in resilience_config:
            if (
                key in cluster_resilience
                and cluster_resilience[key] is not None
            ):
                resilience_config[key] = cluster_resilience[key]

        max_group_migrations = int(
            resilience_config["MAX_GROUP_MIGRATIONS"]
        )
        resilience_policy = ResiliencePolicy(
            enabled=(
                resilience_config["ENABLED"] is True
                or str(resilience_config["ENABLED"]).upper() == "YES"
            ),
            host_failure_tolerance=int(
                resilience_config["HOST_FAILURE_TOLERANCE"]
            ),
            failure_domain_tolerance=int(
                resilience_config["FAILURE_DOMAIN_TOLERANCE"]
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
            failure_domain_spread=(
                resilience_config["FAILURE_DOMAIN_SPREAD"] is True
                or str(resilience_config["FAILURE_DOMAIN_SPREAD"]).upper()
                == "YES"
            ),
            require_failure_domain_labels=(
                resilience_config["REQUIRE_FAILURE_DOMAIN_LABELS"] is True
                or str(
                    resilience_config["REQUIRE_FAILURE_DOMAIN_LABELS"]
                ).upper()
                == "YES"
            ),
            combined_failure_modes=(
                resilience_config["COMBINED_FAILURE_MODES"] is True
                or str(
                    resilience_config["COMBINED_FAILURE_MODES"]
                ).upper()
                == "YES"
            ),
            max_group_migrations=(
                None if max_group_migrations < 0 else max_group_migrations
            ),
            max_failure_scenarios=max(
                1, int(resilience_config["MAX_FAILURE_SCENARIOS"])
            ),
        )
        vm_pool_by_id = {
            int(vm.id): vm for vm in self.scheduler_driver_action.vm_pool.vm
        }
        resilience_vm_requirements = []
        for vm_req in vm_reqs_dict.values():
            vm_obj = vm_pool_by_id.get(vm_req.id)
            if vm_obj is not None and self._vm_resilience_exempt(vm_obj):
                self.log_vm(
                    "INFO",
                    vm_req.id,
                    "Excluded from LayerSentry resilience admission by "
                    "LAYERSENTRY_DRS_RESILIENCE_EXEMPT=YES",
                )
                continue
            resilience_vm_requirements.append(vm_req)

        report = validate_resilience(
            host_capacities,
            resilience_vm_requirements,
            resilience_policy,
            vm_groups=vmg,
        )
        self.log_general(
            "INFO",
            "Resilience admission passed: "
            f"healthy_hosts={report.healthy_hosts} "
            f"host_failures={report.host_failure_tolerance} "
            f"domain_failures={report.failure_domain_tolerance}",
        )

        return ILPOptimizer(
            current_placement=curr_placement,
            vm_requirements=list(vm_reqs_dict.values()),
            vm_groups=vmg,
            # Never offer ERROR/DISABLED/OFFLINE hosts as placement targets.
            # They remain in the resilience inventory so existing failures are
            # accounted for, but OneDRS may place only on MONITORED hosts.
            host_capacities=[
                host for host in host_capacities if host.healthy
            ],
            dstore_capacities=self._parse_shared_dstore_capacities(),
            image_dstore_capacities=self._parse_image_dstore_capacities(),
            vnet_capacities=self._parse_vnet_capacities(),
            criteria=criteria,
            preemptive=False,
            allowed_migrations=migrations,
            allowed_host_migrations=host_migrations,
            allowed_storage_migrations=storage_migrations,
            migration_priority=migration_priority,
            failure_domain_spread=resilience_policy.failure_domain_spread,
            max_group_migrations=resilience_policy.max_group_migrations,
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
                )
        return vm_requirements

    def _parse_vm_groups(self) -> list[VMGroup]:
        # IDs of the required VMs
        allowed_vm_ids = {vm.id for vm in self.scheduler_driver_action.requirements.vm}
        # OpenNebla VM Groups
        # groups = {group_id: {role_name: set(vm_ids)}}
        groups = {}
        for vm in self.scheduler_driver_action.vm_pool.vm:
            if not vm.template.vmgroup:
                continue
            attrs = {
                child.qname.upper(): child.text
                for child in vm.template.vmgroup.children
            }
            gid, role = int(attrs.get("VMGROUP_ID")), attrs.get("ROLE")
            groups.setdefault(gid, {}).setdefault(role, set()).add(vm.id)
        # Auxiliar dict for creating role to role affinity
        aux_vmg = {}
        # vmg = list[VMGroup]
        vmg, idx = [], 0
        # Dicts for Host-VM Affinity
        # affined_hosts = {vm_id: set(host_ids)}
        # anti_affined_hosts = {vm_id: set(host_ids)}
        affined_hosts, anti_affined_hosts = {}, {}
        # Create VM Groups for VM-VM and Host-VM Affinity
        for group in self.scheduler_driver_action.vm_group_pool.vm_group:
            gid = int(group.id)
            if gid not in groups:
                continue
            for role_obj in group.roles.role:
                if role_obj.name not in groups[gid]:
                    continue
                if (
                    role_obj.host_affined is not None
                    or role_obj.host_anti_affined is not None
                ):
                    target_hosts = (
                        affined_hosts
                        if role_obj.host_affined is not None
                        else anti_affined_hosts
                    )
                    host_list = (
                        role_obj.host_affined or role_obj.host_anti_affined
                    ).split(",")
                    for vm_id in groups[gid][role_obj.name]:
                        # Affined or anti-affined host policies
                        target_hosts.setdefault(vm_id, set()).update(
                            map(int, host_list)
                        )
                if role_obj.policy:
                    vm_group = VMGroup(
                        id=idx,
                        affined=role_obj.policy.upper() == "AFFINED",
                        vm_ids=groups[gid][role_obj.name],
                    )
                    vmg.append(vm_group)
                    aux_vmg[(gid, role_obj.name)] = vm_group
                    idx += 1
                else:
                    # Only for Role-Role affinity or VM-Host affinity
                    vm_group = VMGroup(
                        id=idx, affined=False, vm_ids=groups[gid][role_obj.name]
                    )
                    aux_vmg[(gid, role_obj.name)] = vm_group
                    idx += 1
        # Create VM Groups for Role-Role affinity
        for group in self.scheduler_driver_action.vm_group_pool.vm_group:
            gid = int(group.id)
            if gid not in groups:
                continue
            if not group.template:
                continue
            template_attr = [
                {child.qname.upper(): child.text} for child in group.template.children
            ]
            for attr in template_attr:
                # Affined role to role
                if "AFFINED" in attr:
                    affined_role = VMGroup(id=idx, affined=True, vm_ids=set())
                    for role in attr["AFFINED"].split(", "):
                        if (gid, role) in aux_vmg:
                            affined_role.vm_ids.update(aux_vmg[(gid, role)].vm_ids)
                    # Add affined_role only if there are req vm with affined roles
                    if affined_role.vm_ids:
                        vmg.append(affined_role)
                        idx += 1
                # Anti affined role to role
                elif "ANTI_AFFINED" in attr:
                    anti_affined_role = VMGroup(id=idx, affined=False, vm_ids=set())
                    for role in attr["ANTI_AFFINED"].split(", "):
                        if (gid, role) in aux_vmg:
                            # Join anti-affined VMGroups
                            if not aux_vmg[(gid, role)].affined:
                                anti_affined_role.vm_ids.update(
                                    aux_vmg[(gid, role)].vm_ids
                                )
                            # Create special anti-affined rules for affined roles
                            else:
                                for _role in attr["ANTI_AFFINED"].split(", "):
                                    if _role == role:
                                        continue
                                    for vm_id in aux_vmg[(gid, _role)].vm_ids:
                                        idx += 1
                                        extra_vmg = VMGroup(
                                            idx,
                                            False,
                                            {
                                                sorted(aux_vmg[(gid, role)].vm_ids)[0],
                                                vm_id,
                                            },
                                        )
                                        vmg.append(extra_vmg)
                    # Add anti_affined_role only if there are req vm with anti_affined roles
                    if anti_affined_role.vm_ids:
                        vmg.append(anti_affined_role)
                        idx += 1
        # List of VMGroups that conatin only required VMs
        result, idx = [], 0
        current_placement = self._curr_alloc
        for vm_group in vmg:
            target_hosts = affined_hosts if vm_group.affined else anti_affined_hosts
            new_group = VMGroup(idx, vm_group.affined, set())
            for vm_id in vm_group.vm_ids:
                if vm_id in allowed_vm_ids:
                    for aux_vm_id in vm_group.vm_ids:
                        if aux_vm_id in current_placement:
                            # Affined or anti-affined host by the placed VMs
                            target_hosts.setdefault(vm_id, set()).add(
                                current_placement[aux_vm_id]
                            )
                    # Return only required VMs
                    # NOTE: If the role has at least 1 running VM, we won't
                    # create a VMGroup for the requested VMs
                    if not (vm_group.vm_ids & current_placement.keys()):
                        new_group.vm_ids.add(vm_id)
            if new_group.vm_ids:
                result.append(new_group)
                idx += 1
        # Merge affined VMGroups
        for i in range(len(result)):
            for j in range(i + 1, len(result)):
                if (
                    result[i].vm_ids.intersection(result[j].vm_ids)
                    and result[i].affined
                    and result[j].affined
                ):
                    result[i].vm_ids.update(result[j].vm_ids)
                    result.pop(j)
        # Return a unique list that contain the affined and antiaffined roles
        # and the dicts with the affined and anti_affined hosts
        return result, affined_hosts, anti_affined_hosts

    def _parse_host_capacities(self) -> list[HostCapacity]:
        result = []
        for host in self.scheduler_driver_action.host_pool.host:
            attrs = {
                child.qname.upper(): str(child.text or "").strip()
                for child in (host.template.children if host.template else [])
            }
            explicit_failure_domain = (
                attrs.get("LAYERSENTRY_FAILURE_DOMAIN")
                or attrs.get("FAILURE_DOMAIN")
                or attrs.get("ZONE")
                or attrs.get("RACK")
            )
            failure_domain = explicit_failure_domain or f"host:{host.id}"
            drs_ready = str(
                attrs.get("LAYERSENTRY_DRS_READY", "YES")
            ).upper() not in {"NO", "FALSE", "0"}
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
                    failure_domain_labeled=bool(explicit_failure_domain),
                    # A recovered Host can remain MONITORED but explicitly
                    # withheld from DRS until storage/network/trust warm-up is
                    # complete.
                    healthy=self._host_drs_healthy(
                        int(host.state), drs_ready
                    ),
                    committed_memory=float(host.host_share.mem_usage or 0) / 1000,
                    committed_cpu=float(host.host_share.cpu_usage or 0) / 100,
                )
            )
        return result

    def _parse_local_dstore_capacities(self, host) -> dict[int, Capacity]:
        # Returns the capacities of the host system local datastores.
        #
        # HostShare lists local SYSTEM_DS entries that are currently observed
        # on the Host, but an idle Host can omit an otherwise valid cluster-
        # assigned local datastore. Cluster membership is the authoritative
        # availability boundary for a local SYSTEM_DS; use the Host's generic
        # local-disk capacity when a valid datastore is idle/unreported.
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

        host_cluster_id = int(host.cluster_id)
        generic_used = float(host.host_share.datastores.used_disk or 0)
        generic_free = float(host.host_share.datastores.free_disk or 0)
        for dstore_id, attrs in local_dstore_attrs.items():
            if dstore_id in caps:
                continue
            cluster_ids = {int(cluster_id) for cluster_id in attrs.get("CLUSTERS", [])}
            if host_cluster_id not in cluster_ids:
                continue
            if (limit := attrs.get("LIMIT_MB")) is not None:
                total_size = float(limit)
            else:
                total_size = generic_used + generic_free
            caps[dstore_id] = Capacity(total=total_size, usage=generic_used)

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

    @staticmethod
    def _select_common_cluster_onedrs(clusters):
        if not clusters:
            raise ValueError(
                "OneDRS scheduler request is missing CLUSTER_POOL policy context"
            )

        selected = []
        signatures = []
        for cluster in clusters:
            one_drs = next(
                (
                    child
                    for child in cluster.template.children
                    if child.qname.upper() == "ONE_DRS"
                ),
                None,
            )
            selected.append(one_drs)
            if one_drs is None:
                signatures.append(None)
            else:
                signatures.append(
                    tuple(
                        sorted(
                            (
                                child.qname.upper(),
                                str(child.text or "").strip(),
                            )
                            for child in one_drs.children
                        )
                    )
                )

        if len(set(signatures)) != 1:
            raise ValueError(
                "OneDRS PLACE spans candidate clusters with different "
                "ONE_DRS policies; split placement or align cluster policy"
            )

        return selected[0]

    def _parse_cluster(self) -> dict:
        result = {}
        one_drs = self._select_common_cluster_onedrs(
            self.scheduler_driver_action.cluster_pool.cluster
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
            elif name == "MIGRATION_COOLDOWN_SECONDS":
                result["MIGRATION_COOLDOWN_SECONDS"] = max(0, int(child.text))
            elif name in {
                "HOST_FAILURE_TOLERANCE",
                "FAILURE_DOMAIN_TOLERANCE",
                "MIN_HEALTHY_HOSTS",
                "MAX_FAILURE_SCENARIOS",
            }:
                result[name] = max(0, int(child.text))
            elif name == "MAX_GROUP_MIGRATIONS":
                result[name] = max(-1, int(child.text))
            elif name in {"CPU_RESERVE_PERCENT", "MEMORY_RESERVE_PERCENT"}:
                result[name] = max(0.0, min(99.0, float(child.text)))
            elif name in {
                "ENABLED",
                "FAILURE_DOMAIN_SPREAD",
                "REQUIRE_FAILURE_DOMAIN_LABELS",
                "COMBINED_FAILURE_MODES",
            }:
                result[name] = str(child.text).upper() == "YES"
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
    def _expand_local_dstore_hosts(
        local_dstore_hosts,
        local_dstore_attrs,
        host_cluster_ids,
    ):
        expanded: defaultdict[int, set[int]] = defaultdict(set)
        for dstore_id, host_ids in local_dstore_hosts.items():
            expanded[int(dstore_id)].update(int(host_id) for host_id in host_ids)

        for dstore_id, attrs in local_dstore_attrs.items():
            cluster_ids = {int(cluster_id) for cluster_id in attrs.get("CLUSTERS", [])}
            for host_id, cluster_id in host_cluster_ids.items():
                if int(cluster_id) in cluster_ids:
                    expanded[int(dstore_id)].add(int(host_id))

        return expanded

    @staticmethod
    def _build_current_placement(
        curr_alloc,
        used_local_dstores,
        used_shared_dstores,
        vm_reqs_dict,
    ) -> list[Allocation]:
        curr_placement: list[Allocation] = []
        for vm_id, host_id in curr_alloc.items():
            vm_req = vm_reqs_dict.get(vm_id)
            # A recreated VM can be PENDING while retaining historical host
            # records. That history is not a current allocation. Treating it
            # as one makes the PLACE mapper serialize a migrate action for a
            # PENDING VM, which OpenNebula correctly rejects.
            if vm_req is not None and vm_req.state is VMState.PENDING:
                continue

            if (dstore_id := used_local_dstores.get(vm_id)) is not None:
                alloc = Allocation(vm_id, host_id, dstore_id, "local")
            elif (dstore_id := used_shared_dstores.get(vm_id)) is not None:
                alloc = Allocation(vm_id, host_id, dstore_id, "shared")
            else:
                alloc = Allocation(vm_id, host_id)
            curr_placement.append(alloc)

        return curr_placement

    @staticmethod
    def _effective_predictive(cluster_config, default):
        predictive = cluster_config.get("PREDICTIVE")
        return default if predictive is None else predictive

    @staticmethod
    def _host_drs_healthy(state, drs_ready):
        # Native optimize includes state 1 (MONITORING_MONITORED) and
        # state 2 (MONITORED). Treat the transient monitoring state as
        # eligible so an ordinary probe cycle does not consume HA reserve.
        return int(state) in {1, 2} and bool(drs_ready)

    @staticmethod
    def _vm_resilience_exempt(vm):
        # Resilience admission is fail-safe by default: every VM is protected
        # unless an operator/product workflow explicitly marks that workload
        # outside the published N+K/failure-domain SLA. ONEDRS_BLOCKED does
        # not imply exemption; a blocked VM remains non-movable and therefore
        # correctly makes HA admission fail unless this separate marker exists.
        if vm.user_template is None:
            return False
        for item in vm.user_template.any_element:
            if item.qname.upper() != "LAYERSENTRY_DRS_RESILIENCE_EXEMPT":
                continue
            return str(item.text or "").strip().upper() == "YES"
        return False

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
            # VM already allocated to a local datastore. Optimization requests
            # can omit datastore candidates for an already-running VM. When
            # that happens, retain the current migratable datastore as a valid
            # same-ID target instead of collapsing recovery reachability to
            # zero hosts.
            curr_dstore_attrs = local_dstore_attrs.get(curr_dstore_id) or {}
            candidate_dstore_ids = list(vm_req.datastores.id)
            if curr_dstore_attrs.get("DS_MIGRATE") and candidate_dstore_ids:
                dstore_ids = candidate_dstore_ids
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
            # VM already allocated to a shared datastore. Preserve the current
            # datastore when the optimizer request omits candidate IDs.
            curr_dstore_attrs = shared_dstore_attrs.get(curr_dstore_id) or {}
            tm_mad = curr_dstore_attrs.get("TM_MAD")
            candidate_dstore_ids = list(vm_req.datastores.id)
            if curr_dstore_attrs.get("DS_MIGRATE") and candidate_dstore_ids:
                dstore_ids = candidate_dstore_ids
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
