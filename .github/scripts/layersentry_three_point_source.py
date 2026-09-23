#!/usr/bin/env python3
# qualification-source: disposable-networked-ssh-v1
import base64
import bz2
import csv
import hashlib
import json
import os
import pathlib
import shlex
import shutil
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

VM_ID = None
BACKUP_DS = 100
SOURCE_IMAGE_ID = 1
SOURCE_NETWORK_ID = 0
SOURCE_HOST = "rocky-02"
RUN_ID = os.environ.get("GITHUB_RUN_ID", str(os.getpid()))
SOURCE_NAME = "ls-dr-threepoint-src-" + RUN_ID
SOURCE_IP = None
RUNNER_TEMP = pathlib.Path(os.environ["RUNNER_TEMP"])
OUTDIR = RUNNER_TEMP / "three-point-portable"
OUTDIR.mkdir(parents=True, exist_ok=True)

def run(args, *, input_text=None, capture=True, check=True, stdout=None):
    return subprocess.run(
        args,
        input=input_text,
        text=True if stdout is None else False,
        capture_output=capture if stdout is None else False,
        stdout=stdout,
        stderr=subprocess.PIPE if stdout is not None else None,
        check=check,
    )

def ssh(cmd, *, input_text=None):
    p = run(["ssh", "rocky-01", cmd], input_text=input_text)
    return p.stdout

def vm_xml():
    if VM_ID is None:
        raise RuntimeError("source VM is not allocated")
    return ET.fromstring(ssh(f"onevm show {VM_ID} -x"))

def vm_state():
    return int(vm_xml().findtext("STATE"))

def wait_vm_state(wanted, timeout=180):
    end = time.time() + timeout
    while time.time() < end:
        if vm_state() == wanted:
            return
        time.sleep(2)
    raise RuntimeError(f"VM {VM_ID} did not reach state {wanted}")

def find_vm_by_name(name):
    rows = list(csv.reader(ssh("onevm list --csv --no-header").splitlines()))
    matches = []
    for row in rows:
        if len(row) >= 4 and row[3].strip() == name:
            matches.append(int(row[0]))
    if len(matches) > 1:
        raise RuntimeError(f"multiple VMs named {name}: {matches}")
    return matches[0] if matches else None

def create_source_vm():
    global VM_ID, SOURCE_IP
    existing = find_vm_by_name(SOURCE_NAME)
    if existing is not None:
        raise RuntimeError(f"refusing to reuse pre-existing disposable VM {SOURCE_NAME} id={existing}")

    template = f'''NAME="{SOURCE_NAME}"
CPU="1"
VCPU="1"
MEMORY="256"
DISK=[IMAGE_ID="{SOURCE_IMAGE_ID}"]
NIC=[NETWORK_ID="{SOURCE_NETWORK_ID}"]
CONTEXT=[
  NETWORK="YES",
  SSH_PUBLIC_KEY="$USER[SSH_PUBLIC_KEY]"
]
BACKUP_CONFIG=[
  MODE="INCREMENT",
  FS_FREEZE="NONE",
  INCREMENT_MODE="CBT",
  INTERACTIVE="NO",
  BACKUP_VOLATILE="NO",
  KEEP_LAST="3"
]
SCHED_REQUIREMENTS="NAME = \\"{SOURCE_HOST}\\""
'''
    tmpl = f"/tmp/{SOURCE_NAME}.tmpl"
    out = ssh(
        f"cat > {shlex.quote(tmpl)} && "
        f"onevm create {shlex.quote(tmpl)}; rc=$?; rm -f {shlex.quote(tmpl)}; exit $rc",
        input_text=template,
    )
    VM_ID = find_vm_by_name(SOURCE_NAME)
    if VM_ID is None:
        raise RuntimeError("source VM allocation returned no authoritative VM identity")
    print(f"SOURCE_VM_CREATED=PASS VM_ID={VM_ID} NAME={SOURCE_NAME}")

    end = time.time() + 300
    while time.time() < end:
        root = vm_xml()
        state = int(root.findtext("STATE"))
        lcm = int(root.findtext("LCM_STATE"))
        ip = (root.findtext("./TEMPLATE/NIC/IP") or "").strip()
        histories = root.findall("./HISTORY_RECORDS/HISTORY")
        host = histories[-1].findtext("HOSTNAME") if histories else ""
        if state == 3 and lcm == 3 and host == SOURCE_HOST and ip:
            SOURCE_IP = ip
            break
        if state in (6, 7):
            raise RuntimeError(f"source VM entered terminal state state={state} lcm={lcm}")
        time.sleep(2)
    if not SOURCE_IP:
        raise RuntimeError("source VM did not reach RUNNING with an allocated IP")
    print(f"SOURCE_VM_RUNNING=PASS VM_ID={VM_ID} IP={SOURCE_IP} HOST={SOURCE_HOST}")

    end = time.time() + 240
    while time.time() < end:
        cmd = (
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=no "
            "-o UserKnownHostsFile=/dev/null -o ConnectTimeout=4 "
            f"root@{shlex.quote(SOURCE_IP)} true"
        )
        try:
            ssh(cmd)
            print("SOURCE_VM_SSH=PASS")
            return
        except subprocess.CalledProcessError:
            time.sleep(3)
    raise RuntimeError(f"source VM SSH did not become ready at {SOURCE_IP}")

def guest_exec(command):
    if not SOURCE_IP:
        raise RuntimeError("source VM IP is unavailable")
    remote = (
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=no "
        "-o UserKnownHostsFile=/dev/null -o ConnectTimeout=8 "
        f"root@{shlex.quote(SOURCE_IP)} {shlex.quote(command)}"
    )
    return ssh(remote)

def write_guest_marker(marker):
    out = guest_exec(
        f"printf '%s\\n' {shlex.quote(marker)} > /etc/layersentry-dr-point && "
        "sync && cat /etc/layersentry-dr-point"
    ).strip()
    if out != marker:
        raise RuntimeError(f"guest marker write mismatch: expected {marker}, got {out!r}")
    print("GUEST_MARKER_PASS=" + marker)

def owned_backup_ids():
    if VM_ID is None:
        return []
    try:
        root = vm_xml()
    except Exception:
        return []
    out = []
    for node in root.findall("./BACKUPS/BACKUP_IDS/ID"):
        try:
            out.append(int((node.text or "").strip()))
        except ValueError:
            pass
    return sorted(set(out))

def cleanup_source():
    global VM_ID
    if VM_ID is None:
        return
    backup_ids = owned_backup_ids()
    try:
        root = vm_xml()
        state = int(root.findtext("STATE"))
        if state != 6:
            ssh(f"onevm terminate {VM_ID} --hard")
            end = time.time() + 180
            while time.time() < end:
                try:
                    if vm_state() == 6:
                        break
                except Exception:
                    break
                time.sleep(2)
        print(f"SOURCE_VM_CLEANUP_REQUESTED=PASS VM_ID={VM_ID}")
    except Exception as exc:
        print("SOURCE_VM_CLEANUP_WARNING=" + str(exc)[:300])

    for image_id in backup_ids:
        try:
            ssh(f"oneimage delete {image_id}")
            print(f"SOURCE_BACKUP_IMAGE_CLEANUP_REQUESTED=PASS IMAGE_ID={image_id}")
        except Exception as exc:
            print(f"SOURCE_BACKUP_IMAGE_CLEANUP_WARNING IMAGE_ID={image_id} ERROR={str(exc)[:200]}")

def counters():
    root = vm_xml()
    b = root.find("./BACKUPS/BACKUP_CONFIG")
    if b is None:
        return -1, -1
    return int(b.findtext("INCREMENTAL_BACKUP_ID") or -1), int(b.findtext("LAST_INCREMENT_ID") or -1)

def image_state(image_id):
    root = ET.fromstring(ssh(f"oneimage show {image_id} -x"))
    return int(root.findtext("STATE"))

def capture(label, marker, reset):
    write_guest_marker(marker)
    before_img, before_inc = counters()
    cmd = f"onevm backup {VM_ID} -d {BACKUP_DS}" + (" --reset" if reset else "")
    ssh(cmd)
    end = time.time() + 600
    while time.time() < end:
        img, inc = counters()
        changed = (reset and img != before_img and img >= 0 and inc == 0) or (
            (not reset) and img == before_img and inc > before_inc
        )
        if changed:
            state = image_state(img)
            if state == 1:
                print(f"CAPTURE_POINT_PASS={label} IMAGE={img} INCREMENT={inc}")
                return img, inc
            if state in (5, 7):
                raise RuntimeError(f"backup image {img} terminal state {state}")
        time.sleep(3)
    raise RuntimeError(f"backup point {label} timed out")

def install_restic():
    version = "0.18.1"
    d = RUNNER_TEMP / f"restic-{version}"
    d.mkdir(exist_ok=True)
    sums = d / "SHA256SUMS"
    archive = d / f"restic_{version}_linux_amd64.bz2"
    binary = d / f"restic_{version}_linux_amd64"
    urllib.request.urlretrieve(f"https://github.com/restic/restic/releases/download/v{version}/SHA256SUMS", sums)
    urllib.request.urlretrieve(f"https://github.com/restic/restic/releases/download/v{version}/{archive.name}", archive)
    expected = None
    for line in sums.read_text().splitlines():
        if line.endswith(" " + archive.name):
            expected = line.split()[0]
            break
    if not expected:
        raise RuntimeError("restic checksum missing")
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError("restic checksum mismatch")
    binary.write_bytes(bz2.decompress(archive.read_bytes()))
    binary.chmod(0o755)
    print(run([str(binary), "version"]).stdout.strip())
    return binary

def copy_repo():
    archive = RUNNER_TEMP / f"vm{VM_ID}-three-point-restic.tar.gz"
    with archive.open("wb") as out:
        p = subprocess.run(
            ["ssh", "rocky-01", f"ssh rocky-03 'tar -C /var/lib/one/datastores/100 -czf - {VM_ID}'"],
            stdout=out,
            stderr=subprocess.PIPE,
        )
    if p.returncode != 0 or archive.stat().st_size == 0:
        raise RuntimeError("failed to copy Restic repository: " + p.stderr.decode("utf-8", "replace")[:300])
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (RUNNER_TEMP / f"vm{VM_ID}-three-point-restic.tar.gz.sha256").write_text(digest + "  " + archive.name + "\n")
    copied = RUNNER_TEMP / "recovery-copy"
    shutil.rmtree(copied, ignore_errors=True)
    copied.mkdir()
    run(["tar", "-xzf", str(archive), "-C", str(copied)])
    return archive, digest, copied / str(VM_ID)

def datastore_password_file():
    root = ET.fromstring(ssh("onedatastore show 100 --decrypt -x"))
    secret = root.findtext("./TEMPLATE/RESTIC_PASSWORD")
    if not secret:
        raise RuntimeError("RESTIC_PASSWORD missing")
    path = RUNNER_TEMP / "restic-password"
    path.write_text(secret)
    path.chmod(0o600)
    return path

def verify_portable_marker(disk, expected):
    dev = "/dev/nbd15"
    mnt = RUNNER_TEMP / "nbd-mnt"
    mnt.mkdir(exist_ok=True)
    run(["sudo", "modprobe", "nbd", "max_part=8"])
    pid = pathlib.Path("/sys/block/nbd15/pid")
    if pid.exists() and pid.read_text().strip():
        raise RuntimeError("/dev/nbd15 already in use")
    run(["sudo", "qemu-nbd", "--connect=" + dev, str(disk)])
    mounted = False
    try:
        time.sleep(1)
        run(["sudo", "mount", dev, str(mnt)])
        mounted = True
        actual = run(["sudo", "cat", str(mnt / "etc/layersentry-dr-point")]).stdout.strip()
        if actual != expected:
            raise RuntimeError(f"marker mismatch: expected {expected}, got {actual}")
        run(["sudo", "sync"])
    finally:
        if mounted:
            subprocess.run(["sudo", "umount", str(mnt)], check=False)
        subprocess.run(["sudo", "qemu-nbd", "--disconnect", dev], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("OFFLINE_MARKER_PASS=" + expected)

def main():
    restic = install_restic()
    try:
        create_source_vm()
        points = []
        image_id, inc = capture("BASELINE", "LS-DR-BASELINE-20260924", True)
        points.append(("BASELINE", "LS-DR-BASELINE-20260924", image_id, inc))
        image2, inc = capture("MIDDLE", "LS-DR-MIDDLE-20260924", False)
        points.append(("MIDDLE", "LS-DR-MIDDLE-20260924", image2, inc))
        image3, inc = capture("LATEST", "LS-DR-LATEST-20260924", False)
        points.append(("LATEST", "LS-DR-LATEST-20260924", image3, inc))
        if len({p[2] for p in points}) != 1 or [p[3] for p in points] != [0, 1, 2]:
            raise RuntimeError("unexpected OpenNebula three-point identity")
        backup_image_id = points[0][2]
        backup_xml = ET.fromstring(ssh(f"oneimage show {backup_image_id} -x"))
        incs = backup_xml.findall("./BACKUP_INCREMENTS/INCREMENT")
        chain = [(int(x.findtext("ID")), x.findtext("TYPE"), x.findtext("SOURCE")) for x in incs]
        print("OPENNEBULA_INCREMENT_CHAIN=" + repr(chain))
        if [x[0] for x in chain] != [0, 1, 2] or chain[0][1] != "FULL" or any(x[1] != "INCREMENT" for x in chain[1:]):
            raise RuntimeError("unexpected OpenNebula increment chain")
        print("OPENNEBULA_THREE_POINT_CHAIN=PASS")

        archive, archive_digest, repo = copy_repo()
        passfile = datastore_password_file()
        run([str(restic), "--repo", str(repo), "--password-file", str(passfile), "check"], capture=False)
        snapshots = json.loads(run([str(restic), "--repo", str(repo), "--password-file", str(passfile), "snapshots", "--json"]).stdout)
        expected = {p[3]: (p[0], p[1]) for p in points}
        mapped = []
        for iid, typ, selector in chain:
            label, marker = expected[iid]
            matches = [s for s in snapshots if s.get("id", "").startswith(selector)]
            if len(matches) != 1:
                raise RuntimeError(f"selector {selector} matched {len(matches)} snapshots")
            s = matches[0]
            mapped.append((iid, label, marker, s["id"], s["tree"], selector))
            print(f"RESTIC_POINT_MAP={label} INCREMENT={iid} SNAPSHOT={s['id']} TREE={s['tree']}")
        print("RESTIC_THREE_POINT_MAPPING=PASS")

        portable = []
        for iid, label, marker, snapshot, tree, selector in mapped:
            restore = RUNNER_TEMP / ("restore-" + label.lower())
            shutil.rmtree(restore, ignore_errors=True)
            restore.mkdir()
            run([str(restic), "--repo", str(repo), "--password-file", str(passfile), "restore", snapshot, "--target", str(restore)], capture=False)
            candidate = None
            for path in restore.rglob("*"):
                if not path.is_file() or path.stat().st_size < 1024 * 1024:
                    continue
                q = subprocess.run(["qemu-img", "info", "--output=json", str(path)], capture_output=True, text=True)
                if q.returncode == 0 and json.loads(q.stdout).get("format") == "qcow2":
                    candidate = path
                    break
            if candidate is None:
                raise RuntimeError("qcow2 not found for " + label)
            disk = OUTDIR / (label.lower() + ".qcow2")
            run(["qemu-img", "convert", "-c", "-O", "qcow2", str(candidate), str(disk)], capture=False)
            verify_portable_marker(disk, marker)
            run(["qemu-img", "check", str(disk)], capture=False)
            digest = hashlib.sha256(disk.read_bytes()).hexdigest()
            (disk.with_suffix(".qcow2.sha256")).write_text(digest + "  " + disk.name + "\n")
            portable.append({
                "increment_id": iid,
                "label": label,
                "expected_marker": marker,
                "restic_snapshot_id": snapshot,
                "restic_tree_id": tree,
                "disk_sha256": digest,
                "disk_size_bytes": disk.stat().st_size,
                "disk_file": disk.name,
            })

        passfile.unlink(missing_ok=True)
        manifest = {
            "qualification": "T10.4-three-point-independent-dr",
            "source_vm_name": SOURCE_NAME,
            "source_vm_owned_by_qualification": True,
            "source_site": "tester",
            "recovery_site": "manoj",
            "source_vm_id": VM_ID,
            "backup_image_id": backup_image_id,
            "keep_last": 3,
            "restic_copy_sha256": archive_digest,
            "points": portable,
        }
        (OUTDIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print("THREE_POINT_PORTABLE_MANIFEST=PASS")
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
            f.write("PORTABLE_DIR=" + str(OUTDIR) + "\n")
    finally:
        cleanup_source()

if __name__ == "__main__":
    main()
