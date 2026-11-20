#!/usr/bin/python3
"""Build and audit the matched native server/library RPMs without installing them.

Inputs are immutable Git blobs, explicitly hashed vendor/baseline RPMs, a native
build receipt, and the previously verified wheel closure.  This is packaging
integrity evidence, never runtime qualification or permission to deploy.
"""
from __future__ import annotations

import argparse
from collections import Counter
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys


LIBS_VENDOR_SHA = "d785f97ab0bf4b8dbb2015556f6910aa1e9ee1010d973c57ade95ef9ad278457"
BASELINE_SHA = "3e2f14229ee5a1687eb8bc6948cf8fbeb92d6dc446279a1fb9ffb0b26eecefbe"
BASELINE_RELEASE = "14.ls.onedrs.5995c42b.lab.el9"
PYTHON_MANIFEST_SHA = "bf2054ef545ef9496d7c6b439ab89afb53940eae2e9d0a2484b3ef5d60f1eb32"
SECURITY_DRIVER_SHA = "3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b"
PYTHON_ROOT = "/usr/lib/one/python"
SCHEDULER_ROOT = "/var/lib/one/remotes/scheduler/one_drs"
SCHEMA_ROOT = "/usr/share/one/schemas/xsd"
SCRIPT_TAGS = (
    "prein", "preinprog", "postin", "postinprog", "preun", "preunprog",
    "postun", "postunprog", "pretrans", "pretransprog", "posttrans", "posttransprog",
    "triggerscripts", "triggerscriptprog", "triggername", "triggerversion",
    "triggerflags", "triggerindex",
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=kwargs.pop("timeout", 60), **kwargs)


def output(args, **kwargs):
    return subprocess.check_output(args, text=True, timeout=60, **kwargs)


def safe_path(value):
    path = PurePosixPath(value)
    require(path.is_absolute() and ".." not in path.parts and "\\" not in value
            and not any(c in value for c in ('\n', '\r', '"', '%')),
            "Unsafe RPM path: " + value)
    return value


def header(path):
    import rpm
    with Path(path).open("rb") as stream:
        return rpm.TransactionSet().hdrFromFdno(stream.fileno())


def attrs(hdr):
    result = {}
    for values in zip(hdr["filenames"], hdr["filemodes"], hdr["fileflags"],
                      hdr["fileusername"], hdr["filegroupname"], hdr["filedigests"],
                      hdr["filelinktos"], hdr["fileverifyflags"]):
        name, mode, flags, user, group, digest, link, verify = values
        safe_path(name)
        require(name not in result, "Duplicate RPM entry: " + name)
        result[name] = dict(mode=mode, flags=flags, user=user, group=group,
                            digest=digest, link=link, verify=verify)
    return result


def verify_tree(tree, metadata):
    verified = 0
    for name, item in metadata.items():
        if item["flags"] & 64:
            continue
        path = tree / name.lstrip("/")
        require(path.exists() or path.is_symlink(), "Payload entry missing: " + name)
        current = path.lstat()
        require(stat.S_IFMT(current.st_mode) == stat.S_IFMT(item["mode"]),
                "Payload type differs: " + name)
        if stat.S_ISREG(item["mode"]):
            require(sha(path) == item["digest"], "Payload digest differs: " + name)
            verified += 1
        elif stat.S_ISLNK(item["mode"]):
            require(os.readlink(path) == item["link"], "Payload link differs: " + name)
        else:
            require(stat.S_ISDIR(item["mode"]), "Unsupported payload special file: " + name)
    return verified


def extract(package, destination, hdr):
    """Extract a validated package into a fresh, private staging directory."""
    metadata = attrs(hdr)
    destination.mkdir(mode=0o700, exist_ok=False)
    archive = destination.parent / (destination.name + ".cpio")
    with archive.open("xb") as stream:
        run(["rpm2cpio", str(package)], stdout=stream)
    with archive.open("rb") as stream:
        run(["cpio", "-idm", "--quiet", "--no-absolute-filenames"],
            cwd=destination, stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    archive.unlink()
    return verify_tree(destination, metadata)


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], timeout=60)


def runtime_module(repo, commit, destination):
    # Read the manifest implementation from the same immutable commit as inputs.
    code = git(repo, "show", commit + ":tools/onedrs_qualification/native_runtime_manifest.py")
    path = destination / "native_runtime_manifest.py"
    path.write_bytes(code)
    spec = importlib.util.spec_from_file_location("frozen_native_runtime_manifest", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    files = module.runtime_files(module.source_blobs(repo, commit))
    manifest = module.manifest(commit, files)
    module.stage(destination / "source-overlay", manifest, files)
    return module, files, manifest


def new_attrs(mode, user="root", group="root", flags=0):
    return dict(mode=mode, flags=flags, user=user, group=group,
                digest="", link="", verify=4294967295)


def add_parents(metadata, name, boundary, mode=0o755, user="root", group="root"):
    parent = PurePosixPath(name).parent
    stop = PurePosixPath(boundary)
    require(parent == stop or stop in parent.parents, "Parent boundary differs")
    while True:
        metadata.setdefault(str(parent), new_attrs(stat.S_IFDIR | mode, user, group))
        if parent == stop:
            break
        parent = parent.parent


def file_lines(metadata):
    lines = []
    for name, item in sorted(metadata.items()):
        safe_path(name)
        flags = item["flags"]
        require(flags & ~(1 | 2 | 8 | 16 | 64 | 128 | 256 | 4096) == 0,
                "Unsupported RPM flags: " + name)
        require(item["verify"] == 4294967295 or
                (item["verify"] == 4294967256 and flags & 64),
                "Custom verification flags must be modelled: " + name)
        directives = []
        if stat.S_ISDIR(item["mode"]):
            directives.append("%dir")
        if flags & 1 or flags & 16 and stat.S_ISDIR(item["mode"]):
            directives.append("%config(noreplace)" if flags & 16 else "%config")
        else:
            require(not flags & 16, "noreplace without config: " + name)
        for flag, word in ((2, "%doc"), (8, "%missingok"), (64, "%ghost"),
                           (128, "%license"), (256, "%readme"), (4096, "%artifact")):
            if flags & flag:
                directives.append(word)
        if item["verify"] == 4294967256:
            directives.append("%verify(not md5 size mtime)")
        directives.append("%%attr(%04o,%s,%s)" % (
            stat.S_IMODE(item["mode"]), item["user"], item["group"]))
        # Percent is already an RPM directive, not a Python formatting token.
        lines.append(" ".join(directives) + ' "' + name + '"')
    return "\n".join(lines) + "\n"


def normalized_dependencies(hdr, prefix, old_release=None, new_release=None):
    """Compare dependency semantics, excluding only automatic-discovery provenance."""
    ignored = 16384 | 32768  # FIND_REQUIRES / FIND_PROVIDES, not runtime semantics.
    result = []
    for name, version, flags in zip(hdr[prefix + "name"], hdr[prefix + "version"],
                                     hdr[prefix + "flags"]):
        if old_release and new_release:
            version = version.replace(old_release, new_release)
        result.append((name, version, flags & ~ignored))
    return Counter(result)


def libs_spec(hdr, metadata, payload, release):
    require(hdr["name"] == "opennebula-libs" and hdr["version"] == "7.4.1"
            and hdr["release"] == "1.el9" and hdr["arch"] == "noarch",
            "Wrong signed vendor library identity")
    require(not hdr["triggerscripts"], "Unexpected library triggers")
    lines = ["%global debug_package %{nil}", "%global _build_id_links none",
             "%global __os_install_post %{nil}", "%global _binary_payload w3.zstdio",
             "Name: opennebula-libs", "Version: 7.4.1", "Release: " + release,
             "Summary: OpenNebula libraries with correlated native driver replies",
             "License: Apache", "URL: https://opennebula.io", "BuildArch: noarch",
             "Packager: LayerSentry Lab Qualification", "AutoReqProv: no"]
    operators = {0: "", 2: "<", 4: ">", 8: "=", 10: "<=", 12: ">="}
    for prefix, label in (("require", "Requires"), ("obsolete", "Obsoletes"),
                          ("conflict", "Conflicts")):
        for name, version, flags in zip(hdr[prefix + "name"], hdr[prefix + "version"],
                                         hdr[prefix + "flags"]):
            if name.startswith("rpmlib("):
                continue
            # Script interpreters are recreated by the retained script sections.
            if flags & 256:
                continue
            require(flags & ~(2 | 4 | 8 | 16384) == 0,
                    "Unsupported library dependency qualifier: " + name)
            op = operators.get(flags & 14)
            require(op is not None, "Unsupported version comparison")
            lines.append(label + ": " + name + ((" " + op + " " + version) if version else ""))
    lines += ["", "%description",
              "Matched native request context library. Package integrity alone is not release qualification.",
              "", "%prep", "", "%build", "", "%install",
              "mkdir -p %{buildroot}", "cp -a " + str(payload) + "/. %{buildroot}/",
              "", "%files", file_lines(metadata)]
    for tag, section in (("prein", "pre"), ("postin", "post"), ("preun", "preun"),
                          ("postun", "postun"), ("pretrans", "pretrans"), ("posttrans", "posttrans")):
        if hdr[tag] is None:
            continue
        programs = hdr[tag + "prog"]
        require(programs == ["/bin/sh"], "Unexpected vendor script interpreter")
        lines += ["%" + section + " -p /bin/sh", hdr[tag].replace("%", "%%"), ""]
    return "\n".join(lines) + "\n"


def build_id(path):
    match = re.search(r"Build ID: ([0-9a-f]+)", output(["readelf", "-n", str(path)]))
    require(match is not None, "ELF build ID missing")
    return match.group(1)


def native_artifacts(args, metadata, payload, receipt):
    built = json.loads(args.native_build_receipt.read_text())
    require(built.get("status") == "BUILD_PASS" or
            (built.get("schema") == "onedrs.native-build/v1" and
             built.get("status") == "PASS" and built.get("exit_code") == 0),
            "Native build did not pass")
    build_commit = (built.get("reviewed_source_commit") or built.get("source_commit")
                    or built.get("source_head"))
    require(isinstance(build_commit, str) and re.fullmatch(r"[0-9a-f]{40}", build_commit),
            "Build receipt lacks exact native source commit")
    require(not git(args.repo, "diff", "--name-only", build_commit, args.commit,
                    "--", "src", "include", "share", "SConstruct"),
            "Native build and final source inputs differ")
    artifacts = built.get("artifacts", [])
    if isinstance(artifacts, dict):
        keys = ("src/nebula/oned", "src/monitor/src/monitor/onemonitord")
        require(set(artifacts) == set(keys), "Unexpected native build outputs")
        artifacts = [dict(artifacts[key], path=str(Path(built["build_tree"]) / key))
                     for key in keys]
    require(len(artifacts) == 2, "Exact controller and monitor build required")
    changes = []
    for artifact, installed in zip(artifacts, ("/usr/bin/oned", "/usr/lib/one/mads/onemonitord")):
        source = Path(artifact["path"])
        require(source.name == Path(installed).name and sha(source) == artifact["sha256"],
                "Native artifact identity differs")
        target = payload / installed.lstrip("/")
        old_id, new_id = build_id(target), build_id(source)
        old_link = "/usr/lib/.build-id/" + old_id[:2] + "/" + old_id[2:]
        new_link = "/usr/lib/.build-id/" + new_id[:2] + "/" + new_id[2:]
        previous = payload / old_link.lstrip("/")
        require(old_link in metadata and previous.is_symlink(), "Original ELF link missing")
        link_target = os.readlink(previous)
        if old_link != new_link:
            replacement = payload / new_link.lstrip("/")
            require(not replacement.exists() and not replacement.is_symlink(), "ELF link collision")
            replacement.parent.mkdir(parents=True, exist_ok=True)
            replacement.symlink_to(link_target)
            previous.unlink()
            metadata[new_link] = metadata.pop(old_link)
            parent = str(PurePosixPath(new_link).parent)
            metadata.setdefault(parent, new_attrs(stat.S_IFDIR | 0o755, flags=4096))
            if not any(previous.parent.iterdir()):
                previous.parent.rmdir()
                metadata.pop(str(PurePosixPath(old_link).parent), None)
        before = sha(target)
        shutil.copy2(source, target)
        target.chmod(0o755)
        changes.append(dict(path=installed, before_sha256=before, sha256=sha(target),
                            old_build_id=old_id, new_build_id=new_id))
    receipt["native_build"] = dict(receipt_sha256=sha(args.native_build_receipt),
                                    build_source_commit=build_commit, artifacts=changes)


def replace_python(closure, payload, metadata):
    manifest = closure / "payload-files.json"
    files = json.loads(manifest.read_text())
    canonical_sha = hashlib.sha256(json.dumps(files, sort_keys=True,
                                             separators=(",", ":")).encode()).hexdigest()
    require(canonical_sha == PYTHON_MANIFEST_SHA, "Python closure canonical manifest differs")
    source = closure / "python"
    expected = {item["path"]: item for item in files}
    actual = {str(p.relative_to(source)) for p in source.rglob("*") if p.is_file()}
    require(set(expected) <= actual, "Python closure contains missing files")
    generated_bytecode = sorted(actual - set(expected))
    for relative in generated_bytecode:
        path = PurePosixPath(relative)
        match = re.fullmatch(r"(.+)\.cpython-312\.pyc", path.name)
        original = path.parent.parent / (match.group(1) + ".py") if match else None
        require(path.parent.name == "__pycache__" and original is not None and
                str(original) in expected, "Unrecognized Python closure file: " + relative)
    require(all(not p.is_symlink() for p in source.rglob("*")), "Python closure symlink")
    for relative, item in expected.items():
        safe_path("/" + relative)
        require(sha(source / relative) == item["sha256"], "Python closure changed: " + relative)
    target = payload / PYTHON_ROOT.lstrip("/")
    shutil.rmtree(target)
    for name in list(metadata):
        if name == PYTHON_ROOT or name.startswith(PYTHON_ROOT + "/"):
            del metadata[name]
    target.mkdir(parents=True)
    for relative, item in expected.items():
        name = PYTHON_ROOT + "/" + relative
        destination = payload / name.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, destination)
        require(sha(destination) == item["sha256"], "Copied Python closure differs: " + relative)
        mode = 0o755 if int(item["mode"], 8) & 0o111 else 0o644
        destination.chmod(mode)
        metadata[name] = new_attrs(stat.S_IFREG | mode)
        add_parents(metadata, name, PYTHON_ROOT)
    return dict(files=len(files), manifest_sha256=sha(manifest),
                canonical_manifest_sha256=canonical_sha,
                generated_bytecode_excluded=generated_bytecode,
                modes="root:root 0644; executable wheel entries 0755",
                content_transforms=[])


def overlay(files, payload, metadata, component):
    for item in files:
        if item["rpm_component"] != component:
            continue
        name = "/" + item["path"]
        target = payload / item["path"]
        require(not target.is_symlink(), "Runtime target is symlink: " + name)
        if name not in metadata:
            require(name.startswith(SCHEDULER_ROOT + "/lib/") or name.startswith(SCHEMA_ROOT + "/"),
                    "New runtime file requires reviewed ownership: " + name)
            if name.startswith(SCHEDULER_ROOT + "/"):
                mode = 0o750 if name.endswith(".sh") else 0o640
                metadata[name] = new_attrs(stat.S_IFREG | mode, "oneadmin", "oneadmin")
                add_parents(metadata, name, SCHEDULER_ROOT, 0o750, "oneadmin", "oneadmin")
            else:
                metadata[name] = new_attrs(stat.S_IFREG | 0o644)
                add_parents(metadata, name, SCHEMA_ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(item["content"])
        target.chmod(stat.S_IMODE(metadata[name]["mode"]))


def audit_package(old, new, metadata, payload, release, extra_requirements=()):
    require(new["version"] == old["version"] and new["name"] == old["name"]
            and new["arch"] == old["arch"] and new["release"] == release,
            "Package identity differs")
    for tag in SCRIPT_TAGS:
        require(new[tag] == old[tag], "Vendor lifecycle changed: " + tag)
    for prefix in ("require", "provide", "obsolete", "conflict"):
        expected = normalized_dependencies(old, prefix, old["release"], release)
        if prefix == "require":
            expected.update(extra_requirements)
        actual = normalized_dependencies(new, prefix)
        require(actual == expected, "Dependency semantics differ: " + prefix
                + " missing=" + repr(expected - actual) + " extra=" + repr(actual - expected))
    got = attrs(new)
    require(set(got) == set(metadata), "Packaged file list differs")
    for name, expected in metadata.items():
        for field in ("mode", "flags", "user", "group", "verify"):
            require(got[name][field] == expected[field], "File metadata differs: " + name + " " + field)
    verified = verify_tree(payload, got)
    return dict(verified_regular_files=verified, vendor_scriptlets_unchanged=True,
                dependency_semantics_preserved=True,
                dependency_provenance_flags_ignored=["FIND_REQUIRES", "FIND_PROVIDES"],
                file_modes_flags_ownership_verified=True)


def build_component(top, component, spec_text, old, metadata, payload, release, extra=()):
    spec = top / "SPECS" / (component + ".spec")
    spec.write_text(spec_text)
    log_path = top.parent / (component + "-rpmbuild.log")
    with log_path.open("x") as log:
        run(["rpmbuild", "-bb", "--define", "_topdir " + str(top), "--define",
             "_buildhost layersentry-native-package-qualification", str(spec)],
            stdout=log, stderr=subprocess.STDOUT, timeout=300)
    packages = list((top / "RPMS").rglob(component + "-7.4.1-" + release + ".*.rpm"))
    require(len(packages) == 1, "Ambiguous package output")
    package = packages[0]
    current = header(package)
    audited = audit_package(old, current, metadata, payload, release, extra)
    audited.update(path=str(package), sha256=sha(package), bytes=package.stat().st_size,
                   nevra=f"{current['name']}-{current['version']}-{current['release']}.{current['arch']}",
                   spec_sha256=sha(spec), log_sha256=sha(log_path), signature="NONE")
    return package, current, audited


def build(args):
    require(re.fullmatch(r"[0-9a-f]{40}", args.commit), "Exact source commit required")
    require(re.fullmatch(r"[0-9][A-Za-z0-9.]*\.lab\.el9", args.release), "Explicit lab release required")
    require(args.output.is_absolute() and not args.output.exists(), "Fresh absolute output directory required")
    require(sha(args.libs_rpm) == LIBS_VENDOR_SHA, "Signed vendor library checksum differs")
    signature = output(["rpmkeys", "--checksig", str(args.libs_rpm)])
    require("digests signatures OK" in signature and "NOKEY" not in signature,
            "Vendor library signature not verified")
    args.output.mkdir(mode=0o700)
    record = dict(schema="onedrs.native-rpm-pair/v1", source_commit=args.commit,
                  packager_sha256=sha(Path(__file__)),
                  created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  release=args.release, scope="PACKAGE_INTEGRITY_ONLY", production_certified=False,
                  vendor_libs_sha256=LIBS_VENDOR_SHA, vendor_libs_signature=signature.strip(),
                  status="IN_PROGRESS", packages=[])
    receipt = args.output / "receipt.json"
    receipt.write_text(json.dumps(record, indent=2) + "\n")
    try:
        module, files, manifest = runtime_module(args.repo, args.commit, args.output)
        top = args.output / "rpmbuild"
        for name in ("BUILD", "BUILDROOT", "RPMS", "SOURCES", "SPECS", "SRPMS"):
            (top / name).mkdir(parents=True)
        lib_h = header(args.libs_rpm)
        lib_payload = args.output / "libs-payload"
        record["vendor_libs_files_verified"] = extract(args.libs_rpm, lib_payload, lib_h)
        lib_attrs = attrs(lib_h)
        overlay(files, lib_payload, lib_attrs, "opennebula-libs")
        lib_package, lib_new, lib_result = build_component(
            top, "opennebula-libs", libs_spec(lib_h, lib_attrs, lib_payload, args.release),
            lib_h, lib_attrs, lib_payload, args.release)
        record["packages"].append(lib_result)
        lib_changed = [n for n, old in attrs(lib_h).items()
                       if stat.S_ISREG(old["mode"]) and sha(lib_payload / n.lstrip("/")) != old["digest"]]
        require(lib_changed == ["/usr/lib/one/ruby/ActionManager.rb"], "Unexpected library content change")
        record["library_changed_files"] = lib_changed
        if args.libs_only:
            record["status"] = "PASS_LIBRARY_PACKAGE_INTEGRITY_ONLY"
            return record
        require(args.baseline and args.native_build_receipt and args.python_closure,
                "Server baseline, exact native build and Python closure are required")
        baseline = json.loads((args.baseline / "receipt.json").read_text())
        baseline_rpm = Path(baseline["rpm"])
        require(sha(baseline_rpm) == BASELINE_SHA == baseline["rpm_sha256"], "Server baseline differs")
        old = header(baseline_rpm)
        require(old["name"] == "opennebula" and old["release"] == BASELINE_RELEASE,
                "Wrong server baseline identity")
        metadata = attrs(old)
        record["baseline_files_verified"] = verify_tree(args.baseline / "payload", metadata)
        payload = args.output / "server-payload"
        run(["cp", "-a", "--reflink=auto", str(args.baseline / "payload"), str(payload)])
        native_artifacts(args, metadata, payload, record)
        # Remove stale source-owned runtime entries from this private copy only.
        expected = {"/" + i["path"] for i in files if i["rpm_component"] == "opennebula"}
        removed = []
        for name, item in list(metadata.items()):
            controlled = (name.startswith(SCHEDULER_ROOT + "/") or
                          (name.startswith(SCHEMA_ROOT + "/") and name.endswith(".xsd")))
            if controlled and not stat.S_ISDIR(item["mode"]) and name not in expected:
                require(not item["flags"] & 64, "Unexpected ghost runtime entry")
                (payload / name.lstrip("/")).unlink()
                del metadata[name]
                removed.append(name)
        record["removed_stale_runtime_files"] = removed
        overlay(files, payload, metadata, "opennebula")
        record["python_closure"] = replace_python(args.python_closure, payload, metadata)
        require(sha(payload / "var/lib/one/remotes/vmm/kvm/deploy") == SECURITY_DRIVER_SHA,
                "Security deploy driver changed")
        spec = (args.baseline / "rpmbuild/SPECS/opennebula-r14-checked-api-lab.spec").read_text()
        require(spec.count("Release: " + BASELINE_RELEASE) == 1, "Baseline release declaration differs")
        spec = spec.replace("Release: " + BASELINE_RELEASE, "Release: " + args.release)
        spec = spec.replace(str(args.baseline / "payload"), str(payload))
        spec = spec.replace("source5995c42b checked-API LAB CANDIDATE",
                            "source" + args.commit[:8] + " matched native LAB CANDIDATE")
        spec = spec.replace("5995c42b8a0fb17ad959e5eb6af2d9e6da0f4037", args.commit)
        require("Requires: opennebula-libs" not in spec, "Baseline already constrains libraries")
        spec = spec.replace("%description\n", "Requires: opennebula-libs = 7.4.1-" + args.release + "\n\n%description\n", 1)
        spec, count = re.subn(r"(?ms)^%files\n.*?(?=^%pre\s)",
                              lambda _: "%files\n" + file_lines(metadata) + "\n", spec)
        require(count == 1, "Ambiguous server file section")
        extra = [("opennebula-libs", "7.4.1-" + args.release, 8)]
        server_package, server_new, server_result = build_component(
            top, "opennebula", spec, old, metadata, payload, args.release, extra)
        record["packages"].append(server_result)
        joint = args.output / "unpacked-joint-payload"
        extract(server_package, joint, server_new)
        overlapping = set(attrs(server_new)) & set(attrs(lib_new))
        require(all(stat.S_ISDIR(attrs(server_new)[n]["mode"]) and
                    stat.S_ISDIR(attrs(lib_new)[n]["mode"]) for n in overlapping),
                "Server and library packages overlap owned files")
        # Merge verified library entries into the fresh server extraction.
        unpacked_libs = args.output / "unpacked-library-payload"
        extract(lib_package, unpacked_libs, lib_new)
        run(["cp", "-a", str(unpacked_libs) + "/.", str(joint) + "/"])
        verification = module.verify(joint, files)
        require(verification["state"] == "PASS", "Frozen runtime closure differs: " + repr(verification))
        record["runtime_verification"] = verification
        record["source_manifest_sha256"] = sha(args.output / "source-overlay/onedrs-runtime-source-manifest.json")
        record["security_deploy_driver_sha256"] = SECURITY_DRIVER_SHA
        record["status"] = "PASS_MATCHED_PACKAGE_INTEGRITY_ONLY"
        return record
    except Exception as error:
        record["status"] = "FAIL"
        record["error"] = str(error)
        raise
    finally:
        receipt.write_text(json.dumps(record, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--libs-rpm", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--libs-only", action="store_true")
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--native-build-receipt", type=Path)
    parser.add_argument("--python-closure", type=Path)
    args = parser.parse_args()
    try:
        result = build(args)
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"status": "FAIL", "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
