#!/usr/bin/python3
"""Private native generation and unconsumed-admission reconciliation contracts.

run(ctx) extends native_capacity_contract without duplicating its namespace,
fresh-resource, or driver isolation. Only native-written captured rows are used
to reconstruct an API-commit crash image; no guest driver payload is executed.
"""
import hashlib
import json
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import time
import xml.etree.ElementTree as ET


def run(ctx):
    globals().update({key: value for key, value in ctx.items() if not key.startswith("__")})
    # Earlier cold contracts deliberately change this native daemon setting.
    # Establish this companion's live-action fixture before its first restart.
    stop()
    conf = P / "etc/oned.conf"
    content, count = re.subn(r"(?m)^LIVE_RESCHEDS *=.*$", "LIVE_RESCHEDS = 1", conf.read_text())
    if count != 1:
        raise AssertionError("unique live/cold configuration required")
    conf.write_text(content)
    if SUITE == "origin-orphan":
        ordinary_orphan_contracts()
        return
    if SUITE == "origin-ledger":
        ordinary_ledger_gap_contracts()
        return
    if SUITE != "origin":
        generic_plan_contracts()
        protocol_binding_contracts()
    ordinary_gap_contracts()
    ordinary_ledger_gap_contracts()
    ordinary_orphan_contracts()


def generic_plan_contracts():
    reset_case("generic-plan-capacity")
    emit([(vms[0], target, ds), (vms[1], target, ds)])
    generation = cluster().findtext("PLAN/GENERATION")
    ok("one.cluster.planexecute", cid)
    waitfor(lambda: len(pending_calls()) == 1)
    vid = int(pending_calls()[0]["id"])
    h = hist(vm(vid))
    check("generic_planner_enforces_one_remaining_slot",
          ledger(target)["cpu"] == 200 and len(pending_calls()) == 1)
    check("generic_plan_identity_precedes_driver",
          h.findtext("PLAN_ACTION_GENERATION") == generation and
          h.findtext("CHECKED_PLAN_GENERATION", "") == "" and h.findtext("ENFORCE_CAPACITY") == "1")
    release_driver("MIGRATE", vid)
    waitfor(lambda: cluster().findtext("PLAN/STATE") == "3")
    check("generic_plan_one_done_one_refused",
          sorted(a.findtext("STATE") for a in cluster().findall("PLAN/ACTION")) == ["2", "3"])

    for outcome in ("SUCCESS", "FAILURE"):
        reset_case("generic-late-" + outcome.lower())
        controls(MIGRATE="HOLD", SHUTDOWN="HOLD")
        emit([(vms[0], target, ds)])
        old = cluster().findtext("PLAN/GENERATION")
        ok("one.cluster.planexecute", cid)
        waitfor(lambda: len(pending_calls()) == 1)
        set_plan_timestamp(int(time.time()) - 300)
        waitfor(lambda: cluster().findtext("PLAN/STATE") == "4")
        replacement = emit([(vms[1], source, ds)], operations=["poweroff"])
        new = replacement.findtext("PLAN/GENERATION")
        ok("one.cluster.planexecute", cid)
        waitfor(lambda: any(e["id"] == str(vms[1]) for e in events("vmm", "SHUTDOWN")))
        before = cluster().findtext("PLAN_SHA256")
        check("generic_late_" + outcome + "_replacement_is_actually_applying",
              new != old and cluster().findtext("PLAN/STATE") == "1" and
              hist(vm(vms[1])).findtext("PLAN_ACTION_GENERATION") == new)
        release_driver("MIGRATE", vms[0], outcome)
        waitfor(lambda: vm(vms[0]).findtext("LCM_STATE") == "3")
        check("generic_late_" + outcome + "_cannot_finish_reused_action_id",
              cluster().findtext("PLAN/STATE") == "1" and cluster().findtext("PLAN_SHA256") == before)
        release_driver("SHUTDOWN", vms[1])
        waitfor(lambda: cluster().findtext("PLAN/STATE") == "2")
        check("generic_poweroff_completion_uses_its_own_generation_" + outcome,
              vm(vms[1]).findtext("STATE") == "8" and
              hist(vm(vms[1])).findtext("PLAN_ACTION_GENERATION") == new)

    reset_case("generic-poweroff-history-write")
    controls(SHUTDOWN="HOLD")
    emit([(vms[0], source, ds)], operations=["poweroff"])
    install_failure("generic_poweroff_identity", "history", "UPDATE",
                    "NEW.vid=" + str(vms[0]) + " AND NEW.body LIKE '%<PLAN_ACTION_GENERATION>%' AND NEW.body NOT LIKE '%<PLAN_ACTION_GENERATION></PLAN_ACTION_GENERATION>%'")
    ok("one.cluster.planexecute", cid)
    waitfor(lambda: cluster().findtext("PLAN/STATE") == "1")
    time.sleep(.25)
    check("generic_poweroff_history_failure_blocks_driver",
          not events("vmm", "SHUTDOWN") and vm(vms[0]).findtext("LCM_STATE") == "3")
    remove_failure("generic_poweroff_identity")


def native_log_position():
    path = P / "var/oned.log"
    return path.stat().st_size if path.exists() else 0


def native_log_contains(text, position=0):
    path = P / "var/oned.log"
    if not path.exists():
        return False
    with path.open(errors="replace") as stream:
        stream.seek(position)
        return text in stream.read()


def protocol_binding_contracts():
    reset_case("protocol-resource-binding")
    emit([(vms[0], target, ds)])
    before = cluster().findtext("PLAN_SHA256")
    for operation, envelope in (("OPTIMIZE", cid + 1000), ("PLACE", -1)):
        plan = ET.Element("PLAN")
        ET.SubElement(plan, "ID").text = str(cid)
        ET.SubElement(plan, "TEMPLATE_SHA256").text = cluster().findtext("TEMPLATE_SHA256")
        action = ET.SubElement(plan, "ACTION")
        for key, value in (("ID", 0), ("VM_ID", vms[1]), ("STATE", 0),
                           ("OPERATION", "poweroff"), ("HOST_ID", source), ("DS_ID", ds)):
            ET.SubElement(action, key).text = str(value)
        queue = P / "var/checked-api-fixture"
        path = queue / (secrets.token_hex(10) + ".json")
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps({"operation": operation, "cid": envelope,
                                    "xml": ET.tostring(plan, encoding="unicode")}))
        position = native_log_position()
        temp.replace(path)
        waitfor(lambda: path.with_suffix(".sent").exists())
        waitfor(lambda: native_log_contains("Discarding scheduler response with invalid native resource identity", position))
        time.sleep(.1)
        check("protocol_" + operation.lower() + "_cannot_route_by_payload_cluster",
              cluster().findtext("PLAN_SHA256") == before and not events("vmm"))


def capture_api_gap(label, baseline=None, initial_vid=None, initial_sequence=0):
    reset_case("origin-capture-" + label, baseline)
    controls(MIGRATE="HOLD", TRANSFER="HOLD", DEPLOY="HOLD")
    vid = vms[0]
    expected_state, expected_lcm, sequence = 3, 3, 1
    if label == "poweroff":
        poweroff_source()
        expected_state, expected_lcm = 8, 0
    elif label.startswith("deploy"):
        vid = initial_vid if initial_vid is not None else int(ok("one.vm.allocate", 'NAME="origin-gap-deploy" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
        expected_state, expected_lcm, sequence = 2, 0, initial_sequence
    else:
        emit([(vid, target, ds)])
    tables = ("vm_pool", "history", "host_pool", "plan_pool")
    statements = ["DROP TABLE IF EXISTS captured_" + table + "; CREATE TABLE captured_" + table + " AS SELECT * FROM " + table + " WHERE 0;" for table in tables]
    condition = ("NEW.oid=" + str(vid) + " AND NEW.state=" + str(expected_state) +
                 " AND NEW.lcm_state=" + str(expected_lcm) +
                 " AND NEW.body LIKE '%<SEQ>" + str(sequence) + "</SEQ>%'" +
                 " AND NEW.body LIKE '%<HID>" + str(target) + "</HID>%'" +
                 " AND NEW.body LIKE '%<ENFORCE_CAPACITY>1</ENFORCE_CAPACITY>%'")
    statements.append("CREATE TRIGGER capture_native_generation_gap AFTER UPDATE ON vm_pool WHEN " + condition +
                      " AND (SELECT count(*) FROM captured_vm_pool)=0 BEGIN " +
                      " ".join("INSERT INTO captured_" + table + " SELECT * FROM " + table + ";" for table in tables) + " END;")
    execute_sql("\n".join(statements))
    if label == "live":
        ok("one.cluster.planexecute", cid)
    elif label == "poweroff":
        ok("one.vm.migrate", vid, target, False, True, ds, 0)
    else:
        ok("one.vm.deploy", vid, target, True, ds, "")
    stop(crash=True)
    image = D / ("ordinary-api-gap-" + label + ".db")
    with sqlite3.connect(DB) as con, sqlite3.connect(image) as out:
        con.backup(out)
    with sqlite3.connect(image) as con:
        count = con.execute("SELECT count(*) FROM captured_vm_pool").fetchone()[0]
        check("origin_" + label + "_captures_real_native_api_commit", count >= 3)
        con.execute("DROP TRIGGER capture_native_generation_gap")
        for table in tables:
            con.execute("DELETE FROM " + table)
            con.execute("INSERT INTO " + table + " SELECT * FROM captured_" + table)
        row = con.execute("SELECT state,lcm_state,body FROM vm_pool WHERE oid=?", (vid,)).fetchone()
        current = hist(ET.fromstring(row[2]))
        check("origin_" + label + "_durable_origin_matches_actual_state",
              row[:2] == (expected_state, expected_lcm) and current.findtext("STIME") == "0" and
              current.findtext("ENFORCED_ADMISSION_STATE") == str(expected_state) and
              current.findtext("ENFORCED_ADMISSION_LCM_STATE") == str(expected_lcm))
    image.chmod(0o600)
    RESULT.setdefault("ordinary_gap_images", []).append({
        "case": label, "vm": vid, "state": expected_state, "lcm_state": expected_lcm,
        "history_sequence": sequence, "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
        "origin": "native API transaction rows captured before LCM enqueue, restored without fabricated state"})
    return image, vid


def inject_old_callback(vid):
    path = F / ("callback-" + secrets.token_hex(8) + ".json")
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps({"mode": "vmm", "operation": "DEPLOY", "id": vid,
                               "result": "SUCCESS", "extra": "fixture-" + str(vid)}))
    position = log_position(vid)
    temp.replace(path)
    waitfor(lambda: path.with_suffix(".sent").exists())
    wait_native_error(position, "Ignoring driver callback before native capacity admission")


def ordinary_gap_contracts():
    snapshots = {}
    for label in ("live", "poweroff", "deploy"):
        snapshot, vid = capture_api_gap(label)
        snapshots[label] = (snapshot, vid)
        reset_case("origin-restart-" + label, snapshot)
        before = hist(vm(vid)).findtext("SEQ")
        if label == "live":
            generation = cluster().findtext("PLAN/GENERATION")
            inject_old_callback(vid)
            check("ordinary_api_gap_old_callback_cannot_finish_new_generation",
                  cluster().findtext("PLAN/STATE") == "1" and
                  cluster().findtext("PLAN/GENERATION") == generation and hist(vm(vid)).findtext("SEQ") == before)
        for operation in (1, 2, 3, 4, 5):
            check("origin_" + label + "_unsafe_recover_" + str(operation) + "_refused",
                  rpc("one.vm.recover", vid, operation)[0] is False)
        check("origin_" + label + "_power_action_refused",
              rpc("one.vm.action", "poweroff", vid)[0] is False)
        ok("one.vm.recover", vid, 0)
        restored = vm(vid)
        state, lcm = ((2, 0) if label == "deploy" else (8, 0) if label == "poweroff" else (3, 3))
        check("origin_" + label + "_native_recover_failure_restores_origin",
              restored.findtext("STATE") == str(state) and restored.findtext("LCM_STATE") == str(lcm))
        check("origin_" + label + "_no_driver_replay_and_target_released",
              not events("vmm") and not events("tm") and ledger(target)["cpu"] == 100)
        if label != "deploy":
            check("origin_" + label + "_source_accounting_retained",
                  hist(restored).findtext("HID") == str(source) and ledger(source)["cpu"] == 200)
        if label == "live":
            check("origin_cancellation_fails_only_its_own_plan", cluster().findtext("PLAN/STATE") == "3")
        if label == "deploy":
            stop()
            canceled = D / "ordinary-initial-canceled.db"
            snapshot_db(canceled)
            repeated, repeated_vid = capture_api_gap("deploy-repeat", canceled, vid, 1)
            reset_case("origin-repeat-cancel", repeated)
            ok("one.vm.recover", repeated_vid, 0)
            check("origin_second_initial_attempt_can_be_canceled_after_restart",
                  vm(vid).findtext("STATE") == "2" and hist(vm(vid)).findtext("SEQ") == "1" and
                  hist(vm(vid)).findtext("ENFORCED_ADMISSION_CANCELING") == "0" and not events("vmm"))
            controls(DEPLOY="SUCCESS")
            ok("one.vm.deploy", vid, target, True, ds, "")
            waitfor(lambda: is_running_on(vid, target))
            check("origin_initial_deployment_can_be_retried_natively",
                  hist(vm(vid)).findtext("SEQ") == "2" and len(events("vmm", "DEPLOY")) == 1)

    snapshot, vid = snapshots["live"]
    for label, table, kind, condition in [
        ("cancel-marker", "history", "UPDATE", "NEW.vid=" + str(vid) + " AND NEW.seq=1 AND NEW.body LIKE '%<ENFORCED_ADMISSION_CANCELING>1</ENFORCED_ADMISSION_CANCELING>%'"),
        ("target-history", "history", "UPDATE", "NEW.vid=" + str(vid) + " AND NEW.seq=1 AND NEW.etime>0"),
        ("source-history", "history", "UPDATE", "NEW.vid=" + str(vid) + " AND NEW.seq=0 AND NEW.etime>0"),
        ("restored-history", "history", "INSERT", "NEW.vid=" + str(vid) + " AND NEW.seq=2"),
        ("vm-state", "vm_pool", "UPDATE", "NEW.oid=" + str(vid) + " AND NEW.body LIKE '%<SEQ>2</SEQ>%'")
    ]:
        reset_case("ordinary-cancel-fault-" + label, snapshot, start_now=False)
        name = "ordinary_cancel_" + label.replace("-", "_")
        install_failure(name, table, kind, condition)
        start("ordinary-cancel-fault-" + label)
        check("ordinary_cancel_" + label + "_refuses_false_recovery_success",
              rpc("one.vm.recover", vid, 0)[0] is False and hist(vm(vid)).findtext("SEQ") == "1")
        check("ordinary_cancel_" + label + "_no_driver", not events("vmm") and not events("tm"))
        remove_failure(name)
        ok("one.vm.recover", vid, 0)
        check("ordinary_cancel_" + label + "_retry_restores_same_source_sequence",
              is_running_on(vid, source) and hist(vm(vid)).findtext("SEQ") == "2" and
              ledger(source)["cpu"] == 200 and ledger(target)["cpu"] == 100)
        with sqlite3.connect(DB) as con:
            seqs = [r[0] for r in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq", (vid,))]
        check("ordinary_cancel_" + label + "_no_orphan_sequence_growth", seqs == [0, 1, 2])

    snapshot, vid = snapshots["deploy"]
    for label, table, condition in [
        ("vm-state", "vm_pool", "NEW.oid=" + str(vid) + " AND NEW.state=2"),
        ("final-marker", "history", "NEW.vid=" + str(vid) + " AND NEW.seq=0 AND OLD.body LIKE '%<ENFORCED_ADMISSION_CANCELING>1</ENFORCED_ADMISSION_CANCELING>%' AND NEW.body LIKE '%<ENFORCED_ADMISSION_CANCELING>0</ENFORCED_ADMISSION_CANCELING>%'")
    ]:
        reset_case("initial-cancel-fault-" + label, snapshot, start_now=False)
        name = "initial_cancel_" + label.replace("-", "_")
        install_failure(name, table, "UPDATE", condition)
        start("initial-cancel-fault-" + label)
        check("initial_cancel_" + label + "_retains_recoverable_marker",
              rpc("one.vm.recover", vid, 0)[0] is False and
              hist(vm(vid)).findtext("ENFORCED_ADMISSION_CANCELING") == "1" and not events("vmm"))
        remove_failure(name)
        ok("one.vm.recover", vid, 0)
        check("initial_cancel_" + label + "_retry_restores_hold_without_dispatch",
              vm(vid).findtext("STATE") == "2" and
              hist(vm(vid)).findtext("ENFORCED_ADMISSION_CANCELING") == "0" and
              not events("vmm") and not events("tm"))


def capture_ledger_gap(label):
    reset_case("ledger-origin-capture-" + label)
    controls(MIGRATE="HOLD", TRANSFER="HOLD", DEPLOY="HOLD")
    vid = vms[0]
    if label == "offline-source-release":
        poweroff_source()
    if label == "initial-reserved":
        vid = int(ok("one.vm.allocate", 'NAME="reserved-origin-gap" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
    tables = ("vm_pool", "history", "host_pool", "plan_pool")
    capture_host, usage = (source, 100) if label == "offline-source-release" else (target, 200)
    sequence = 0 if label == "initial-reserved" else 1
    condition = ("NEW.oid=" + str(capture_host) + " AND NEW.body LIKE '%<CPU_USAGE>" + str(usage) + "</CPU_USAGE>%'" +
                 " AND EXISTS(SELECT 1 FROM history WHERE vid=" + str(vid) + " AND seq=" + str(sequence) +
                 " AND body LIKE '%<STIME>0</STIME>%')")
    statements = ["DROP TABLE IF EXISTS ledger_capture_" + table + "; CREATE TABLE ledger_capture_" + table + " AS SELECT * FROM " + table + " WHERE 0;" for table in tables]
    statements.append("CREATE TRIGGER capture_native_ledger_gap AFTER UPDATE ON host_pool WHEN " + condition +
                      " AND (SELECT count(*) FROM ledger_capture_vm_pool)=0 BEGIN " +
                      " ".join("INSERT INTO ledger_capture_" + table + " SELECT * FROM " + table + ";" for table in tables) + " END;")
    execute_sql("\n".join(statements))
    if label == "initial-reserved":
        ok("one.vm.deploy", vid, target, True, ds, "")
    else:
        ok("one.vm.migrate", vid, target, label == "live-target-reserved", True, ds, 0)
    def captured():
        with sqlite3.connect(DB) as con:
            return con.execute("SELECT count(*) FROM ledger_capture_vm_pool").fetchone()[0] >= 3
    waitfor(captured)
    stop(crash=True)
    image = D / ("ordinary-ledger-gap-" + label + ".db")
    with sqlite3.connect(DB) as con, sqlite3.connect(image) as out:
        con.backup(out)
    with sqlite3.connect(image) as con:
        con.execute("DROP TRIGGER capture_native_ledger_gap")
        for table in tables:
            con.execute("DELETE FROM " + table)
            con.execute("INSERT INTO " + table + " SELECT * FROM ledger_capture_" + table)
        body = con.execute("SELECT body FROM history WHERE vid=? AND seq=?", (vid, sequence)).fetchone()[0]
        current = ET.fromstring(body)
        check("ledger_origin_" + label + "_captured_before_history_admission",
              current.findtext("STIME") == "0" and current.findtext("ENFORCE_CAPACITY") == "1")
    image.chmod(0o600)
    RESULT.setdefault("ordinary_ledger_gap_images", []).append({
        "case": label, "vm": vid, "history_sequence": sequence,
        "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
        "origin": "native host transaction captured all canonical rows before history STIME and driver dispatch"})
    return image, vid


def ordinary_ledger_gap_contracts():
    images = {}
    for label in ("live-target-reserved", "offline-source-release", "initial-reserved"):
        image, vid = capture_ledger_gap(label)
        images[label] = (image, vid)
        reset_case("ledger-origin-restart-" + label, image)
        check("ledger_origin_" + label + "_actual_reserved_target",
              ledger(target)["cpu"] == 200 and ledger(source)["cpu"] == (100 if label == "offline-source-release" else 200))
        ok("one.vm.recover", vid, 0)
        expected_state = "2" if label == "initial-reserved" else "8" if label == "offline-source-release" else "3"
        check("ledger_origin_" + label + "_native_cancel_restores_ledger_and_origin",
              vm(vid).findtext("STATE") == expected_state and ledger(target)["cpu"] == 100 and
              ledger(source)["cpu"] == 200 and not events("vmm") and not events("tm"))

    image, vid = images["offline-source-release"]
    for label, hid, usage in (("target-release", target, 100), ("source-reservation", source, 200)):
        reset_case("ledger-cancel-fault-" + label, image, start_now=False)
        name = "ledger_cancel_" + label.replace("-", "_")
        install_failure(name, "host_pool", "UPDATE", "NEW.oid=" + str(hid) + " AND NEW.body LIKE '%<CPU_USAGE>" + str(usage) + "</CPU_USAGE>%'")
        start("ledger-cancel-fault-" + label)
        check("ledger_cancel_" + label + "_refuses_false_recovery_success",
              rpc("one.vm.recover", vid, 0)[0] is False and
              hist(vm(vid)).findtext("ENFORCED_ADMISSION_CANCELING") == "1" and
              hist(vm(vid)).findtext("SEQ") == "1" and not events("vmm") and not events("tm"))
        remove_failure(name)
        ok("one.vm.recover", vid, 0)
        check("ledger_cancel_" + label + "_idempotent_retry_restores_source",
              source_powered_off() and ledger(source)["cpu"] == 200 and ledger(target)["cpu"] == 100 and
              hist(vm(vid)).findtext("SEQ") == "2")

    reset_case("ledger-cancel-source-capacity-drift", image)
    h = host(source)
    put(h, "HOST_SHARE/MAX_CPU", 100)
    dbwrite("host_pool", source, h)
    check("ledger_cancel_source_capacity_drift_remains_unresolved",
          rpc("one.vm.recover", vid, 0)[0] is False and ledger(source)["cpu"] == 100 and ledger(target)["cpu"] == 100 and
          hist(vm(vid)).findtext("ENFORCED_ADMISSION_CANCELING") == "1" and not events("vmm") and not events("tm"))
    h = host(source)
    put(h, "HOST_SHARE/MAX_CPU", 800)
    dbwrite("host_pool", source, h)
    ok("one.vm.recover", vid, 0)
    check("ledger_cancel_source_capacity_retry_is_native_and_accounted",
          source_powered_off() and ledger(source)["cpu"] == 200 and ledger(target)["cpu"] == 100 and
          hist(vm(vid)).findtext("SEQ") == "2")


def ordinary_orphan_contracts():
    for label in ("migrate", "deploy"):
        reset_case("ordinary-orphan-" + label)
        vid = vms[0] if label == "migrate" else int(ok("one.vm.allocate", 'NAME="orphan-initial" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
        sequence = 1 if label == "migrate" else 0
        controls(MIGRATE="HOLD", DEPLOY="HOLD")
        name = "ordinary_orphan_" + label
        install_failure(name, "vm_pool", "UPDATE", "NEW.oid=" + str(vid) +
                        " AND NEW.body LIKE '%<SEQ>" + str(sequence) + "</SEQ>%'" +
                        " AND NEW.body LIKE '%<HID>" + str(target) + "</HID>%'")
        def request():
            return rpc("one.vm.migrate", vid, target, True, True, ds, 0) if label == "migrate" else rpc("one.vm.deploy", vid, target, True, ds, "")
        check("ordinary_orphan_" + label + "_failed_vm_publication_is_refused", request()[0] is False)
        with sqlite3.connect(DB) as con:
            row = con.execute("SELECT body FROM history WHERE vid=? AND seq=?", (vid, sequence)).fetchone()
        old = vm(vid)
        check("ordinary_orphan_" + label + "_unreferenced_history_has_no_dispatch",
              row is not None and ET.fromstring(row[0]).findtext("ENFORCE_CAPACITY") == "1" and
              (hist(old).findtext("SEQ") == "0" if label == "migrate" else old.find("HISTORY_RECORDS/HISTORY") is None) and
              ledger(source)["cpu"] == 200 and ledger(target)["cpu"] == 100 and not events("vmm") and not events("tm"))
        remove_failure(name)
        stop()
        start("ordinary-orphan-restart-" + label)
        check("ordinary_orphan_" + label + "_native_retry_reuses_unreferenced_sequence", request()[0] is True)
        operation = "MIGRATE" if label == "migrate" else "DEPLOY"
        waitfor(lambda: bool(events("vmm", operation)))
        release_driver(operation, vid)
        waitfor(lambda: is_running_on(vid, target))
        with sqlite3.connect(DB) as con:
            sequences = [r[0] for r in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq", (vid,))]
        check("ordinary_orphan_" + label + "_one_dispatch_no_sequence_growth",
              len(events("vmm", operation)) == 1 and hist(vm(vid)).findtext("SEQ") == str(sequence) and
              sequences == (list(range(sequence + 1))) and ledger(target)["cpu"] == 200)
