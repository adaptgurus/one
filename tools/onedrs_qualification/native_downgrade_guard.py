#!/usr/bin/env python3
"""Read-only native state gate before starting a pre-checked-admission binary.

The rollout caller must freeze placement/plan writers, synchronize replication,
stop the controller, and retain this report before invoking a package downgrade.
A successful database snapshot is not a lock against a future writer. This tool
never stops services, edits the database, changes packages, or executes a guest
operation. Canonical history is selected through the VM body, not by taking the
largest row in history (which can be an unreferenced failed insert).
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import xml.etree.ElementTree as ET
from urllib.parse import quote


class InvalidState(ValueError):
    pass


def xml_document(body, expected):
    try:
        root = ET.fromstring(body)
    except (ET.ParseError, TypeError) as exc:
        raise InvalidState("unreadable native XML") from exc
    if root.tag != expected:
        raise InvalidState("unexpected native XML root")
    return root


def integer(root, path, default=None):
    value = root.findtext(path)
    if value is None and default is not None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError) as exc:
        raise InvalidState("invalid native integer: " + path) from exc


def flag(root, path):
    value = root.findtext(path, "0")
    if value not in ("0", "1"):
        raise InvalidState("invalid native flag: " + path)
    return value == "1"


def inspect_connection(connection):
    blockers = []
    requests = []
    counts = {"vms": 0, "plans": 0, "canonical_histories": 0}

    def blocked(resource, ident, reason):
        blockers.append({"resource": resource, "id": ident, "reason": reason})

    try:
        vm_rows = connection.execute("SELECT oid,state,lcm_state,body FROM vm_pool").fetchall()
        plan_rows = connection.execute("SELECT cid,state,body FROM plan_pool").fetchall()
    except sqlite3.DatabaseError as exc:
        raise InvalidState("required native pool schema is unavailable") from exc

    for vid, state, lcm_state, body in vm_rows:
        counts["vms"] += 1
        try:
            vm = xml_document(body, "VM")
            if integer(vm, "ID") != vid or integer(vm, "STATE") != state or integer(vm, "LCM_STATE") != lcm_state:
                raise InvalidState("VM body and indexed state disagree")
            if lcm_state == 72:
                blocked("VM", vid, "CHECKED_MIGRATE_PENDING is not understood by the older binary")
            histories = vm.findall("HISTORY_RECORDS/HISTORY")
            if not histories:
                continue
            current = max(histories, key=lambda item: integer(item, "SEQ"))
            sequence = integer(current, "SEQ")
            row = connection.execute("SELECT body FROM history WHERE vid=? AND seq=?", (vid, sequence)).fetchone()
            if row is None:
                raise InvalidState("canonical history row is missing")
            history = xml_document(row[0], "HISTORY")
            if integer(history, "SEQ") != sequence or integer(history, "OID") != vid:
                raise InvalidState("canonical history identity disagrees")
            counts["canonical_histories"] += 1
            pending = flag(history, "CHECKED_CAPACITY_PENDING")
            enforced = flag(history, "ENFORCE_CAPACITY")
            generation = history.findtext("CHECKED_PLAN_GENERATION", "")
            if generation and (len(generation) != 64 or any(c not in "0123456789abcdef" for c in generation)):
                raise InvalidState("invalid native checked generation")
            if pending:
                blocked("VM", vid, "native checked admission is pending")
            if state == 3 and lcm_state != 3 and (enforced or generation):
                blocked("VM", vid, "checked or enforced operation has not reached a stable native state")
        except (InvalidState, sqlite3.DatabaseError) as exc:
            blocked("VM", vid, str(exc))

    for cid, state, body in plan_rows:
        counts["plans"] += 1
        try:
            plan = xml_document(body, "PLAN")
            if integer(plan, "ID") != cid or integer(plan, "STATE") != state:
                raise InvalidState("plan body and indexed state disagree")
            if state not in (-1, 0, 1, 2, 3, 4):
                raise InvalidState("unknown native plan state")
            if state == 1:
                blocked("PLAN", cid, "plan is APPLYING and must be drained or reconciled")
            request = plan.find("REQUEST")
            if request is None:
                continue
            action = request.findtext("ACTION", "")
            request_state = request.findtext("STATE", "")
            summary = {key: request.findtext(key, "") for key in (
                "NONCE", "ACTION", "STATE", "TEMPLATE_SHA256", "BASE_PLAN_SHA256",
                "PLAN_GENERATION", "INSTANCE", "STARTED_AT")}
            error = request.findtext("ERROR", "")
            summary["error_sha256"] = hashlib.sha256(error.encode()).hexdigest()
            summary["cluster_id"] = cid
            requests.append(summary)
            terminal = ((action == "GENERATE" and request_state in ("READY", "NOOP", "ERROR")) or
                        (action == "REJECT" and request_state in ("REJECTED", "ERROR")))
            if not terminal:
                blocked("PLAN_REQUEST", cid, "request is active or has an unknown state: " + request_state)
        except InvalidState as exc:
            blocked("PLAN", cid, str(exc))

    return {
        "schema": 1,
        "scope": "READ_ONLY_NATIVE_DATABASE_DOWNGRADE_STATE_GATE",
        "database_ready_for_older_binary": not blockers,
        "required_call_phase": "after placement writers are frozen, replication synchronized, and controller stopped",
        "counts": counts,
        "blockers": blockers,
        "request_metadata_to_retain": requests,
        "request_metadata_note": "R8 can discard unknown terminal request metadata when it rewrites a plan; retain this report externally.",
    }


def inspect_database(path):
    path = Path(path).resolve(strict=True)
    uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=5) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        return inspect_connection(connection)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, help="stopped controller's native SQLite database or immutable snapshot")
    args = parser.parse_args()
    try:
        result = inspect_database(args.database)
    except (OSError, sqlite3.DatabaseError, InvalidState) as exc:
        result = {"database_ready_for_older_binary": False, "error": str(exc)}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["database_ready_for_older_binary"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
