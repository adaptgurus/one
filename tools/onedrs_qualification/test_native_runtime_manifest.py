#!/usr/bin/env python3
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

MODULE = Path(__file__).with_name("native_runtime_manifest.py")
SPEC = importlib.util.spec_from_file_location("native_runtime_manifest", MODULE)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(), data


def fixture():
    result = {}
    for name in runtime.REQUIRED:
        data = (runtime.SHEBANG + b"pass\n" if name.endswith(("/optimize", "/place"))
                else b"<schema/>\n" if name.endswith(".xsd") else b"# source\n")
        result[name] = blob(data)
    result[runtime.SOURCE_ROOT + "lib/new_admission.py"] = blob(b"VALUE = 1\n")
    result[runtime.SOURCE_ROOT + "tests/test_private.py"] = blob(b"# test-only\n")
    result[runtime.SOURCE_ROOT + "vendor/download"] = blob(b"# build-only\n")
    return result


class RuntimeManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.files = runtime.runtime_files(fixture())
        self.payload = self.root / "payload"
        runtime.stage(self.payload, runtime.manifest("a" * 40, self.files), self.files)

    def tearDown(self):
        self.tmp.cleanup()

    def test_new_module_is_included_without_handwritten_copy_list(self):
        expected = runtime.RUNTIME_ROOT + "lib/new_admission.py"
        self.assertIn(expected, {f["path"] for f in self.files})
        self.assertEqual("PASS", runtime.verify(self.payload, self.files)["state"])

    def test_unpacked_old_payload_missing_new_module_fails(self):
        (self.payload / runtime.RUNTIME_ROOT / "lib/new_admission.py").unlink()
        result = runtime.verify(self.payload, self.files)
        self.assertEqual("FAIL", result["state"])
        self.assertEqual("MISSING", result["problems"][0]["reason"])

    def test_runtime_content_drift_fails(self):
        (self.payload / runtime.RUNTIME_ROOT / "lib/new_admission.py").write_text("VALUE = 2\n")
        result = runtime.verify(self.payload, self.files)
        self.assertEqual("CONTENT_DIFFERS", result["problems"][0]["reason"])

    def test_stale_runtime_module_fails(self):
        (self.payload / runtime.RUNTIME_ROOT / "obsolete.py").write_text("# removed upstream\n")
        self.assertEqual("UNEXPECTED_RUNTIME_FILE",
                         runtime.verify(self.payload, self.files)["problems"][0]["reason"])

    def test_stale_schema_fails(self):
        (self.payload / runtime.SCHEMA_ROOT / "obsolete.xsd").write_text("<schema/>")
        self.assertEqual("UNEXPECTED_RUNTIME_FILE",
                         runtime.verify(self.payload, self.files)["problems"][0]["reason"])

    def test_file_symlink_is_not_followed(self):
        path = self.payload / runtime.RUNTIME_ROOT / "lib/new_admission.py"
        outside = self.root / "outside"
        outside.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(outside)
        self.assertEqual("SYMLINK", runtime.verify(self.payload, self.files)["problems"][0]["reason"])

    def test_directory_symlink_is_not_followed(self):
        lib = self.payload / runtime.RUNTIME_ROOT / "lib"
        outside = self.root / "outside-lib"
        lib.rename(outside)
        lib.symlink_to(outside, target_is_directory=True)
        result = runtime.verify(self.payload, self.files)
        self.assertEqual("FAIL", result["state"])
        self.assertTrue(any(p["reason"] == "SYMLINK" for p in result["problems"]))

    def test_stage_never_overwrites_existing_directory(self):
        with self.assertRaises(FileExistsError):
            runtime.stage(self.payload, {}, self.files)
        self.assertEqual("PASS", runtime.verify(self.payload, self.files)["state"])

    def test_only_two_entrypoints_get_declared_shebang_transform(self):
        changed = [f for f in self.files if f["packaging_transform"]]
        self.assertEqual(2, len(changed))
        self.assertTrue(all(f["content"].startswith(runtime.PACKAGED_SHEBANG) for f in changed))

    def test_unknown_entrypoint_interpreter_fails(self):
        source = fixture()
        source[runtime.SOURCE_ROOT + "place"] = blob(b"#!/usr/bin/python\n")
        with self.assertRaisesRegex(ValueError, "interpreter"):
            runtime.runtime_files(source)

    def test_unknown_runtime_path_cannot_be_silently_omitted(self):
        source = fixture()
        source[runtime.SOURCE_ROOT + "new_dispatcher"] = blob(b"#!/bin/sh\n")
        with self.assertRaisesRegex(ValueError, "Unmapped runtime"):
            runtime.runtime_files(source)

    def test_missing_schema_fails(self):
        source = fixture()
        del source[runtime.SCHEMA_SOURCE + "vm.xsd"]
        with self.assertRaisesRegex(ValueError, "Missing required"):
            runtime.runtime_files(source)

    def test_test_and_download_tools_are_not_shipped(self):
        self.assertFalse(any("/tests/" in f["path"] or f["path"].endswith("/download")
                             for f in self.files))
        record = json.loads((self.payload / "onedrs-runtime-source-manifest.json").read_text())
        self.assertEqual(len(self.files), len(record["files"]))
        self.assertTrue(all("content" not in f for f in record["files"]))

    def test_exact_commit_ignores_later_worktree_edits(self):
        repo = self.root / "repo"
        repo.mkdir()
        for path, (_, data) in fixture().items():
            target = repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        def git(*args):
            return subprocess.check_output(["git", "-C", str(repo), *args],
                                           stderr=subprocess.DEVNULL, text=True).strip()
        git("init", "-q")
        git("add", ".")
        git("-c", "user.name=OneDRS Test", "-c", "user.email=onedrs-test@localhost",
            "commit", "-qm", "fixture")
        commit = git("rev-parse", "HEAD")
        path = repo / runtime.SOURCE_ROOT / "lib/new_admission.py"
        path.write_text("CHANGED AFTER COMMIT\n")
        frozen = runtime.source_blobs(repo, commit)
        self.assertEqual(b"VALUE = 1\n", frozen[runtime.SOURCE_ROOT + "lib/new_admission.py"][1])
        self.assertEqual("PASS", runtime.verify(self.payload, runtime.runtime_files(frozen))["state"])

    def test_short_or_symbolic_source_identity_is_refused(self):
        for value in ["HEAD", "abc123", "A" * 40, "a" * 40 + "\n"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                runtime.source_blobs(self.root, value)


if __name__ == "__main__":
    unittest.main()
