import json
import ssl
import time
import urllib.request
import uuid
from pathlib import Path

q = Path("/home/builder/layersentry-qual")
admin = (q / "admin.token").read_text(encoding="ascii").strip()
ctx = ssl.create_default_context(cafile=str(q / "agent-ca.crt"))
base = "https://10.250.10.40:9443"


def call(method, path, payload=None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    req = urllib.request.Request(base + path, data=body, method=method)
    req.add_header("Authorization", "Bearer " + admin)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, context=ctx, timeout=20) as response:
        return json.loads(response.read().decode())


def state():
    return call("GET", "/v1/admin/state")


def host_state():
    return (state().get("hosts") or {}).get("qualification/lsappliancequal")


def management_interface(host):
    inventory = host.get("inventory") or {}
    for row in inventory.get("network") or []:
        for addr in row.get("addr_info") or []:
            if addr.get("local") == "10.250.10.41":
                return row.get("ifname")
    return None


def queue(action, payload):
    operation_id = "t2-" + action.replace(".", "-") + "-" + uuid.uuid4().hex[:12]
    call(
        "POST",
        "/v1/admin/jobs",
        {
            "operation_id": operation_id,
            "site": "qualification",
            "host": "lsappliancequal",
            "action": action,
            "payload": payload,
            "ttl_seconds": 1800,
        },
    )
    return operation_id


def wait_job(operation_id, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        record = (state().get("jobs") or {}).get(operation_id)
        if record:
            status = record.get("state")
            if status == "SUCCEEDED":
                print("JOB_PASS action=%s operation=%s" % (record.get("action"), operation_id))
                return
            if status in ("FAILED", "EXPIRED", "UNKNOWN"):
                receipt = record.get("receipt") or {}
                print(
                    "JOB_FAIL action=%s state=%s status=%s detail=%s"
                    % (record.get("action"), status, receipt.get("status"), receipt.get("detail"))
                )
                raise SystemExit(2)
        time.sleep(4)
    raise SystemExit("job timeout " + operation_id)


host = host_state()
if not host:
    raise SystemExit("enrolled host missing")
interface = management_interface(host)
if not interface:
    raise SystemExit("management interface for 10.250.10.41 not found in inventory")
print("MANAGEMENT_INTERFACE=" + interface)

wait_job(queue("tools.ensure", {}), 1200)

seal_payload = {
    "role": "platform",
    "management_cidr": "10.250.10.0/24",
    "management_interface": interface,
    "controller_local": False,
    "nfs": False,
}
wait_job(queue("host.seal", seal_payload), 600)

deadline = time.time() + 180
final = None
while time.time() < deadline:
    final = host_state()
    inventory = (final or {}).get("inventory") or {}
    if inventory.get("sealed") is True and inventory.get("seal_integrity_ok") is True:
        break
    time.sleep(4)

inventory = (final or {}).get("inventory") or {}
if inventory.get("sealed") is not True or inventory.get("seal_integrity_ok") is not True:
    raise SystemExit("sealed inventory attestation not observed")

print(
    "HOST_SEALED=PASS seal_integrity_ok=true selinux=%s reboot_required=%s"
    % (inventory.get("selinux"), inventory.get("reboot_required"))
)
hardening = inventory.get("hardening") or {}
for key in sorted(hardening):
    if key in (
        "firewalld_active",
        "fapolicyd_active",
        "root_ssh_disabled",
        "support_no_sudo",
        "selinux_enforcing",
    ):
        print("HARDENING_%s=%s" % (key.upper(), hardening.get(key)))
