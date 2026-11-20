#!/usr/bin/env python3
"""Freeze every OneDRS runtime module/schema and verify an unpacked RPM payload.

This tool never changes an installed service or an existing payload. Staging
creates a new source overlay; RPM ownership/configuration metadata and actual
runtime qualification are separate gates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

SOURCE_ROOT = "src/schedm_mad/remotes/one_drs/"
RUNTIME_ROOT = "var/lib/one/remotes/scheduler/one_drs/"
SCHEMA_SOURCE = "share/doc/xsd/"
SCHEMA_ROOT = "usr/share/one/schemas/xsd/"
CONFIG_SOURCE = SOURCE_ROOT + "etc/one_drs.conf"
CONFIG_TARGET = "etc/one/schedulers/one_drs.conf"
MAD_RUBY_FILES = {
    "src/mad/ruby/ActionManager.rb": ("usr/lib/one/ruby/ActionManager.rb", "opennebula-libs"),
    "src/mad/ruby/OpenNebulaDriver.rb": ("usr/lib/one/ruby/OpenNebulaDriver.rb", "opennebula"),
    "src/mad/ruby/DriverExecHelper.rb": ("usr/lib/one/ruby/DriverExecHelper.rb", "opennebula"),
}
REQUIRED = {
    SOURCE_ROOT + "optimize", SOURCE_ROOT + "place", CONFIG_SOURCE,
    SOURCE_ROOT + "lib/__init__.py",
    SCHEMA_SOURCE + "cluster.xsd", SCHEMA_SOURCE + "plan.xsd",
    SCHEMA_SOURCE + "vm.xsd", SCHEMA_SOURCE + "acct.xsd",
    SCHEMA_SOURCE + "scheduler_driver_action.xsd",
} | set(MAD_RUBY_FILES)
SHEBANG = b"#!/usr/bin/env python3\n"
PACKAGED_SHEBANG = b"#!/usr/bin/python3.12\n"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(repo: Path, *args: str, data: bytes | None = None) -> bytes:
    process = subprocess.run(
        ["git", "-C", str(repo), *args], input=data,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        timeout=60,
    )
    if process.returncode:
        raise ValueError("Git source read failed: " + args[0])
    return process.stdout


def source_blobs(repo: Path, commit: str) -> dict[str, tuple[str, bytes]]:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("An exact full lowercase source commit is required")
    resolved = git(repo, "rev-parse", "--verify", commit + "^{commit}").decode().strip()
    if resolved != commit:
        raise ValueError("Source commit identity differs")
    tree = git(repo, "ls-tree", "-rz", "--full-tree", commit, "--",
               SOURCE_ROOT.rstrip("/"), SCHEMA_SOURCE.rstrip("/"), *MAD_RUBY_FILES)
    entries: list[tuple[str, str]] = []
    for line in tree.split(b"\0"):
        if not line:
            continue
        identity, encoded_path = line.split(b"\t", 1)
        mode, kind, object_id = identity.decode("ascii").split()
        path = encoded_path.decode("utf-8")
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise ValueError("Nonregular source entry: " + path)
        entries.append((path, object_id))
    if not entries:
        raise ValueError("Empty runtime source tree")
    batch = git(repo, "cat-file", "--batch",
                data=b"".join((oid + "\n").encode("ascii") for _, oid in entries))
    offset = 0
    result = {}
    for path, expected_id in entries:
        end = batch.find(b"\n", offset)
        header = batch[offset:end].decode("ascii").split()
        if len(header) != 3 or header[:2] != [expected_id, "blob"]:
            raise ValueError("Invalid source blob response")
        size = int(header[2])
        start, offset = end + 1, end + 2 + size
        data = batch[start:start + size]
        if len(data) != size or batch[start + size:start + size + 1] != b"\n":
            raise ValueError("Truncated source blob")
        object_id = hashlib.sha1(b"blob " + str(size).encode() + b"\0" + data).hexdigest()
        if object_id != expected_id:
            raise ValueError("Source object checksum differs")
        result[path] = (object_id, data)
    if offset != len(batch):
        raise ValueError("Unexpected trailing source data")
    return result


def runtime_files(blobs: dict[str, tuple[str, bytes]]) -> list[dict]:
    missing = sorted(REQUIRED - blobs.keys())
    if missing:
        raise ValueError("Missing required source entries: " + ", ".join(missing))
    files = []
    for source, (object_id, original) in sorted(blobs.items()):
        parsed = PurePosixPath(source)
        if parsed.is_absolute() or ".." in parsed.parts or "\\" in source:
            raise ValueError("Unsafe source path")
        transform = None
        component = "opennebula"
        content = original
        if source.startswith(SOURCE_ROOT):
            relative = source[len(SOURCE_ROOT):]
            if relative.startswith("tests/") or relative == "vendor/download":
                continue
            if relative in {"optimize", "place"}:
                if not content.startswith(SHEBANG):
                    raise ValueError("Unexpected entrypoint interpreter: " + source)
                content = PACKAGED_SHEBANG + content[len(SHEBANG):]
                transform = "explicit packaged /usr/bin/python3.12 shebang"
                target = RUNTIME_ROOT + relative
            elif source == CONFIG_SOURCE:
                target = CONFIG_TARGET
            elif relative.startswith("lib/") and relative.endswith((".py", ".sh")):
                target = RUNTIME_ROOT + relative
            else:
                raise ValueError("Unmapped runtime source entry: " + source)
        elif source.startswith(SCHEMA_SOURCE):
            if source == SCHEMA_SOURCE + "README.txt":
                continue
            relative = source[len(SCHEMA_SOURCE):]
            if "/" in relative or not relative.endswith(".xsd"):
                raise ValueError("Unmapped schema source entry: " + source)
            target = SCHEMA_ROOT + relative
        elif source in MAD_RUBY_FILES:
            target, component = MAD_RUBY_FILES[source]
        else:
            raise ValueError("Unexpected source root")
        files.append({
            "source": source, "path": target, "git_blob": object_id,
            "source_sha256": sha(original), "sha256": sha(content),
            "packaging_transform": transform, "content": content,
            "rpm_component": component,
        })
    paths = [item["path"] for item in files]
    if len(paths) != len(set(paths)):
        raise ValueError("Duplicate installed path")
    return files


def manifest(commit: str, files: list[dict]) -> dict:
    return {
        "schema": "onedrs.native-runtime-payload/v1",
        "source_commit": commit,
        "scope": "Frozen source payload custody; not runtime or release qualification",
        "files": [{k: v for k, v in item.items() if k != "content"} for item in files],
    }


def stage(output: Path, record: dict, files: list[dict]) -> None:
    if not output.is_absolute() or output == Path("/"):
        raise ValueError("Staging needs an absolute fresh directory")
    output.mkdir(mode=0o700, exist_ok=False)
    for item in files:
        target = output / item["path"]
        target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(item["content"])
        target.chmod(0o644)
    with (output / "onedrs-runtime-source-manifest.json").open("x") as stream:
        json.dump(record, stream, indent=2, sort_keys=True)
        stream.write("\n")


def regular_path(root: Path, relative: str) -> tuple[Path, str | None]:
    path = root
    for component in PurePosixPath(relative).parts:
        path = path / component
        if path.is_symlink():
            return path, "SYMLINK"
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return path, "MISSING"
    if not stat.S_ISREG(metadata.st_mode):
        return path, "NOT_REGULAR"
    return path, None


def verify(payload: Path, files: list[dict]) -> dict:
    if payload.is_symlink() or not payload.is_dir():
        raise ValueError("Payload must be a real directory")
    problems = []
    expected = {item["path"]: item for item in files}
    for item in files:
        target, error = regular_path(payload, item["path"])
        if error:
            problems.append({"path": item["path"], "reason": error})
        elif sha(target.read_bytes()) != item["sha256"]:
            problems.append({"path": item["path"], "reason": "CONTENT_DIFFERS"})
    for directory in (RUNTIME_ROOT, SCHEMA_ROOT):
        root = payload / directory
        if root.is_symlink():
            continue
        if root.is_dir():
            for current, directories, names in os.walk(root, followlinks=False):
                for name in list(directories):
                    path = Path(current) / name
                    if path.is_symlink():
                        relative = path.relative_to(payload).as_posix()
                        if relative not in expected:
                            problems.append({"path": relative, "reason": "UNEXPECTED_SYMLINK"})
                        directories.remove(name)
                for name in names:
                    path = Path(current) / name
                    relative = path.relative_to(payload).as_posix()
                    if directory == SCHEMA_ROOT and not name.endswith(".xsd"):
                        continue
                    if relative not in expected:
                        problems.append({"path": relative, "reason": "UNEXPECTED_RUNTIME_FILE"})
    return {"state": "PASS" if not problems else "FAIL",
            "expected_files": len(files), "problems": problems}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--stage-output", type=Path)
    action.add_argument("--verify-payload", type=Path)
    args = parser.parse_args()
    try:
        files = runtime_files(source_blobs(args.repo, args.commit))
        record = manifest(args.commit, files)
        if args.stage_output is not None:
            stage(args.stage_output, record, files)
            result = {"state": "STAGED_SOURCE_OVERLAY", "files": len(files),
                      "source_commit": args.commit, "output": str(args.stage_output)}
        else:
            result = verify(args.verify_payload, files)
            result["source_commit"] = args.commit
            result["scope"] = record["scope"]
        print(json.dumps(result, sort_keys=True))
        return 0 if result["state"] != "FAIL" else 2
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"state": "ERROR", "reason": str(error)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
