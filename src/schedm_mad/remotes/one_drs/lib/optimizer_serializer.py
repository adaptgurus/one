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

from collections.abc import Mapping
from typing import Optional, Union

from xsdata.formats.dataclass.context import XmlContext
from xsdata.formats.dataclass.serializers import XmlSerializer
from xsdata.formats.dataclass.serializers.config import SerializerConfig

from lib.mapper.model import Allocation
from lib.models.plan import Plan
from lib.models.scheduler_driver_action import SchedulerDriverAction


def _get_operations(
        next: Optional[Allocation], previous: Mapping[int, Allocation]
) -> list[str]:
    if next is None:
        return ["NOOP_DEPLOY"]

    prev = previous.get(next.vm_id)

    if prev is None:
        return ["deploy"]

    opers: list[str] = []
    if next.host_id != prev.host_id:
        opers.append("migrate_host")
    if next.dstore_id != prev.dstore_id:
        opers.append("migrate_ds")

    return opers or ["NOOP_RUN"]


class OptimizerSerializer:
    __slots__ = ("xml_serializer", "plan_id", "template_sha256")

    def __init__(self, plan_id, template_sha256=None):
        xml_config = SerializerConfig(indent="  ", xml_declaration=False)
        xml_context = XmlContext()
        self.xml_serializer = XmlSerializer(context=xml_context, config=xml_config)
        self.plan_id = plan_id
        self.template_sha256 = template_sha256

    def render(self, output: Union[Plan, SchedulerDriverAction]) -> str:
        return self.xml_serializer.render(output)

    def build_optimizer_output(
        self,
        curr_placement: dict,
        opt_placement: dict,
    ) -> tuple[Plan, list]:
        logs = []
        actions = []
        for vm_id, alloc in opt_placement.items():
            for operation in _get_operations(alloc, curr_placement):
                if operation == "NOOP_DEPLOY":
                    msg = "Cannot allocate the VM following the constraints"
                    logs.append((vm_id, "ERROR", msg))
                    continue

                if operation == "NOOP_RUN":
                    msg = "VM already allocated on optimal host"
                    logs.append((vm_id, "INFO", msg))
                    continue

                # Migration or Deploy
                if operation == "migrate_host":
                    dstore_id = curr_placement[vm_id].dstore_id
                else:
                    # Operation is either `"deploy"` or `"migrate_ds"`.
                    dstore_id = alloc.dstore_id

                if operation.startswith("migrate_"):
                    operation = "migrate"

                actions.append(
                    Plan.Action(
                        vm_id=alloc.vm_id,
                        operation=operation,
                        host_id=alloc.host_id,
                        ds_id=dstore_id,
                        nic=[
                            Plan.Action.Nic(nic_id, network_id)
                            for nic_id, network_id in alloc.nics.items()
                        ],
                    )
                )
                if alloc.dstore_type == "local":
                    dstore_info = f"using host datastore {dstore_id}"
                elif alloc.dstore_type == "shared":
                    dstore_info = f"using system datastore {dstore_id}"
                else:
                    dstore_info = "without datastore"

                msg = f"Placing VM in host '{alloc.host_id}' {dstore_info}"
                logs.append((alloc.vm_id, "INFO", msg))

        plan = Plan(id=self.plan_id, template_sha256=self.template_sha256, action=actions)
        return plan, logs
