"""Opaque identities produced by the native scheduler input serializer."""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NativeEligibility:
    class Meta:
        name = "ONE_DRS_ELIGIBILITY"

    candidate: list["NativeEligibility.Candidate"] = field(
        default_factory=list, metadata={"name": "CANDIDATE", "type": "Element"}
    )

    @dataclass
    class Candidate:
        vm_id: Optional[int] = field(
            default=None, metadata={"name": "VM_ID", "type": "Element", "required": True}
        )
        host_id: Optional[int] = field(
            default=None, metadata={"name": "HOST_ID", "type": "Element", "required": True}
        )
        sha256: Optional[str] = field(
            default=None, metadata={"name": "SHA256", "type": "Element", "required": True}
        )
