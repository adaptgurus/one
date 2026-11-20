"""Bind a computed plan to the native policy fingerprint from its request."""
import pathlib
import sys
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib.optimizer_parser import OptimizerParser
from lib.optimizer_serializer import OptimizerSerializer
from lib.mapper.model import Allocation


class PlanPolicyIdentityTests(unittest.TestCase):
    @staticmethod
    def request(digest=None, duplicate=False):
        field = "" if digest is None else f"<TEMPLATE_SHA256>{digest}</TEMPLATE_SHA256>"
        cluster = ("<CLUSTER><ID>7</ID><NAME>approved</NAME><HOSTS/>"
                   "<DATASTORES/><VNETS/><TEMPLATE/>" + field + "</CLUSTER>")
        xml = ("<SCHEDULER_DRIVER_ACTION><VM_POOL/><HOST_POOL/><DATASTORE_POOL/>"
               "<VNET_POOL/><VM_GROUP_POOL/><CLUSTER_POOL>" + cluster +
               (cluster if duplicate else "") +
               "</CLUSTER_POOL><REQUIREMENTS/></SCHEDULER_DRIVER_ACTION>")
        with patch.object(OptimizerParser, "_load_config", return_value={}):
            parser = OptimizerParser(xml.encode(), mode="optimize")
        parser._plan_id = 7
        return parser

    def test_native_request_identity_is_echoed_in_generated_plan(self):
        parser = self.request("a" * 64)
        serializer = OptimizerSerializer(parser.plan_id, parser.plan_template_sha256)
        plan, _ = serializer.build_optimizer_output({}, {2: Allocation(2, 3, 4, "shared")})
        output = ET.fromstring(serializer.render(plan))
        self.assertEqual(output.findtext("TEMPLATE_SHA256"), "a" * 64)
        self.assertEqual(output.findtext("ACTION/VM_ID"), "2")
        self.assertEqual(output.findtext("ACTION/HOST_ID"), "3")

    def test_old_request_stays_explicitly_unbound(self):
        parser = self.request()
        self.assertIsNone(parser.plan_template_sha256)
        serializer = OptimizerSerializer(parser.plan_id, parser.plan_template_sha256)
        plan, _ = serializer.build_optimizer_output({}, {})
        self.assertIsNone(ET.fromstring(serializer.render(plan)).find("TEMPLATE_SHA256"))

    def test_global_placement_has_no_single_cluster_identity(self):
        parser = self.request("a" * 64)
        parser._plan_id = -1
        self.assertIsNone(parser.plan_template_sha256)

    def test_different_policy_identity_is_not_recomputed_or_reused(self):
        self.assertNotEqual(self.request("a" * 64).plan_template_sha256,
                            self.request("b" * 64).plan_template_sha256)

    def test_malformed_native_digest_fails_closed(self):
        for digest in ["", "a" * 63, "a" * 65, "A" * 64, "z" * 64]:
            with self.subTest(digest=digest):
                with self.assertRaises(ValueError):
                    self.request(digest).plan_template_sha256

    def test_duplicate_cluster_identity_fails_closed(self):
        with self.assertRaises(ValueError):
            self.request("a" * 64, duplicate=True).plan_template_sha256

    def test_missing_cluster_identity_fails_closed(self):
        parser = self.request("a" * 64)
        parser._plan_id = 8
        with self.assertRaises(ValueError):
            parser.plan_template_sha256


if __name__ == "__main__":
    unittest.main()
