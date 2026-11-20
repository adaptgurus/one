"""Native candidate identities must reach plan actions without resampling."""
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


class NativeEligibilityIdentityTests(unittest.TestCase):
    @staticmethod
    def request(candidates=None):
        native = "" if candidates is None else "<ONE_DRS_ELIGIBILITY>" + candidates + "</ONE_DRS_ELIGIBILITY>"
        xml = ("<SCHEDULER_DRIVER_ACTION><VM_POOL/><HOST_POOL/><DATASTORE_POOL/><VNET_POOL/>"
               "<VM_GROUP_POOL/><CLUSTER_POOL/><REQUIREMENTS><VM><ID>7</ID>"
               "<HOSTS><ID>2</ID><ID>3</ID></HOSTS><DATASTORES/></VM></REQUIREMENTS>"
               + native + "</SCHEDULER_DRIVER_ACTION>")
        with patch.object(OptimizerParser, "_load_config", return_value={}):
            return OptimizerParser(xml.encode(), mode="optimize")

    @staticmethod
    def candidate(vm=7, host=2, digest="a" * 64):
        return f"<CANDIDATE><VM_ID>{vm}</VM_ID><HOST_ID>{host}</HOST_ID><SHA256>{digest}</SHA256></CANDIDATE>"

    def test_native_candidate_is_echoed_exactly_to_selected_action(self):
        parser = self.request(self.candidate() + self.candidate(host=3, digest="b" * 64))
        serializer = OptimizerSerializer(4, "c" * 64, parser.plan_eligibility)
        old = {7: Allocation(7, 1, 100, "shared")}
        new = {7: Allocation(7, 3, 100, "shared")}
        plan, _ = serializer.build_optimizer_output(old, new)
        output = ET.fromstring(serializer.render(plan))
        self.assertEqual(output.findtext("ACTION/ELIGIBILITY_SHA256"), "b" * 64)
        self.assertEqual(output.findtext("ACTION/HOST_ID"), "3")
        self.assertEqual(output.findtext("TEMPLATE_SHA256"), "c" * 64)

    def test_optimizer_cannot_borrow_another_candidate_identity(self):
        parser = self.request(self.candidate(host=2))
        serializer = OptimizerSerializer(4, "c" * 64, parser.plan_eligibility)
        with self.assertRaisesRegex(ValueError, "absent from native eligibility input"):
            serializer.build_optimizer_output({7: Allocation(7, 1, 100, "shared")},
                                               {7: Allocation(7, 3, 100, "shared")})

    def test_duplicate_or_denied_native_candidate_fails_closed(self):
        for raw in [self.candidate() + self.candidate(), self.candidate(host=4),
                    self.candidate(vm=8), self.candidate(vm=-1), self.candidate(host=-1)]:
            with self.subTest(raw=raw):
                with self.assertRaisesRegex(ValueError, "native eligibility candidate"):
                    self.request(raw).plan_eligibility

    def test_invalid_source_digest_is_never_repaired(self):
        for digest in ["", "a" * 63, "a" * 65, "A" * 64, "z" * 64]:
            with self.subTest(digest=digest):
                with self.assertRaisesRegex(ValueError, "native eligibility candidate"):
                    self.request(self.candidate(digest=digest)).plan_eligibility

    def test_legacy_input_remains_explicitly_unbound(self):
        parser = self.request()
        self.assertIsNone(parser.plan_eligibility)
        serializer = OptimizerSerializer(4, "c" * 64, parser.plan_eligibility)
        plan, _ = serializer.build_optimizer_output({7: Allocation(7, 1, 100, "shared")},
                                                    {7: Allocation(7, 2, 100, "shared")})
        self.assertIsNone(ET.fromstring(serializer.render(plan)).find("ACTION/ELIGIBILITY_SHA256"))

    def test_empty_native_candidate_set_cannot_create_a_migration(self):
        parser = self.request("")
        self.assertEqual(parser.plan_eligibility, {})
        serializer = OptimizerSerializer(4, "c" * 64, parser.plan_eligibility)
        with self.assertRaisesRegex(ValueError, "absent from native eligibility input"):
            serializer.build_optimizer_output({7: Allocation(7, 1, 100, "shared")},
                                               {7: Allocation(7, 2, 100, "shared")})


if __name__ == "__main__":
    unittest.main()
