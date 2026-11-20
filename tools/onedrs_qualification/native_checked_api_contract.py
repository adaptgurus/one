#!/usr/bin/python3
"""Native XML-RPC approval/CAS contracts in a disposable namespace-only daemon.

Requires a freshly copied private prefix, freshly generated test credentials, a
compiled candidate, and distinct mount/PID/network namespaces. It never targets
a real endpoint and never registers a host or VM. A test-only scheduler MAD
supplies controlled plans to the real native PlanManager through its protocol.
"""
from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import os
import re
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ET
import xmlrpc.client

D = Path(sys.argv[1]).resolve()
if D.parent != Path("/root") or not D.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("Requires a dedicated private runtime directory")
P, OUT = D / "prefix", D / "evidence"
if (OUT / "runtime-result.json").exists() or (P / "var/one.db").exists():
    raise SystemExit("Refusing to overwrite an existing private execution")
host_ns = json.loads((D / "host-namespaces.json").read_text())
for kind in ("mnt", "net", "pid"):
    if os.readlink("/proc/self/ns/" + kind) == host_ns[kind]:
        raise SystemExit("A private " + kind + " namespace is required")
subprocess.run(["mount", "--make-rprivate", "/"], check=True)
subprocess.run(["ip", "link", "set", "lo", "up"], check=True)
links = json.loads(subprocess.check_output(["ip", "-j", "link", "show"], text=True))
routes = json.loads(subprocess.check_output(["ip", "-j", "route", "show"], text=True))
if len(links) != 1 or links[0]["ifname"] != "lo" or routes:
    raise SystemExit("Requires loopback-only networking with no routes")
for source, target in [(P / "var", "/var/lib/one"), (P / "etc", "/etc/one"), (P / "log", "/var/log/one")]:
    subprocess.run(["mount", "--bind", str(source), target], check=True)
AUTH = (P / "var/.one/one_auth").read_text().strip()
DENIED_PASSWORD = secrets.token_urlsafe(32)
DENIED_AUTH = "onedrs-denied:" + DENIED_PASSWORD
ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8",
       "ONE_LOCATION": str(P), "ONE_AUTH": str(P / "var/.one/one_auth"),
       "HOME": str(P / "home"), "ONE_MAD_DEBUG": "1"}
socket.setdefaulttimeout(4)
RESULT = {"scope": "PRIVATE_NATIVE_XMLRPC_CAS_AND_AUTHORIZATION_NO_HOSTS_OR_VMS",
          "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "binary_sha256": hashlib.sha256((D / "candidate-oned").read_bytes()).hexdigest(),
          "private_namespaces": ["mount", "network", "pid"], "checks": []}
proc = None
cid = None
uid = None

def rpc(method, *args, session=None):
    with xmlrpc.client.ServerProxy("http://127.0.0.1:2633/RPC2", allow_none=True) as api:
        return getattr(api, method)(AUTH if session is None else session, *args)

def ok(method, *args, session=None):
    reply = rpc(method, *args, session=session)
    if not reply[0]:
        raise AssertionError(method + " failed: " + str(reply[1])[:300])
    return reply[1]

def check(name, condition, **detail):
    if not condition:
        raise AssertionError(name)
    RESULT["checks"].append({"name": name, "result": "PASS", **detail})
    print("PASS " + name, flush=True)

def rejected(name, method, *args, session=None, contains=None, code=None):
    reply = rpc(method, *args, session=session)
    check(name, reply[0] is False and
          (contains is None or contains.lower() in str(reply[1]).lower()) and
          (code is None or reply[2] == code),
          error_code=reply[2])
    return reply

def cluster():
    return ET.fromstring(ok("one.cluster.info", cid, False))

def digest():
    return cluster().findtext("TEMPLATE_SHA256")

def plan_sha():
    return cluster().findtext("PLAN_SHA256")

def empty_fleet():
    hosts = ET.fromstring(ok("one.hostpool.info"))
    vms = ET.fromstring(ok("one.vmpool.info", -2, -1, -1, -1))
    return len(hosts.findall("HOST")) == len(vms.findall("VM")) == 0

def start(label):
    global proc
    with (OUT / (label + "-stdout.log")).open("w") as output:
        proc = subprocess.Popen([str(D / "candidate-oned"), "-f"], cwd=P, env=ENV,
                                stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    limit = time.monotonic() + 30
    while time.monotonic() < limit:
        if proc.poll() is not None:
            raise AssertionError("Private native daemon exited before readiness")
        try:
            version = ok("one.system.version")
            check(label + "_authenticated_native_api", bool(version), version=version)
            check(label + "_zero_hosts_and_vms", empty_fleet())
            return
        except (ConnectionError, OSError, xmlrpc.client.Error):
            time.sleep(0.2)
    raise AssertionError("Private native daemon readiness timed out")

def stop():
    global proc
    if proc is None:
        return
    if proc.poll() is None:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=25)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=5)
    RESULT.setdefault("shutdown_exit_codes", []).append(proc.returncode)
    if proc.returncode != 0:
        raise AssertionError("Native daemon shutdown was not clean")
    proc = None

def plan_xml(template_hash, operation="migrate", host=999999):
    binding = "" if template_hash is None else "<TEMPLATE_SHA256>" + template_hash + "</TEMPLATE_SHA256>"
    return ("<PLAN><ID>" + str(cid) + "</ID>" + binding +
            "<ACTION><ID>0</ID><VM_ID>999999</VM_ID><STATE>0</STATE>"
            "<OPERATION>" + operation + "</OPERATION><HOST_ID>" + str(host) + "</HOST_ID>"
            "<DS_ID>0</DS_ID><TIMESTAMP>0</TIMESTAMP>"
            "<NIC><NIC_ID>0</NIC_ID><NETWORK_ID>12345</NETWORK_ID></NIC></ACTION></PLAN>")

def emit_plan(template_hash, operation="migrate", host=999999, expect_new=True):
    before = cluster().findtext("PLAN/GENERATION")
    xml = plan_xml(template_hash, operation, host)
    queue = P / "var/checked-api-fixture"
    path = queue / (secrets.token_hex(8) + ".json")
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"cid": cid, "xml": xml}))
    tmp.replace(path)
    if not expect_new:
        return before
    limit = time.monotonic() + 8
    while time.monotonic() < limit:
        state = cluster()
        generation = state.findtext("PLAN/GENERATION")
        if generation and generation != before:
            return state
        time.sleep(0.05)
    raise AssertionError("Native scheduler fixture response was not accepted")

def parallel_calls(method, args_list):
    barrier = threading.Barrier(len(args_list))
    def invoke(args):
        barrier.wait(timeout=5)
        return rpc(method, *args)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(args_list)) as pool:
        return list(pool.map(invoke, args_list))

POLICY_BALANCE = 'ONE_DRS=[AUTOMATION="manual",POLICY="balance",ENABLED="yes"]'
POLICY_PACK = 'ONE_DRS=[AUTOMATION="manual",POLICY="pack",ENABLED="yes"]'
try:
    start("first-start")
    cid = int(ok("one.cluster.allocate", "checked-api-disposable"))
    ok("one.cluster.update", cid, 'UNRELATED_SENTINEL="preserve-me"\n' + POLICY_BALANCE, 1)
    uid = int(ok("one.user.allocate", "onedrs-denied", DENIED_PASSWORD, "core", [1]))
    initial = cluster()
    h0 = initial.findtext("TEMPLATE_SHA256")
    check("native_template_identity_available", bool(re.fullmatch("[0-9a-f]{64}", h0 or "")))
    for method in ["optimize", "planexecute", "plandelete"]:
        rejected("non_admin_" + method, "one.cluster." + method, cid,
                 session=DENIED_AUTH, code=0x200)
    rejected("non_admin_checked_policy", "one.cluster.updatedrschecked", cid, POLICY_PACK, h0,
             session=DENIED_AUTH, code=0x200)
    rejected("non_admin_checked_execute", "one.cluster.planexecutechecked", cid, "a" * 64, h0,
             session=DENIED_AUTH, code=0x200)
    check("authorization_denials_preserve_template", digest() == h0)
    for token in ["", "a" * 63, "A" * 64, "z" * 64]:
        rejected("malformed_identity_" + str(len(token)) + "_" + token[:1],
                 "one.cluster.updatedrschecked", cid, POLICY_PACK, token, code=0x1000)
    rejected("exact_checked_arity", "one.cluster.updatedrschecked", cid, POLICY_PACK, code=0x1000)
    rejected("unrelated_attribute_injection", "one.cluster.updatedrschecked", cid,
             POLICY_PACK + '\nUNRELATED_SENTINEL="changed"', h0, code=0x1000)
    rejected("duplicate_policy_vectors", "one.cluster.updatedrschecked", cid,
             POLICY_PACK + "\n" + POLICY_BALANCE, h0, code=0x1000)
    rejected("scalar_policy", "one.cluster.updatedrschecked", cid, 'ONE_DRS="invalid"', h0, code=0x1000)
    rejected("checked_policy_cannot_enable_automatic_execution", "one.cluster.updatedrschecked",
             cid, 'ONE_DRS=[AUTOMATION="full",POLICY="balance"]', h0, code=0x1000)
    check("invalid_updates_preserve_template", digest() == h0)
    ok("one.cluster.updatedrschecked", cid, POLICY_PACK, h0)
    h1 = digest()
    check("checked_policy_update_preserves_unrelated_attributes",
          h1 != h0 and cluster().findtext("TEMPLATE/UNRELATED_SENTINEL") == "preserve-me")
    rejected("stale_policy_update", "one.cluster.updatedrschecked", cid, POLICY_BALANCE, h0,
             contains="template changed")
    replies = parallel_calls("one.cluster.updatedrschecked",
                             [(cid, POLICY_BALANCE, h1),
                              (cid, 'ONE_DRS=[AUTOMATION="manual",POLICY="pack",ENABLED="no"]', h1)])
    check("concurrent_policy_updates_have_one_winner", sum(bool(x[0]) for x in replies) == 1)
    ok("one.cluster.updatedrschecked", cid, POLICY_BALANCE, digest())
    h = digest()
    first = emit_plan(h)
    g1, p1 = first.findtext("PLAN/GENERATION"), first.findtext("PLAN_SHA256")
    check("native_plan_generation_and_policy_binding",
          bool(re.fullmatch("[0-9a-f]{64}", g1 or "")) and first.findtext("PLAN/TEMPLATE_SHA256") == h)
    raw = ok("one.cluster.info", cid, False)
    (OUT / "native-cluster-ready.xml").write_text(raw + "\n")
    check("native_plan_nic_and_timestamp_readback",
          first.findtext("PLAN/ACTION/NIC/NIC_ID") == "0" and
          first.findtext("PLAN/ACTION/NIC/NETWORK_ID") == "12345" and
          first.findtext("PLAN/ACTION/TIMESTAMP") == "0")
    exact_plan = re.search(r"<PLAN>.*?</PLAN>", raw, re.S).group(0)
    check("plan_digest_matches_exact_native_xml",
          hashlib.sha256(exact_plan.encode()).hexdigest() == p1)
    second = emit_plan(h)
    g2, p2 = second.findtext("PLAN/GENERATION"), second.findtext("PLAN_SHA256")
    check("identical_plan_regeneration_changes_identity", g2 != g1 and p2 != p1)
    rejected("superseded_plan_approval", "one.cluster.planexecutechecked", cid, p1, h,
             contains="plan identity changed")
    check("stale_plan_did_not_apply", cluster().findtext("PLAN/STATE") == "0")
    ok("one.cluster.updatedrschecked", cid, POLICY_PACK, h)
    hnew = digest()
    rejected("approved_template_changed", "one.cluster.planexecutechecked", cid, p2, h,
             contains="template changed")
    rejected("old_plan_cannot_be_paired_with_new_policy", "one.cluster.planexecutechecked",
             cid, p2, hnew, contains="not computed")
    log = P / "var/oned.log"
    mark = log.stat().st_size
    emit_plan(h, expect_new=False)
    limit = time.monotonic() + 5
    while time.monotonic() < limit:
        if "Discarding optimization plan computed against a stale cluster template" in log.read_text()[mark:]:
            break
        time.sleep(0.05)
    check("stale_inflight_optimizer_response_rejected",
          cluster().findtext("PLAN/GENERATION") == g2 and
          "Discarding optimization plan computed against a stale cluster template" in log.read_text()[mark:])
    unsupported = emit_plan(hnew, operation="shutdown")
    rejected("opaque_power_action_cannot_use_checked_migration_approval",
             "one.cluster.planexecutechecked", cid, unsupported.findtext("PLAN_SHA256"), hnew,
             contains="only READY migration")
    current = emit_plan(hnew)
    p3 = current.findtext("PLAN_SHA256")
    g3 = current.findtext("PLAN/GENERATION")
    replies = parallel_calls("one.cluster.planexecutechecked",
                             [(cid, p3, hnew), (cid, p3, hnew)])
    check("concurrent_plan_execution_has_one_winner", sum(bool(x[0]) for x in replies) == 1)
    rejected("completed_or_active_plan_cannot_replay", "one.cluster.planexecutechecked",
             cid, p3, hnew)
    check("native_plan_lifecycle_keeps_generation", cluster().findtext("PLAN/GENERATION") == g3)
    limit = time.monotonic() + 5
    while time.monotonic() < limit and cluster().findtext("PLAN/STATE") == "1":
        time.sleep(0.05)
    check("fixture_missing_vm_fails_safely", cluster().findtext("PLAN/STATE") == "3")
    unbound = emit_plan(None)
    rejected("legacy_unbound_plan_refused_by_checked_path", "one.cluster.planexecutechecked",
             cid, unbound.findtext("PLAN_SHA256"), hnew, contains="not computed")
    check("authorized_legacy_optimize_signature_retained", rpc("one.cluster.optimize", cid)[0] is True)
    ok("one.cluster.planexecute", cid)
    check("authorized_legacy_execute_signature_retained", True)
    persisted = cluster().findtext("PLAN/GENERATION")
    stop()
    start("restart")
    check("native_generation_persists_across_restart", cluster().findtext("PLAN/GENERATION") == persisted)
    check("all_contracts_left_zero_hosts_and_vms", empty_fleet())
    ok("one.cluster.delete", cid)
    ok("one.user.delete", uid)
    cid = uid = None
    RESULT["result"] = "PASS"
except BaseException as exc:
    RESULT["result"] = "FAIL"
    RESULT["error"] = str(exc).replace(AUTH, "<REDACTED>").replace(DENIED_PASSWORD, "<REDACTED>")
finally:
    try:
        stop()
    except BaseException as exc:
        RESULT["result"] = "FAIL"
        RESULT["shutdown_error"] = str(exc)
    RESULT["ended_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (OUT / "runtime-result.json").write_text(json.dumps(RESULT, indent=2) + "\n")
    print(json.dumps({k:v for k,v in RESULT.items() if k != "checks"}, indent=2), flush=True)
if RESULT["result"] != "PASS":
    raise SystemExit(1)
