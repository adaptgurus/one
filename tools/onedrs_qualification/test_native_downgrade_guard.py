import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import xml.etree.ElementTree as ET

from native_downgrade_guard import InvalidState, inspect_connection, inspect_database, inspect_rows, inspect_snapshot


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

    def vm(self, state=3, lcm=3, sequence=0, pending=None, enforced=None, generation="", stime=1, etime=0, action_generation=""):
        root = ET.Element("VM")
        for key, value in [("ID", 7), ("STATE", state), ("LCM_STATE", lcm)]:
            ET.SubElement(root, key).text = str(value)
        histories = ET.SubElement(root, "HISTORY_RECORDS")
        history = ET.SubElement(histories, "HISTORY")
        ET.SubElement(history, "OID").text = "7"
        ET.SubElement(history, "SEQ").text = str(sequence)
        ET.SubElement(history, "STIME").text = str(stime)
        ET.SubElement(history, "ETIME").text = str(etime)
        if action_generation:
            ET.SubElement(history, "PLAN_ACTION_GENERATION").text = action_generation
        if pending is not None:
            ET.SubElement(history, "CHECKED_CAPACITY_PENDING").text = str(pending)
        if enforced is not None:
            ET.SubElement(history, "ENFORCE_CAPACITY").text = str(enforced)
        if generation:
            ET.SubElement(history, "CHECKED_PLAN_GENERATION").text = generation
        self.db.execute("INSERT OR REPLACE INTO history VALUES(?,?,?)", (7, sequence, ET.tostring(history, encoding="unicode")))
        self.db.execute("INSERT OR REPLACE INTO vm_pool VALUES(?,?,?,?)", (7, state, lcm, ET.tostring(root, encoding="unicode")))

    def previous(self, sequence=0, etime=0):
        body = "<HISTORY><OID>7</OID><SEQ>" + str(sequence) + "</SEQ><STIME>1</STIME><ETIME>" + str(etime) + "</ETIME></HISTORY>"
        self.db.execute("INSERT OR REPLACE INTO history VALUES(?,?,?)", (7, sequence, body))

    def test_enforced_api_to_lcm_running_gap_is_blocked(self):
        self.vm(sequence=1, enforced=1, stime=0)
        self.previous()
        self.assertFalse(self.ready())

    def test_pending_driver_request_blocks_even_in_stable_vm_state(self):
        self.vm()
        body = self.db.execute("SELECT body FROM history WHERE vid=7 AND seq=0").fetchone()[0]
        ticket = ("<DRIVER_REQUEST_TOKEN>" + "a" * 64 + "</DRIVER_REQUEST_TOKEN>" +
                  "<DRIVER_REQUEST_OWNER>" + "b" * 64 + "</DRIVER_REQUEST_OWNER>" +
                  "<DRIVER_REQUEST_PENDING>1</DRIVER_REQUEST_PENDING>")
        self.db.execute("UPDATE history SET body=? WHERE vid=7 AND seq=0", (body.replace("</HISTORY>", ticket + "</HISTORY>"),))
        self.assertFalse(self.ready())

    def test_consumed_driver_tombstone_does_not_block_stable_drain(self):
        self.vm()
        body = self.db.execute("SELECT body FROM history WHERE vid=7 AND seq=0").fetchone()[0]
        ticket = ("<DRIVER_REQUEST_TOKEN>" + "a" * 64 + "</DRIVER_REQUEST_TOKEN>" +
                  "<DRIVER_REQUEST_OWNER>" + "b" * 64 + "</DRIVER_REQUEST_OWNER>" +
                  "<DRIVER_REQUEST_PENDING>0</DRIVER_REQUEST_PENDING>")
        self.db.execute("UPDATE history SET body=? WHERE vid=7 AND seq=0", (body.replace("</HISTORY>", ticket + "</HISTORY>"),))
        self.assertTrue(self.ready())

    def test_enforced_offline_api_to_lcm_gap_is_blocked(self):
        for state in (5, 8):
            with self.subTest(state=state):
                self.vm(state=state, lcm=0, sequence=1, enforced=1, stime=0)
                self.previous()
                self.assertFalse(self.ready())

    def test_initial_enforced_deploy_before_lcm_is_blocked(self):
        self.vm(state=2, lcm=0, enforced=1, stime=0)
        self.assertFalse(self.ready())

    def test_closed_predecessor_and_started_current_can_be_stable(self):
        self.vm(sequence=1, enforced=1, stime=2)
        self.previous(etime=2)
        self.assertTrue(self.ready())

    def test_open_predecessor_blocks_even_when_target_has_started(self):
        self.vm(sequence=1, enforced=1, stime=2)
        self.previous()
        self.assertFalse(self.ready())

    def test_canceled_history_stays_blocked_until_final_marker_ack(self):
        self.vm(state=2, lcm=0, enforced=1, stime=1, etime=2)
        body = self.db.execute("SELECT body FROM history WHERE vid=7 AND seq=0").fetchone()[0]
        body = body.replace("</HISTORY>", "<ENFORCED_ADMISSION_CANCELING>1</ENFORCED_ADMISSION_CANCELING></HISTORY>")
        self.db.execute("UPDATE history SET body=? WHERE vid=7 AND seq=0", (body,))
        self.assertFalse(self.ready())

    def test_missing_canonical_predecessor_fails_closed(self):
        self.vm(sequence=1, enforced=1, stime=2)
        self.assertFalse(self.ready())

    def test_generic_plan_identity_uses_the_same_inflight_gate(self):
        self.vm(sequence=1, action_generation="b" * 64, stime=2)
        self.previous()
        self.assertFalse(self.ready())

    def test_unreferenced_pending_after_stable_enforced_history_is_ignored(self):
        self.vm(sequence=1, enforced=1, stime=2)
        self.previous(etime=2)
        self.previous(sequence=2, etime=0)
        self.assertTrue(self.ready())

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

    def snapshot(self):
        return {
            "schema": "onedrs.native-db-snapshot/v1", "backend": "mysql",
            "transaction": {"isolation": "REPEATABLE-READ", "read_only": True,
                            "consistent_snapshot": True, "server_version": "test"},
            "vm_rows": self.db.execute("SELECT oid,state,lcm_state,body FROM vm_pool").fetchall(),
            "plan_rows": self.db.execute("SELECT cid,state,body FROM plan_pool").fetchall(),
            "history_rows": self.db.execute("SELECT vid,seq,body FROM history").fetchall(),
        }

    def test_backend_independent_rows_match_sqlite_policy(self):
        self.vm(sequence=1, enforced=1)
        self.previous()
        snapshot = self.snapshot()
        self.assertEqual(inspect_connection(self.db), inspect_rows(
            snapshot["vm_rows"], snapshot["plan_rows"], snapshot["history_rows"]))

    def test_row_loader_rejects_duplicate_or_malformed_identities(self):
        self.vm()
        rows = self.snapshot()
        with self.assertRaises(InvalidState):
            inspect_rows(rows["vm_rows"] * 2, [], rows["history_rows"])
        with self.assertRaises(InvalidState):
            inspect_rows([["7", 3, 3, rows["vm_rows"][0][-1]]], [], rows["history_rows"])
        with self.assertRaises(InvalidState):
            inspect_rows(rows["vm_rows"], [], rows["history_rows"] * 2)

    def test_protected_mysql_snapshot_uses_identical_policy_without_xml_output(self):
        self.vm(sequence=1, enforced=1)
        self.previous()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.json"
            path.write_text(json.dumps(self.snapshot()))
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            result = inspect_snapshot(path)
            self.assertFalse(result["database_ready_for_older_binary"])
            self.assertEqual(result["blockers"], inspect_connection(self.db)["blockers"])
            self.assertEqual(result["source"]["snapshot_sha256"], before)
            self.assertNotIn("<VM>", json.dumps(result))
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)

    def test_snapshot_missing_tables_or_transaction_provenance_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.json"
            for key in ("vm_rows", "plan_rows", "history_rows", "transaction"):
                snapshot = self.snapshot()
                del snapshot[key]
                path.write_text(json.dumps(snapshot))
                with self.subTest(key=key), self.assertRaises(InvalidState):
                    inspect_snapshot(path)
            snapshot = self.snapshot()
            snapshot["transaction"]["read_only"] = False
            path.write_text(json.dumps(snapshot))
            with self.assertRaises(InvalidState):
                inspect_snapshot(path)

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
