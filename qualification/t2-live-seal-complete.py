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
    op = "t2-" + action.replace(".", "-") + "-" + uuid.uuid4().hex[:12]
    call("POST", "/v1/admin/jobs", {
        "operation_id": op, "site": "qualification", "host": "lsappliancequal",
        "action": action, "payload": payload, "ttl_seconds": 1800,
    })
    return op

def wait_job(op, timeout):
    deadline = time.time() + timeout
    while time.time() < deadline:
        rec = (state().get("jobs") or {}).get(op)
        if rec:
            status = rec.get("state")
            if status == "SUCCEEDED":
                print("JOB_PASS operation=%s" % op)
                return
            if status in ("FAILED", "EXPIRED", "UNKNOWN", "CANCELLED"):
                receipt = rec.get("receipt") or {}
                raise SystemExit("JOB_FAIL state=%s detail=%s" % (status, receipt.get("detail")))
        time.sleep(4)
    raise SystemExit("job timeout " + op)

host = host_state()
if not host:
    raise SystemExit("enrolled host missing")
if not host.get("last_poll_at"):
    raise SystemExit("agent has not polled controller")
interface = management_interface(host)
if not interface:
    raise SystemExit("management interface not found")

wait_job(queue("tools.ensure", {}), 1200)
wait_job(queue("host.seal", {
    "role": "platform",
    "management_cidr": "10.250.10.0/24",
    "management_interface": interface,
    "controller_local": False,
    "nfs": False,
}), 600)

deadline = time.time() + 180
final = None
while time.time() < deadline:
    final = host_state()
    inv = (final or {}).get("inventory") or {}
    if inv.get("sealed") is True and inv.get("seal_integrity_ok") is True:
        break
    time.sleep(4)

inv = (final or {}).get("inventory") or {}
if inv.get("sealed") is not True or inv.get("seal_integrity_ok") is not True:
    raise SystemExit("sealed inventory attestation not observed")

hard = inv.get("hardening") or {}
required = ("firewalld_active", "fapolicyd_active", "root_ssh_disabled", "support_no_sudo", "selinux_enforcing")
bad = [k for k in required if hard.get(k) is not True]
if bad:
    raise SystemExit("hardening evidence failed: " + ",".join(bad))
print("HOST_SEALED=PASS seal_integrity_ok=true selinux=%s reboot_required=%s" % (inv.get("selinux"), inv.get("reboot_required")))
for key in required:
    print("HARDENING_%s=true" % key.upper())
