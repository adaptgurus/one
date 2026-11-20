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


def inspect_rows(vm_rows, plan_rows, history_rows):
    """Inspect one consistent native database snapshot, independent of SQL backend.

    Rows are [oid,state,lcm_state,body], [cid,state,body], and [vid,seq,body].
    The caller must obtain every table in the same read-only consistent snapshot.
    Raw XML may contain workload secrets and must remain in protected local files.
    """
    def normalized(rows, width, key_width):
        result = []
        identities = set()
        for row in rows:
            if not isinstance(row, (tuple, list)) or len(row) != width:
                raise InvalidState("invalid native snapshot row shape")
            if any(type(value) is not int for value in row[:-1]):
                raise InvalidState("invalid native snapshot indexed integer")
            if not isinstance(row[-1], str):
                raise InvalidState("invalid native snapshot XML type")
            key = tuple(row[:key_width])
            if key in identities:
                raise InvalidState("duplicate native snapshot identity")
            identities.add(key)
            result.append(row)
        return result

    vm_rows = normalized(vm_rows, 4, 1)
    plan_rows = normalized(plan_rows, 3, 1)
    history_rows = normalized(history_rows, 3, 2)
    history_by_id = {(vid, seq): body for vid, seq, body in history_rows}

    def canonical_history(vid, sequence):
        body = history_by_id.get((vid, sequence))
        if body is None:
            raise InvalidState("canonical history row is missing")
        history = xml_document(body, "HISTORY")
        if integer(history, "SEQ") != sequence or integer(history, "OID") != vid:
            raise InvalidState("canonical history identity disagrees")
        return history

    blockers = []
    requests = []
    counts = {"vms": 0, "plans": 0, "canonical_histories": 0, "canonical_previous_histories": 0}

    def blocked(resource, ident, reason):
        blockers.append({"resource": resource, "id": ident, "reason": reason})

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
            if sequence < 0:
                raise InvalidState("invalid canonical history sequence")
            history = canonical_history(vid, sequence)
            counts["canonical_histories"] += 1
            pending = flag(history, "CHECKED_CAPACITY_PENDING")
            enforced = flag(history, "ENFORCE_CAPACITY")
            generations = [history.findtext(key, "") for key in
                           ("CHECKED_PLAN_GENERATION", "PLAN_ACTION_GENERATION")]
            for generation in generations:
                if generation and (len(generation) != 64 or any(c not in "0123456789abcdef" for c in generation)):
                    raise InvalidState("invalid native plan generation")
            guarded = enforced or any(generations)
            if pending:
                blocked("VM", vid, "native checked admission is pending")
            if state == 3 and lcm_state != 3 and guarded:
                blocked("VM", vid, "checked or enforced operation has not reached a stable native state")
            if guarded:
                # Native migrate publishes target history before enqueueing LCM.
                # At that point the VM can still be RUNNING, POWEROFF, or SUSPENDED.
                # Only the predecessor of the canonical current history matters:
                # an unreferenced failed insert must never masquerade as a request.
                if sequence > 0:
                    previous = canonical_history(vid, sequence - 1)
                    counts["canonical_previous_histories"] += 1
                    if integer(previous, "ETIME") == 0:
                        blocked("VM", vid, "canonical previous history is still open before final admission or completion")
                # Initial deploy has no predecessor. Its history is published
                # before LCM initializes STIME, so a stable VM enum alone is not
                # proof that the new enforcement semantics have been consumed.
                if integer(history, "ETIME") == 0 and integer(history, "STIME") == 0:
                    blocked("VM", vid, "canonical target history is published but native admission has not started")
        except InvalidState as exc:
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
        "schema": 2,
        "scope": "READ_ONLY_NATIVE_DATABASE_DOWNGRADE_STATE_GATE",
        "database_ready_for_older_binary": not blockers,
        "required_call_phase": "after placement writers are frozen, replication synchronized, and controller stopped",
        "counts": counts,
        "blockers": blockers,
        "request_metadata_to_retain": requests,
        "request_metadata_note": "R8 can discard unknown terminal request metadata when it rewrites a plan; retain this report externally.",
    }


def inspect_connection(connection):
    try:
        vm_rows = connection.execute("SELECT oid,state,lcm_state,body FROM vm_pool").fetchall()
        plan_rows = connection.execute("SELECT cid,state,body FROM plan_pool").fetchall()
        history_rows = connection.execute("SELECT vid,seq,body FROM history").fetchall()
    except sqlite3.DatabaseError as exc:
        raise InvalidState("required native pool schema is unavailable") from exc
    return inspect_rows(vm_rows, plan_rows, history_rows)


def inspect_snapshot(path):
    path = Path(path).resolve(strict=True)
    raw = path.read_bytes()
    try:
        snapshot = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise InvalidState("unreadable native row snapshot") from exc
    if not isinstance(snapshot, dict) or snapshot.get("schema") != "onedrs.native-db-snapshot/v1":
        raise InvalidState("unsupported native row snapshot schema")
    if snapshot.get("backend") not in ("mysql", "mariadb", "sqlite"):
        raise InvalidState("unsupported native snapshot backend")
    if any(not isinstance(snapshot.get(key), list) for key in ("vm_rows", "plan_rows", "history_rows")):
        raise InvalidState("native row snapshot is missing a complete table")
    transaction = snapshot.get("transaction")
    if not isinstance(transaction, dict) or transaction.get("read_only") is not True or transaction.get("consistent_snapshot") is not True:
        raise InvalidState("native row snapshot lacks read-only consistent transaction provenance")
    result = inspect_rows(snapshot["vm_rows"], snapshot["plan_rows"], snapshot["history_rows"])
    result["source"] = {
        "backend": snapshot["backend"],
        "snapshot_sha256": hashlib.sha256(raw).hexdigest(),
        "transaction": {key: transaction[key] for key in (
            "isolation", "read_only", "consistent_snapshot", "server_version",
            "server_id", "wsrep_status", "started_utc", "ended_utc") if key in transaction},
    }
    return result


def inspect_database(path):
    path = Path(path).resolve(strict=True)
    uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=5) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        return inspect_connection(connection)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--database", help="stopped controller's native SQLite database or immutable snapshot")
    source.add_argument("--snapshot", help="protected read-only native row snapshot in onedrs.native-db-snapshot/v1 format")
    args = parser.parse_args()
    try:
        result = inspect_database(args.database) if args.database else inspect_snapshot(args.snapshot)
    except (OSError, sqlite3.DatabaseError, InvalidState) as exc:
        result = {"database_ready_for_older_binary": False, "error": str(exc)}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["database_ready_for_older_binary"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
