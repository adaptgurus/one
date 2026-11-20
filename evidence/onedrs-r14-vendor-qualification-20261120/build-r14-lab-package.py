#!/usr/bin/python3
"""Build R14 from the exact verified R13 vendor payload; no signing/install."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import rpm
import shutil
import stat
import subprocess

E = Path("/root/ls-onedrs-r14-native-evidence-20261120")
C = Path("/root/onedrs-source06dc1aaa-r13-package-20261115")
SOURCE = Path("/root/ls-onedrs-ci-portable-20261120")
OUT = Path("/root/ls-onedrs-source5995c42b-r14-package-20261120")
T, B = OUT / "rpmbuild", OUT / "payload"
COMMIT = "5995c42b8a0fb17ad959e5eb6af2d9e6da0f4037"
RELEASE = "14.ls.onedrs.5995c42b.lab.el9"

def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(4194304), b""):
            h.update(chunk)
    return h.hexdigest()

def build_id(path):
    text = subprocess.check_output(["readelf", "-n", str(path)], text=True, timeout=20)
    match = re.search(r"Build ID: ([0-9a-f]+)", text)
    if not match:
        raise RuntimeError("ELF build ID missing")
    return match.group(1)

built = json.loads((E / "build-result.json").read_text())
custody = json.loads((E / "source-custody-result.json").read_text())
original = json.loads((C / "receipt.json").read_text())
P = Path(original["rpm"])
if OUT.exists() or built["status"] != "BUILD_PASS" or custody["result"] != "PASS":
    raise RuntimeError("Unique path and verified native build/custody required")
if built["reviewed_source_commit"] != COMMIT or sha(P) != original["rpm_sha256"]:
    raise RuntimeError("Build source or R13 baseline artifact mismatch")
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE, text=True).strip()
if head != COMMIT:
    raise RuntimeError("Reviewed source checkout identity changed")
with P.open("rb") as stream:
    old = rpm.TransactionSet().hdrFromFdno(stream.fileno())
if old["release"] != "13.ls.onedrs.06dc1aaa.lab.el9":
    raise RuntimeError("Wrong baseline release")
verified = 0
for name, mode, flags, digest in zip(old["filenames"], old["filemodes"], old["fileflags"], old["filedigests"]):
    if flags & 64:
        continue
    if stat.S_ISREG(mode) and digest:
        if sha(C / "payload" / name.lstrip("/")) != digest:
            raise RuntimeError("Baseline payload changed: " + name)
        verified += 1
OUT.mkdir(mode=0o700)
for name in ["BUILD", "BUILDROOT", "RPMS", "SOURCES", "SPECS", "SRPMS"]:
    (T / name).mkdir(parents=True)
subprocess.run(["cp", "-a", "--reflink=auto", str(C / "payload"), str(B)], check=True)
spec_text = (C / "rpmbuild/SPECS/opennebula-r13-native-shutdown-lab.spec").read_text()
spec_text = spec_text.replace("Release: " + old["release"], "Release: " + RELEASE)
spec_text = spec_text.replace(str(C / "payload"), str(B))
spec_text = spec_text.replace("source06dc1aaa native-shutdown LAB CANDIDATE",
                              "source5995c42b checked-API LAB CANDIDATE")
spec_text = spec_text.replace(
    "vendor7.4.1 controller+monitor rebuild with reviewed native patch 06dc1aaac0bce10d2cf06c56d9dd1f71e29d2054 and retained OneDRS scheduler271b6c3.",
    "preserved vendor7.4.1 controller/monitor, reviewed native authorization and atomic plan/policy API patch " +
    COMMIT + ", matching OneDRS policy identity serializer, and retained security deploy driver.")
changes = []
for artifact, installed in zip(built["artifacts"], ["usr/bin/oned", "usr/lib/one/mads/onemonitord"]):
    candidate, target = Path(artifact["path"]), B / installed
    if sha(candidate) != artifact["sha256"]:
        raise RuntimeError("Rebuilt binary changed")
    old_sha, old_id, new_id = sha(target), build_id(target), build_id(candidate)
    if old_id == new_id or old_sha == artifact["sha256"]:
        raise RuntimeError("Binary was not rebuilt")
    old_link = Path("usr/lib/.build-id") / old_id[:2] / old_id[2:]
    new_link = Path("usr/lib/.build-id") / new_id[:2] / new_id[2:]
    previous, replacement = B / old_link, B / new_link
    if not previous.is_symlink():
        raise RuntimeError("Original ELF debug-link missing")
    link_target = os.readlink(previous)
    previous.unlink()
    replacement.parent.mkdir(exist_ok=True)
    replacement.symlink_to(link_target)
    a, b = '"/' + str(old_link) + '"', '"/' + str(new_link) + '"'
    if spec_text.count(a) != 1:
        raise RuntimeError("Original ELF debug-link not unique in spec")
    spec_text = spec_text.replace(a, b)
    if not any(previous.parent.iterdir()):
        previous.parent.rmdir()
        quote = '"/' + str(old_link.parent) + '"'
        spec_text = "\n".join(line for line in spec_text.splitlines() if quote not in line) + "\n"
    quote = '"/' + str(new_link.parent) + '"'
    if quote not in spec_text:
        spec_text = spec_text.replace("%files\n", "%files\n%dir %artifact %attr(0755,root,root) " + quote + "\n", 1)
    shutil.copy2(candidate, target)
    target.chmod(0o755)
    changes.append({"path":"/" + installed, "baseline_sha256":old_sha,
                    "rebuilt_sha256":sha(target), "old_build_id":old_id, "new_build_id":new_id})

scheduler = SOURCE / "src/schedm_mad/remotes/one_drs"
for relative in ["optimize", "lib/optimizer_parser.py", "lib/optimizer_serializer.py",
                 "lib/models/cluster.py", "lib/models/plan.py"]:
    target = B / "var/lib/one/remotes/scheduler/one_drs" / relative
    baseline = target.read_bytes()
    content = (scheduler / relative).read_bytes()
    transform = None
    if relative == "optimize":
        if not baseline.startswith(b"#!/usr/bin/python3.12\n") or not content.startswith(b"#!/usr/bin/env python3\n"):
            raise RuntimeError("Unexpected scheduler interpreter contract")
        content = content.replace(b"#!/usr/bin/env python3\n", b"#!/usr/bin/python3.12\n", 1)
        transform = "preserved R13 explicit packaged /usr/bin/python3.12 shebang"
    target.write_bytes(content)
    changes.append({"path":"/" + str(target.relative_to(B)),
                    "baseline_sha256":hashlib.sha256(baseline).hexdigest(),
                    "rebuilt_sha256":sha(target), "source_sha256":sha(scheduler / relative),
                    "packaging_transform":transform})
for name in ["cluster.xsd", "plan.xsd"]:
    relative = "share/doc/xsd/" + name
    target = B / "usr/share/one/schemas/xsd" / name
    prior = subprocess.check_output(["git", "show", "33ef640bab515aadc06f57131c3c22741d373642:" + relative], cwd=SOURCE)
    if target.read_bytes() != prior:
        raise RuntimeError("Vendor XSD differs from reviewed patch base")
    old_sha = sha(target)
    shutil.copy2(SOURCE / relative, target)
    changes.append({"path":"/" + str(target.relative_to(B)), "baseline_sha256":old_sha,
                    "rebuilt_sha256":sha(target), "source_sha256":sha(SOURCE / relative)})
driver_path = B / "var/lib/one/remotes/vmm/kvm/deploy"
if sha(driver_path) != "3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b":
    raise RuntimeError("Security deploy driver changed")
spec = T / "SPECS/opennebula-r14-checked-api-lab.spec"
spec.write_text(spec_text)
record = {"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(), "source_sha":COMMIT,
          "source_composition":"Exact R13 vendor7.4.1 source manifest plus reviewed native authorization/CAS API and Python policy identity delta",
          "native_build_receipt_sha256":sha(E/"build-result.json"),
          "native_source_manifest_sha256":sha(E/"vendor-source-manifest.json"),
          "source_custody_receipt_sha256":sha(E/"source-custody-result.json"),
          "r13_baseline_sha256":sha(P), "verified_baseline_files":verified,
          "payload_changes":changes, "security_deploy_driver_sha256":sha(driver_path),
          "signature":"NONE", "production_certified":False, "verdict":"BUILD_IN_PROGRESS"}
(OUT / "receipt.json").write_text(json.dumps(record, indent=2) + "\n")
with (OUT / "rpmbuild.log").open("x") as log:
    process = subprocess.run(["rpmbuild", "-bb", "--define", "_topdir " + str(T),
                              "--define", "_buildhost layersentry-onserver-qualification", str(spec)],
                             stdout=log, stderr=subprocess.STDOUT, timeout=240)
record["build_exit"] = process.returncode
if process.returncode:
    record["verdict"] = "BUILD_FAIL"
    (OUT / "receipt.json").write_text(json.dumps(record, indent=2) + "\n")
    print((OUT / "rpmbuild.log").read_text()[-4000:])
    raise SystemExit(process.returncode)
packages = list((T / "RPMS/x86_64").glob("*.rpm"))
if len(packages) != 1:
    raise RuntimeError("Ambiguous RPM output")
package = packages[0]
with package.open("rb") as stream:
    new = rpm.TransactionSet().hdrFromFdno(stream.fileno())
manifest = dict(zip(new["filenames"], new["filedigests"]))
for item in changes:
    if manifest[item["path"]] != item["rebuilt_sha256"]:
        raise RuntimeError("New payload digest mismatch: " + item["path"])
for tag in ["prein","postin","preun","postun","posttrans","triggerscripts"]:
    if new[tag] != old[tag]:
        raise RuntimeError("Lifecycle script changed: " + tag)
for tag in ["requirename","requireflags","providename","provideflags","obsoletename","obsoleteversion","obsoleteflags"]:
    if list(new[tag]) != list(old[tag]):
        raise RuntimeError("Dependency contract changed: " + tag)
for old_v, new_v in zip(old["requireversion"], new["requireversion"]):
    if old_v != new_v and new_v != old_v.replace(old["release"], RELEASE):
        raise RuntimeError("Unexpected requirement version change")
# Every retained file keeps original modes, flags and ownership.
old_attrs = dict(zip(old["filenames"], zip(old["filemodes"],old["fileflags"],old["fileusername"],old["filegroupname"])))
for name, attrs in zip(new["filenames"], zip(new["filemodes"],new["fileflags"],new["fileusername"],new["filegroupname"])):
    if name in old_attrs and attrs != old_attrs[name]:
        raise RuntimeError("File metadata contract changed: " + name)
record.update({"verdict":"PASS_R14_VENDOR_CHECKED_API_PACKAGE_INTEGRITY",
               "rpm":str(package), "rpm_sha256":sha(package), "rpm_bytes":package.stat().st_size,
               "nevra":f"{new['name']}-{new['version']}-{new['release']}.{new['arch']}",
               "all_changed_payload_digests_verified":True, "original_scriptlets_retained":True,
               "dependency_contract_retained":True, "retained_file_metadata_unchanged":True})
(OUT / "receipt.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({k:v for k,v in record.items() if k != "payload_changes"}, indent=2), flush=True)
