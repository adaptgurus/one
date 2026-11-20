#!/usr/bin/python3
"""Exercise the real R8 -> vendor R14 -> R8 -> R14 SQLite/XML-RPC contract.
Only a fresh dedicated private prefix with isolated mount, PID and network
namespaces is allowed. No host or VM is registered. All daemon exits must be 0.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import xmlrpc.client

D = Path(sys.argv[1]).resolve()
if D.parent != Path("/root") or not D.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("Dedicated private test directory required")
P, OUT = D / "prefix", D / "evidence"
if (P / "var/one.db").exists() or (OUT / "runtime-result.json").exists():
    raise SystemExit("Fresh database and output directory required")
for kind, original in json.loads((D / "host-namespaces.json").read_text()).items():
    if kind not in ("mnt", "net", "pid") or os.readlink("/proc/self/ns/" + kind) == original:
        raise SystemExit("Private mount, PID and network namespaces required")
subprocess.run(["mount", "--make-rprivate", "/"], check=True)
subprocess.run(["ip", "link", "set", "lo", "up"], check=True)
links = json.loads(subprocess.check_output(["ip", "-j", "link", "show"], text=True))
routes = json.loads(subprocess.check_output(["ip", "-j", "route", "show"], text=True))
if len(links) != 1 or links[0]["ifname"] != "lo" or routes:
    raise SystemExit("Loopback-only networking required")
for source, target in [(P/"var", "/var/lib/one"), (P/"etc", "/etc/one"), (P/"log", "/var/log/one")]:
    subprocess.run(["mount", "--bind", str(source), target], check=True)
AUTH = (P / "var/.one/one_auth").read_text().strip()
ENV = {"PATH":"/usr/sbin:/usr/bin:/sbin:/bin", "LANG":"C.UTF-8",
       "ONE_LOCATION":str(P), "ONE_AUTH":str(P/"var/.one/one_auth"),
       "HOME":str(P/"home"), "ONE_MAD_DEBUG":"1"}
socket.setdefaulttimeout(3)
result = {"scope":"PRIVATE_VENDOR_R8_R14_R8_R14_NATIVE_DATABASE_AND_PLAN_COMPATIBILITY",
          "started_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "registered_hosts_and_vms":0, "steps":[], "checks":[]}
proc = None

def rpc(method, *args):
    with xmlrpc.client.ServerProxy("http://127.0.0.1:2633/RPC2") as api:
        response = getattr(api, method)(AUTH, *args)
    if response[0] is not True:
        raise AssertionError(method + ": " + str(response[1])[:200])
    return response[1]

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    result["checks"].append({"name":name, "result":"PASS"})
    print("PASS " + name, flush=True)

def start(label, name):
    global proc
    binary = D / name
    step = {"label":label, "binary_sha256":hashlib.sha256(binary.read_bytes()).hexdigest()}
    result["steps"].append(step)
    with (OUT / (label + "-stdout.log")).open("x") as output:
        proc = subprocess.Popen([str(binary), "-f"], cwd=P, env=ENV,
                                stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    limit = time.monotonic() + 35
    while time.monotonic() < limit:
        if proc.poll() is not None:
            raise AssertionError("Native daemon exited before readiness: " + label)
        try:
            step["version"] = rpc("one.system.version")
            break
        except (OSError, xmlrpc.client.Error):
            time.sleep(0.1)
    if "version" not in step:
        raise AssertionError("Native daemon readiness timeout: " + label)
    check(label + "_version_is_vendor_7_4_1", step["version"] == "7.4.1")
    check(label + "_executable_identity",
          Path("/proc/" + str(proc.pid) + "/exe").resolve() == binary.resolve())
    hosts = ET.fromstring(rpc("one.hostpool.info"))
    vms = ET.fromstring(rpc("one.vmpool.info", -2, -1, -1, -1))
    check(label + "_zero_hosts_and_vms", len(hosts.findall("HOST")) == len(vms.findall("VM")) == 0)

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
    result["steps"][-1]["shutdown_exit"] = proc.returncode
    check(result["steps"][-1]["label"] + "_clean_shutdown", proc.returncode == 0)
    proc = None

try:
    start("baseline_start", "baseline-oned")
    cid = int(rpc("one.cluster.allocate", "r14-private-database-compatibility"))
    rpc("one.cluster.update", cid,
        'ONE_DRS=[AUTOMATION="manual",POLICY="balance",ENABLED="no"]\nUNCHANGED_SENTINEL="baseline"', 1)
    initial = ET.fromstring(rpc("one.cluster.info", cid, False))
    initial_template = ET.tostring(initial.find("TEMPLATE"))
    stop()
    start("candidate_upgrade", "candidate-oned")
    current = ET.fromstring(rpc("one.cluster.info", cid, False))
    check("candidate_reads_original_cluster_template", ET.tostring(current.find("TEMPLATE")) == initial_template)
    template_sha = current.findtext("TEMPLATE_SHA256")
    rpc("one.cluster.updatedrschecked", cid,
        'ONE_DRS=[AUTOMATION="manual",POLICY="pack",ENABLED="no"]', template_sha)
    current = ET.fromstring(rpc("one.cluster.info", cid, False))
    check("candidate_checked_policy_write_preserves_unrelated_attributes",
          current.findtext("TEMPLATE/UNCHANGED_SENTINEL") == "baseline")
    template_sha = current.findtext("TEMPLATE_SHA256")
    plan_xml = ('<PLAN><ID>' + str(cid) + '</ID><TEMPLATE_SHA256>' + template_sha +
                '</TEMPLATE_SHA256><ACTION><ID>0</ID><VM_ID>999999</VM_ID><STATE>0</STATE>'
                '<OPERATION>migrate</OPERATION><HOST_ID>999999</HOST_ID><DS_ID>0</DS_ID>'
                '<TIMESTAMP>0</TIMESTAMP></ACTION></PLAN>')
    target = P / "var/checked-api-fixture" / (secrets.token_hex(8) + ".json")
    pending = target.with_suffix(".tmp")
    pending.write_text(json.dumps({"cid":cid, "xml":plan_xml}))
    pending.replace(target)
    limit = time.monotonic() + 8
    while time.monotonic() < limit:
        current = ET.fromstring(rpc("one.cluster.info", cid, False))
        if current.findtext("PLAN/GENERATION"):
            break
        time.sleep(0.05)
    generation = current.findtext("PLAN/GENERATION")
    plan_sha = current.findtext("PLAN_SHA256")
    check("candidate_persists_generated_policy_bound_plan",
          bool(generation) and current.findtext("PLAN/STATE") == "0" and
          current.findtext("PLAN/TEMPLATE_SHA256") == template_sha)
    stop()
    start("baseline_rollback", "baseline-oned")
    rollback = ET.fromstring(rpc("one.cluster.info", cid, False))
    check("original_reads_candidate_checked_policy",
          rollback.findtext("TEMPLATE/ONE_DRS/POLICY") == "pack" and
          rollback.findtext("TEMPLATE/UNCHANGED_SENTINEL") == "baseline")
    check("original_reads_candidate_extended_plan",
          rollback.findtext("PLAN/STATE") == "0" and
          rollback.findtext("PLAN/ACTION/VM_ID") == "999999" and
          rollback.findtext("PLAN/ACTION/OPERATION") == "migrate")
    rpc("one.cluster.update", cid, 'ROLLBACK_NATIVE_WRITE="accepted"', 1)
    stop()
    start("candidate_reupgrade", "candidate-oned")
    reupgrade = ET.fromstring(rpc("one.cluster.info", cid, False))
    check("candidate_reads_original_write_after_rollback",
          reupgrade.findtext("TEMPLATE/ROLLBACK_NATIVE_WRITE") == "accepted")
    check("plan_generation_and_digest_survive_legacy_readback_and_restart",
          reupgrade.findtext("PLAN/GENERATION") == generation and
          reupgrade.findtext("PLAN_SHA256") == plan_sha)
    check("policy_binding_detects_original_api_policy_change",
          reupgrade.findtext("TEMPLATE_SHA256") != template_sha and
          reupgrade.findtext("PLAN/TEMPLATE_SHA256") == template_sha)
    rpc("one.cluster.delete", cid)
    result["result"] = "PASS"
except BaseException as exc:
    result["result"] = "FAIL"
    result["error"] = str(exc).replace(AUTH, "<REDACTED>")
finally:
    try:
        stop()
    except BaseException as exc:
        result["result"] = "FAIL"
        result["shutdown_error"] = str(exc)
    result["ended_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (OUT / "runtime-result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k:v for k,v in result.items() if k != "checks"}, indent=2), flush=True)
if result["result"] != "PASS":
    raise SystemExit(1)
