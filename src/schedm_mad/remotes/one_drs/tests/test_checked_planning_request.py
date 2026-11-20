"""Checked generation returns only the original native request identity."""
import contextlib
import importlib.machinery
import importlib.util
import io
import pathlib
import sys
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.checked_request import request_binding, error_result
from lib.optimizer_serializer import OptimizerSerializer

loader = importlib.machinery.SourceFileLoader("checked_optimize_entry", str(ROOT / "optimize"))
spec = importlib.util.spec_from_loader(loader.name, loader)
optimize_entry = importlib.util.module_from_spec(spec)
loader.exec_module(optimize_entry)


class CheckedPlanningRequestTests(unittest.TestCase):
    @staticmethod
    def native_input(nonce="a" * 64, request_policy="b" * 64, cluster_policy="b" * 64):
        return (
            '<SCHEDULER_DRIVER_ACTION><CLUSTER_POOL><CLUSTER><ID>7</ID>'
            f'<TEMPLATE_SHA256>{cluster_policy}</TEMPLATE_SHA256></CLUSTER></CLUSTER_POOL>'
            f'<ONE_DRS_REQUEST><NONCE>{nonce}</NONCE><CLUSTER_ID>7</CLUSTER_ID>'
            f'<TEMPLATE_SHA256>{request_policy}</TEMPLATE_SHA256></ONE_DRS_REQUEST>'
            '</SCHEDULER_DRIVER_ACTION>'
        ).encode()

    def test_exact_native_request_is_echoed_for_empty_result(self):
        binding = request_binding(self.native_input())
        serializer = OptimizerSerializer(7, binding.template_sha256, {}, binding.nonce)
        result, _ = serializer.build_optimizer_output({}, {})
        output = ET.fromstring(serializer.render(result))
        self.assertEqual(output.findtext("REQUEST_NONCE"), "a" * 64)
        self.assertEqual(output.findtext("TEMPLATE_SHA256"), "b" * 64)
        self.assertEqual(output.findall("ACTION"), [])
        self.assertIsNone(output.find("REQUEST_ERROR"))

    def test_invalid_nonce_is_never_repaired_or_regenerated(self):
        for nonce in ["", "a" * 63, "a" * 65, "A" * 64, "z" * 64]:
            with self.subTest(nonce=nonce):
                with self.assertRaises(ValueError):
                    request_binding(self.native_input(nonce=nonce))
                with self.assertRaises(ValueError):
                    OptimizerSerializer(7, "b" * 64, {}, nonce)

    def test_request_cannot_borrow_a_different_cluster_policy(self):
        with self.assertRaisesRegex(ValueError, "differs from scheduler input"):
            request_binding(self.native_input(request_policy="c" * 64))

    def test_duplicate_or_unknown_request_fields_fail_closed(self):
        raw = self.native_input()
        for value in [
            raw.replace(b"</NONCE>", b"</NONCE><NONCE>" + b"a" * 64 + b"</NONCE>"),
            raw.replace(b"</ONE_DRS_REQUEST>", b"<UNKNOWN>1</UNKNOWN></ONE_DRS_REQUEST>"),
            raw.replace(b"<CLUSTER_ID>7</CLUSTER_ID>", b"<CLUSTER_ID>07</CLUSTER_ID>"),
            raw.replace(b"</SCHEDULER_DRIVER_ACTION>", b"<ONE_DRS_REQUEST/></SCHEDULER_DRIVER_ACTION>"),
        ]:
            with self.subTest(raw=value):
                with self.assertRaises(ValueError):
                    request_binding(value)

    def test_optimizer_failure_returns_correlated_error_not_empty_success(self):
        output = io.StringIO()
        with patch.object(optimize_entry, "OptimizerParser", side_effect=RuntimeError("private detail")):
            with contextlib.redirect_stdout(output):
                self.assertEqual(optimize_entry.run(self.native_input()), 0)
        root = ET.fromstring(output.getvalue())
        self.assertEqual(root.findtext("REQUEST_NONCE"), "a" * 64)
        self.assertEqual(root.findtext("TEMPLATE_SHA256"), "b" * 64)
        self.assertEqual(root.findtext("ID"), "7")
        self.assertEqual(root.findtext("REQUEST_ERROR"), "Native optimizer failed")
        self.assertNotIn("private detail", output.getvalue())
        self.assertEqual(root.findall("ACTION"), [])

    def test_legacy_request_remains_unbound_and_failure_remains_failure(self):
        raw = b"<SCHEDULER_DRIVER_ACTION/>"
        self.assertIsNone(request_binding(raw))
        with patch.object(optimize_entry, "OptimizerParser", side_effect=RuntimeError("legacy failure")):
            with self.assertRaisesRegex(RuntimeError, "legacy failure"):
                optimize_entry.run(raw)


if __name__ == "__main__":
    unittest.main()
