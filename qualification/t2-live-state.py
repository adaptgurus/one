import json
import ssl
import urllib.request
from pathlib import Path

q = Path("/home/builder/layersentry-qual")
admin = (q / "admin.token").read_text(encoding="ascii").strip()
ctx = ssl.create_default_context(cafile=str(q / "agent-ca.crt"))
req = urllib.request.Request("https://10.250.10.40:9443/v1/admin/state", method="GET")
req.add_header("Authorization", "Bearer " + admin)
with urllib.request.urlopen(req, context=ctx, timeout=20) as response:
    state = json.loads(response.read().decode())

host = (state.get("hosts") or {}).get("qualification/lsappliancequal") or {}
inventory = host.get("inventory") or {}
print(
    "HOST_STATE present=%s sealed=%s seal_integrity_ok=%s selinux=%s reboot_required=%s"
    % (
        bool(host),
        inventory.get("sealed"),
        inventory.get("seal_integrity_ok"),
        inventory.get("selinux"),
        inventory.get("reboot_required"),
    )
)
for operation_id, record in sorted((state.get("jobs") or {}).items()):
    if operation_id.startswith("t2-tools-ensure-") or operation_id.startswith("t2-host-seal-"):
        receipt = record.get("receipt") or {}
        print(
            "JOB operation=%s action=%s state=%s receipt_status=%s detail=%s"
            % (
                operation_id,
                record.get("action"),
                record.get("state"),
                receipt.get("status"),
                receipt.get("detail"),
            )
        )
