import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import xml.etree.ElementTree as ET

from native_downgrade_guard import inspect_connection, inspect_database


class NativeDowngradeGuardTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
            CREATE TABLE vm_pool(oid INTEGER PRIMARY KEY,state INTEGER,lcm_state INTEGER,body TEXT);
            CREATE TABLE history(vid INTEGER,seq INTEGER,body TEXT,PRIMARY KEY(vid,seq));
            CREATE TABLE plan_pool(cid INTEGER PRIMARY KEY,state INTEGER,body TEXT);
        """)

    def tearDown(self):
        self.db.close()

    def vm(self, state=3, lcm=3, sequence=0, pending=None, enforced=None, generation=""):
        root = ET.Element("VM")
        for key, value in [("ID", 7), ("STATE", state), ("LCM_STATE", lcm)]:
            ET.SubElement(root, key).text = str(value)
        histories = ET.SubElement(root, "HISTORY_RECORDS")
        history = ET.SubElement(histories, "HISTORY")
        ET.SubElement(history, "OID").text = "7"
        ET.SubElement(history, "SEQ").text = str(sequence)
        if pending is not None:
            ET.SubElement(history, "CHECKED_CAPACITY_PENDING").text = str(pending)
        if enforced is not None:
            ET.SubElement(history, "ENFORCE_CAPACITY").text = str(enforced)
        if generation:
            ET.SubElement(history, "CHECKED_PLAN_GENERATION").text = generation
        self.db.execute("INSERT OR REPLACE INTO history VALUES(?,?,?)", (7, sequence, ET.tostring(history, encoding="unicode")))
        self.db.execute("INSERT OR REPLACE INTO vm_pool VALUES(?,?,?,?)", (7, state, lcm, ET.tostring(root, encoding="unicode")))

    def plan(self, state=0, request_action=None, request_state=None):
        root = ET.Element("PLAN")
        ET.SubElement(root, "ID").text = "100"
        ET.SubElement(root, "STATE").text = str(state)
        if request_action:
            request = ET.SubElement(root, "REQUEST")
            for key, value in [("ACTION", request_action), ("STATE", request_state),
                               ("NONCE", "a" * 64), ("INSTANCE", "b" * 64),
                               ("ERROR", "private-error-detail")]:
                ET.SubElement(request, key).text = value
        self.db.execute("INSERT OR REPLACE INTO plan_pool VALUES(?,?,?)", (100, state, ET.tostring(root, encoding="unicode")))

    def ready(self):
        return inspect_connection(self.db)["database_ready_for_older_binary"]

    def test_legacy_stable_state_is_compatible(self):
        self.vm()
        self.plan(-1)
        self.assertTrue(self.ready())

    def test_new_pending_enum_is_always_blocked(self):
        self.vm(lcm=72)
        self.assertFalse(self.ready())

    def test_pending_history_is_blocked(self):
        self.vm(lcm=4, pending=1, generation="a" * 64)
        self.assertFalse(self.ready())

    def test_final_marker_cleared_but_migration_in_progress_is_blocked(self):
        self.vm(lcm=4, pending=0, generation="a" * 64)
        self.assertFalse(self.ready())

    def test_enforced_in_progress_state_is_blocked_without_checked_generation(self):
        self.vm(lcm=2, enforced=1)
        self.assertFalse(self.ready())

    def test_stable_checked_history_does_not_permanently_forbid_rollback(self):
        self.vm(pending=0, enforced=1, generation="a" * 64)
        self.assertTrue(self.ready())

    def test_stable_poweroff_reservation_is_compatible(self):
        self.vm(state=8, lcm=0, enforced=1)
        self.assertTrue(self.ready())

    def test_applying_plan_blocks_even_if_no_vm_is_yet_dispatched(self):
        self.plan(1)
        self.assertFalse(self.ready())

    def test_unreferenced_failed_insert_is_not_an_active_pending_vm(self):
        self.vm()
        self.db.execute("INSERT INTO history VALUES(7,1,?)", ('<HISTORY><OID>7</OID><SEQ>1</SEQ><CHECKED_CAPACITY_PENDING>1</CHECKED_CAPACITY_PENDING><CHECKED_PLAN_GENERATION>' + "a" * 64 + '</CHECKED_PLAN_GENERATION></HISTORY>',))
        self.assertTrue(self.ready())

    def test_authoritative_history_wins_over_stale_embedded_pending_bit(self):
        self.vm(pending=1, generation="a" * 64)
        body = self.db.execute("SELECT body FROM history").fetchone()[0]
        self.db.execute("UPDATE history SET body=?", (body.replace('<CHECKED_CAPACITY_PENDING>1</CHECKED_CAPACITY_PENDING>', '<CHECKED_CAPACITY_PENDING>0</CHECKED_CAPACITY_PENDING>'),))
        self.assertTrue(self.ready())

    def test_missing_canonical_history_fails_closed(self):
        self.vm()
        self.db.execute("DELETE FROM history")
        self.assertFalse(self.ready())

    def test_malformed_flag_and_index_disagreement_fail_closed(self):
        self.vm(enforced="garbage")
        self.assertFalse(self.ready())
        self.vm()
        self.db.execute("UPDATE vm_pool SET lcm_state=4")
        self.assertFalse(self.ready())

    def test_generating_request_cannot_be_resumed_by_old_binary(self):
        self.plan(-1, "GENERATE", "GENERATING")
        self.assertFalse(self.ready())

    def test_terminal_request_metadata_is_retained_without_error_text(self):
        self.plan(0, "GENERATE", "READY")
        report = inspect_connection(self.db)
        self.assertTrue(report["database_ready_for_older_binary"])
        self.assertEqual(report["request_metadata_to_retain"][0]["NONCE"], "a" * 64)
        self.assertNotIn("private-error-detail", json.dumps(report))
        self.assertEqual(report["request_metadata_to_retain"][0]["error_sha256"], hashlib.sha256(b"private-error-detail").hexdigest())

    def test_unknown_request_and_inconsistent_plan_state_fail_closed(self):
        self.plan(0, "GENERATE", "UNKNOWN")
        self.assertFalse(self.ready())
        self.plan(0)
        self.db.execute("UPDATE plan_pool SET state=1")
        self.assertFalse(self.ready())

    def test_file_reader_does_not_mutate_database(self):
        self.vm()
        self.db.commit()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "one.db"
            with sqlite3.connect(path) as destination:
                self.db.backup(destination)
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertTrue(inspect_database(path)["database_ready_for_older_binary"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)


if __name__ == "__main__":
    unittest.main()
