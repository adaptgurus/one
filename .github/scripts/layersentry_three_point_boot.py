#!/usr/bin/env python3
import functools
import hashlib
import http.server
import json
import os
import pathlib
import threading
import time
import xml.etree.ElementTree as ET
from xmlrpc.client import ServerProxy
from dissect.target import Target

ROOT = pathlib.Path(os.environ["RUNNER_TEMP"]) / os.environ.get("LAYERSENTRY_THREE_POINT_DIR", "three-point")
AUTH_IMAGE = pathlib.Path(r"C:\LayerSentryLab\Recovery\fe2-lvm\2.img")
ENDPOINT = "http://10.250.10.10:2633/RPC2"
HOST_HTTP_IP = "10.250.10.1"
HTTP_PORT = 18083
DATASTORE_ID = 1
TARGET_HOST = None
TARGET_HOST_CANDIDATES = [x.strip() for x in os.environ.get("LAYERSENTRY_DR_TEST_HOSTS", "ls-kvm1,ls-kvm2").split(",") if x.strip()]

def wait_image(one, auth, image_id, label):
    state = None
    for _ in range(150):
        info = one.one.image.info(auth, image_id, False)
        if not info[0]:
            raise RuntimeError(f"{label} image info failed: {str(info[1])[:300]}")
        root = ET.fromstring(info[1])
        state = int(root.findtext("STATE"))
        if state == 1:
            return
        if state in (5, 7):
            err = root.findtext("./TEMPLATE/ERROR") or root.findtext("ERROR") or "provider error"
            raise RuntimeError(f"{label} image failed: {err[:500]}")
        time.sleep(2)
    raise RuntimeError(f"{label} image did not become READY, state={state}")

def wait_vm_running(one, auth, vm_id, label):
    last = None
    for _ in range(120):
        info = one.one.vm.info(auth, vm_id, False)
        if not info[0]:
            raise RuntimeError(f"{label} VM info failed: {str(info[1])[:300]}")
        root = ET.fromstring(info[1])
        state = int(root.findtext("STATE"))
        lcm = int(root.findtext("LCM_STATE"))
        deploy_id = root.findtext("DEPLOY_ID") or ""
        histories = root.findall("./HISTORY_RECORDS/HISTORY")
        host = histories[-1].findtext("HOSTNAME") if histories else ""
        last = (state, lcm, host, deploy_id)
        if state == 3 and lcm == 3 and host == TARGET_HOST and deploy_id:
            return host, deploy_id
        if state in (6, 7):
            raise RuntimeError(f"{label} VM terminal state={state} lcm={lcm}")
        time.sleep(2)
    raise RuntimeError(f"{label} VM did not reach RUNNING: {last}")

def wait_vm_done(one, auth, vm_id):
    for _ in range(90):
        info = one.one.vm.info(auth, vm_id, False)
        if not info[0]:
            return
        root = ET.fromstring(info[1])
        if int(root.findtext("STATE")) == 6:
            return
        time.sleep(1)

def select_safe_target_host(one, auth):
    global TARGET_HOST
    result = one.one.hostpool.info(auth, -2, -1, -1)
    if not result[0]:
        raise RuntimeError("independent OpenNebula host-pool query failed")
    pool = ET.fromstring(result[1])
    rejected = []
    for name in TARGET_HOST_CANDIDATES:
        matches = [h for h in pool.findall("HOST") if (h.findtext("NAME") or "").strip() == name]
        if len(matches) != 1:
            rejected.append(f"{name}:HOST_NOT_UNIQUE")
            continue
        host = matches[0]
        policies = [(n.text or "").strip().upper() for n in host.findall(".//PIN_POLICY")]
        pin_policy = next((v for v in policies if v), "")
        vms_thread = next(((n.text or "").strip() for n in host.findall(".//VMS_THREAD") if (n.text or "").strip()), "1")
        running = int(host.findtext("./HOST_SHARE/RUNNING_VMS") or 0)
        if pin_policy != "PINNED":
            rejected.append(f"{name}:PIN_POLICY={pin_policy or 'UNSET'}")
            continue
        if vms_thread != "1":
            rejected.append(f"{name}:VMS_THREAD={vms_thread}")
            continue
        if running != 0:
            rejected.append(f"{name}:RUNNING_VMS={running}")
            continue
        TARGET_HOST = name
        print(f"DR_CPU_ISOLATION_HOST=PASS HOST={name} PIN_POLICY={pin_policy} VMS_THREAD={vms_thread} PREEXISTING_RUNNING_VMS=0")
        return
    raise RuntimeError("no safe empty PINNED independent KVM host: " + ";".join(rejected))

def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    expected_order = ["BASELINE", "MIDDLE", "LATEST"]
    if [p["label"] for p in manifest["points"]] != expected_order:
        raise RuntimeError("invalid three-point manifest ordering")
    for point in manifest["points"]:
        disk = ROOT / point["disk_file"]
        digest = hashlib.sha256(disk.read_bytes()).hexdigest()
        if digest != point["disk_sha256"]:
            raise RuntimeError("portable disk digest mismatch for " + point["label"])
        if disk.stat().st_size != point["disk_size_bytes"]:
            raise RuntimeError("portable disk size mismatch for " + point["label"])
    print("MANOJ_THREE_POINT_DIGESTS=PASS")

    target = Target.open(str(AUTH_IMAGE))
    auth = target.fs.path("/var/lib/one/.one/one_auth").open("rb").read().decode().strip()
    if ":" not in auth or len(auth) > 1024:
        raise RuntimeError("invalid recovered OpenNebula auth shape")

    one = ServerProxy(ENDPOINT, allow_none=True)
    version = one.one.system.version(auth)
    if not version[0] or str(version[1]) != "7.4.1":
        raise RuntimeError("independent OpenNebula version/auth check failed")
    print("INDEPENDENT_ONE_VERSION=" + str(version[1]))
    select_safe_target_host(one, auth)

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    created_images = []
    created_vms = []
    results = []
    try:
        for point in manifest["points"]:
            label = point["label"]
            disk = ROOT / point["disk_file"]
            image_template = f"""NAME="ls-dr-{label.lower()}-{os.environ.get('GITHUB_RUN_ID','manual')}"
PATH="http://{HOST_HTTP_IP}:{HTTP_PORT}/{disk.name}"
TYPE="OS"
PERSISTENT="NO"
DESCRIPTION="LayerSentry {label} independent DR boot qualification"
"""
            alloc = one.one.image.allocate(auth, image_template, DATASTORE_ID)
            if not alloc[0]:
                raise RuntimeError(f"{label} image allocate failed: {str(alloc[1])[:600]}")
            image_id = int(alloc[1])
            created_images.append(image_id)
            wait_image(one, auth, image_id, label)
            print(f"POINT_IMAGE_READY={label} IMAGE_ID={image_id}")

            vm_template = f"""NAME="ls-dr-{label.lower()}-boot-{os.environ.get('GITHUB_RUN_ID','manual')}"
CPU="1"
VCPU="1"
MEMORY="256"
TOPOLOGY=[
  PIN_POLICY="CORE",
  CORES="1",
  SOCKETS="1",
  THREADS="1"
]
DISK=[IMAGE_ID="{image_id}"]
SCHED_REQUIREMENTS="NAME = \"{TARGET_HOST}\""
"""
            va = one.one.vm.allocate(auth, vm_template, False)
            if not va[0]:
                raise RuntimeError(f"{label} VM allocate failed: {str(va[1])[:600]}")
            vm_id = int(va[1])
            created_vms.append(vm_id)
            host, deploy_id = wait_vm_running(one, auth, vm_id, label)
            time.sleep(5)
            info = one.one.vm.info(auth, vm_id, False)
            root = ET.fromstring(info[1])
            if int(root.findtext("STATE")) != 3 or int(root.findtext("LCM_STATE")) != 3:
                raise RuntimeError(f"{label} VM did not remain RUNNING")
            print(f"POINT_BOOT_PASS={label} VM_ID={vm_id} HOST={host} DEPLOY_ID_PRESENT=True")
            results.append({
                "label": label,
                "image_id": image_id,
                "vm_id": vm_id,
                "host": host,
                "deploy_id_present": bool(deploy_id),
                "disk_sha256": point["disk_sha256"],
                "expected_marker": point["expected_marker"],
                "restic_snapshot_id": point["restic_snapshot_id"],
            })

            # Preserve the running qualification VM and its image. The owner
            # explicitly requested that no running VM be stopped or deleted.
            print(f"POINT_PRESERVED={label} VM_ID={vm_id} IMAGE_ID={image_id}")

        (ROOT / "manoj-boot-results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
        print("T10_4_THREE_POINT_INDEPENDENT_BOOT=PASS")
    finally:
        # Never stop/terminate/delete any VM from this qualification path.
        # Preserve exact owned IDs so cleanup can be an explicit later action.
        if created_vms:
            print("PRESERVED_VM_IDS=" + ",".join(map(str, created_vms)))
        if created_images:
            print("PRESERVED_IMAGE_IDS=" + ",".join(map(str, created_images)))
        server.shutdown()

if __name__ == "__main__":
    main()
