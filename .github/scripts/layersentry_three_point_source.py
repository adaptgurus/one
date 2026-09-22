#!/usr/bin/env python3
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

VM_ID = 220
BACKUP_DS = 100
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

def ensure_running():
    try:
        state = vm_state()
        if state in (4, 5, 8, 9):
            ssh(f"onevm resume {VM_ID}")
            wait_vm_state(3, 180)
    except Exception as exc:
        print("SOURCE_VM_RECOVERY_WARNING=" + str(exc)[:300])

def qga_fix():
    config = '''FEATURES=[GUEST_AGENT="YES",ACPI="YES"]
BACKUP_CONFIG=[MODE="INCREMENT",FS_FREEZE="NONE",INCREMENT_MODE="CBT",BACKUP_VOLATILE="NO",KEEP_LAST="3"]
'''
    ssh(f"onevm updateconf {VM_ID}", input_text=config)
    if vm_state() != 3:
        ensure_running()
    ssh(f"onevm poweroff {VM_ID} --hard")
    wait_vm_state(8, 180)
    remote = r'''set -euo pipefail
dev=/dev/nbd15
mnt=/mnt/ls-vm220-qga-fix
connected=0
cleanup() {
  set +e
  mountpoint -q "$mnt" && umount "$mnt"
  [ "$connected" = 1 ] && qemu-nbd --disconnect "$dev" >/dev/null 2>&1
  rmdir "$mnt" >/dev/null 2>&1 || true
}
trap cleanup EXIT
modprobe nbd max_part=8
if [ -s /sys/block/nbd15/pid ]; then
  echo "/dev/nbd15 is already in use" >&2
  exit 1
fi
mkdir -p "$mnt"
qemu-nbd --connect="$dev" /var/lib/one/datastores/0/220/disk.0
connected=1
sleep 1
mount "$dev" "$mnt"
mkdir -p "$mnt/etc/local.d" "$mnt/etc/runlevels/default"
cat > "$mnt/etc/local.d/layersentry-qga-retry.start" <<'SCRIPT'
#!/bin/sh
i=0
while [ "$i" -lt 30 ]; do
  if [ -e /dev/virtio-ports/org.qemu.guest_agent.0 ]; then
    rc-service qemu-guest-agent restart >/dev/null 2>&1 && exit 0
  fi
  i=$((i+1))
  sleep 1
done
exit 0
SCRIPT
chmod 0755 "$mnt/etc/local.d/layersentry-qga-retry.start"
ln -sfn /etc/init.d/local "$mnt/etc/runlevels/default/local"
sync
'''
    ssh("ssh rocky-02 'sudo bash -s'", input_text=remote)
    ssh(f"onevm resume {VM_ID}")
    wait_vm_state(3, 180)
    ping_cmd = "ssh rocky-02 \"sudo virsh qemu-agent-command one-220 '{\\\"execute\\\":\\\"guest-ping\\\"}'\""
    end = time.time() + 120
    while time.time() < end:
        try:
            if "{}" in ssh(ping_cmd):
                print("VM220_QGA_CONNECTED=PASS")
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("qemu-ga did not connect after boot-time retry")

def qga_exec(command, expected):
    remote = f"onevm exec {VM_ID} {shlex.quote(command)}"
    ssh(remote)
    end = time.time() + 120
    last = None
    while time.time() < end:
        root = vm_xml()
        q = root.find("./TEMPLATE/QEMU_GA_EXEC")
        if q is not None:
            status = (q.findtext("STATUS") or "").strip()
            last = q
            if status in ("DONE", "ERROR", "CANCELLED"):
                rc = (q.findtext("RETURN_CODE") or "").strip()
                raw = (q.findtext("STDOUT") or "").strip()
                out = base64.b64decode(raw).decode("utf-8", "replace") if raw else ""
                if status != "DONE" or rc != "0" or expected not in out:
                    raise RuntimeError(f"guest exec failed status={status} rc={rc} output={out[:200]!r}")
                print("GUEST_MARKER_PASS=" + expected)
                return
        time.sleep(2)
    raise RuntimeError("guest exec timed out")

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
    qga_exec(f"printf '{marker}\\n' > /etc/layersentry-dr-point && sync && cat /etc/layersentry-dr-point", marker)
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
    archive = RUNNER_TEMP / "vm220-three-point-restic.tar.gz"
    with archive.open("wb") as out:
        p = subprocess.run(
            ["ssh", "rocky-01", "ssh rocky-03 'tar -C /var/lib/one/datastores/100 -czf - 220'"],
            stdout=out,
            stderr=subprocess.PIPE,
        )
    if p.returncode != 0 or archive.stat().st_size == 0:
        raise RuntimeError("failed to copy Restic repository: " + p.stderr.decode("utf-8", "replace")[:300])
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (RUNNER_TEMP / "vm220-three-point-restic.tar.gz.sha256").write_text(digest + "  " + archive.name + "\n")
    copied = RUNNER_TEMP / "recovery-copy"
    shutil.rmtree(copied, ignore_errors=True)
    copied.mkdir()
    run(["tar", "-xzf", str(archive), "-C", str(copied)])
    return archive, digest, copied / "220"

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
        qga_fix()
        points = []
        image_id, inc = capture("BASELINE", "LS-DR-BASELINE-20260923", True)
        points.append(("BASELINE", "LS-DR-BASELINE-20260923", image_id, inc))
        image2, inc = capture("MIDDLE", "LS-DR-MIDDLE-20260923", False)
        points.append(("MIDDLE", "LS-DR-MIDDLE-20260923", image2, inc))
        image3, inc = capture("LATEST", "LS-DR-LATEST-20260923", False)
        points.append(("LATEST", "LS-DR-LATEST-20260923", image3, inc))
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
        ensure_running()

if __name__ == "__main__":
    main()
