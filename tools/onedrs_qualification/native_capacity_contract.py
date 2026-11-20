#!/usr/bin/python3
"""Native checked-capacity contracts with disposable resources and inert drivers.
All database fixtures and faults are scoped to one loopback-only private daemon.
No driver payload is executed; these tests do not claim a hypervisor migration.
"""
from pathlib import Path
import concurrent.futures, datetime, hashlib, json, os, re, secrets, shutil, signal, socket, sqlite3, subprocess, sys, threading, time
import xml.etree.ElementTree as ET
import xmlrpc.client
D=Path(sys.argv[1]).resolve()
SUITE=sys.argv[2] if len(sys.argv)>2 else "all"
if SUITE not in ["all","live","cold","api-history","enforce","recovery","downgrade","generation","origin","origin-ledger","origin-orphan","legacy-red","callback-guard","pending-api","legacy-callback-boundary"]:raise SystemExit("unknown suite")
if D.parent!=Path("/root") or not D.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("dedicated private runtime required")
P=D/"prefix";OUT=D/"evidence";DB=P/"var/one.db";F=P/"var/capacity-fixture"
if (OUT/"capacity-result.json").exists() or DB.exists():raise SystemExit("fresh runtime required")
host_ns=json.loads((D/"host-namespaces.json").read_text())
for name in ["mnt","net","pid"]:
    if os.readlink("/proc/self/ns/"+name)==host_ns[name]:raise SystemExit("private "+name+" namespace required")
subprocess.run(["mount","--make-rprivate","/"],check=True)
subprocess.run(["ip","link","set","lo","up"],check=True)
links=json.loads(subprocess.check_output(["ip","-d","-j","address","show"],text=True))
routes=json.loads(subprocess.check_output(["ip","-j","route","show"],text=True))
# Linux creates this inert fallback in every namespace when ip_vti is loaded.
# It is permitted only with no address, no endpoint, no UP flag and no route.
def inert_fallback(link):
    info=link.get("linkinfo",{})
    return (link.get("ifname")=="ip_vti0" and link.get("operstate")=="DOWN" and
            "UP" not in link.get("flags",[]) and not link.get("addr_info") and
            info.get("info_kind")=="vti" and info.get("info_data")=={"remote":"any","local":"any"})
if routes or not any(x.get("ifname")=="lo" for x in links) or any(x.get("ifname")!="lo" and not inert_fallback(x) for x in links):
    raise SystemExit("private loopback-only networking required")
(OUT/"network-isolation.json").write_text(json.dumps({"links":links,"routes":routes,"host_namespaces_distinct":True},indent=2)+"\n")
for src,dst in [(P/"var","/var/lib/one"),(P/"etc","/etc/one"),(P/"log","/var/log/one")]:
    subprocess.run(["mount","--bind",str(src),dst],check=True)
AUTH=(P/"var/.one/one_auth").read_text().strip()
ENV={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LANG":"C.UTF-8","ONE_LOCATION":str(P),"ONE_AUTH":str(P/"var/.one/one_auth"),"HOME":str(P/"home"),"ONE_MAD_DEBUG":"1"}
socket.setdefaulttimeout(5)
RESULT={"scope":"PRIVATE_NATIVE_CAPACITY_AND_CRASH_CONTRACTS_WITH_INERT_DRIVERS","started_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"binary_sha256":hashlib.sha256((D/"candidate-oned").read_bytes()).hexdigest(),"checks":[],"shutdowns":[],"suite":SUITE}
proc=None
cid=source=target=ds=None
vms=[]
def rpc(method,*args):
    with xmlrpc.client.ServerProxy("http://127.0.0.1:2633/RPC2",allow_none=True) as api:return getattr(api,method)(AUTH,*args)
def ok(method,*args):
    reply=rpc(method,*args)
    if not reply[0]:raise AssertionError(method+" failed: "+str(reply[1])[:500])
    return reply[1]
def check(name,condition,**extra):
    if not condition:raise AssertionError(name)
    RESULT["checks"].append({"name":name,"result":"PASS",**extra})
    print("PASS "+name,flush=True)
def waitfor(fn,timeout=12):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        value=fn()
        if value:return value
        time.sleep(.05)
    raise AssertionError("timeout: "+getattr(fn,"__name__","condition"))
def start(label):
    global proc
    with (OUT/(label+"-stdout.log")).open("w") as out:
        proc=subprocess.Popen([str(D/"candidate-oned"),"-f"],cwd=P,env=ENV,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
    end=time.monotonic()+30
    while time.monotonic()<end:
        if proc.poll() is not None:raise AssertionError("native exited before readiness: "+label)
        try:
            version=ok("one.system.version")
            check(label+"_native_api",str(version).startswith("7.4.1"),version=version);return
        except (ConnectionError,OSError,xmlrpc.client.Error):time.sleep(.2)
    raise AssertionError("readiness timeout: "+label)
def stop(crash=False):
    global proc
    if proc is None:return
    if proc.poll() is None:
        if crash:os.killpg(proc.pid,signal.SIGKILL)
        else:proc.send_signal(signal.SIGTERM)
        try:proc.wait(timeout=25)
        except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
    exit_code=proc.returncode
    shutdown={"crash":crash,"exit_code":exit_code}
    # The packaged service removes its stale O_EXCL lock before a restart.
    # Reproduce that only for our reaped, intentionally killed private daemon;
    # never run the global pre_cleanup script or touch the installed lock.
    if crash:
        lock=P/"var/lock/.lock"
        if lock.exists():
            if lock.is_symlink() or not lock.is_file():raise AssertionError("unexpected private lock type")
            lock.unlink()
            shutdown["owned_private_stale_lock_removed"]=True
    RESULT["shutdowns"].append(shutdown)
    proc=None
    if not crash and exit_code!=0:raise AssertionError("unclean native stop")
def xml(method,*args):return ET.fromstring(ok(method,*args))
def vm(vid):return xml("one.vm.info",vid,False)
def host(hid):return xml("one.host.info",hid)
def cluster():return xml("one.cluster.info",cid,False)
def dbread(table,oid):
    with sqlite3.connect(DB,timeout=5) as con:
        return ET.fromstring(con.execute("SELECT body FROM "+table+" WHERE oid=?",(oid,)).fetchone()[0])
def dbwrite(table,oid,root,**cols):
    data={"body":ET.tostring(root,encoding="unicode"),**cols}
    with sqlite3.connect(DB,timeout=5) as con:
        con.execute("UPDATE "+table+" SET "+",".join(k+"=?" for k in data)+" WHERE oid=?",(*data.values(),oid))
def put(root,path,value):
    node=root.find(path)
    if node is None:
        parentpath,_,name=path.rpartition("/")
        parent=root.find(parentpath) if parentpath else root
        if parent is None:raise AssertionError("missing XML parent "+path)
        node=ET.SubElement(parent,name)
    node.text=str(value)
def hist(root):return max(root.findall("HISTORY_RECORDS/HISTORY"),key=lambda h:int(h.findtext("SEQ","-1")),default=None)
def native_driver_events():
    p=F/"driver.jsonl"
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []
def pending_calls(operation="MIGRATE"):
    return [e for e in native_driver_events() if e["mode"]=="vmm" and e["operation"]==operation]
def policy():return 'ONE_DRS=[AUTOMATION="manual",POLICY="balance",ENABLED="yes"]'
def capture_input():
    queue=P/"var/checked-api-fixture"
    existing={p.name for p in queue.glob("*.input.xml")}
    ok("one.cluster.optimize",cid)
    path=waitfor(lambda: next((p for p in queue.glob("*.input.xml") if p.name not in existing),None))
    data=path.read_bytes();root=ET.fromstring(data)
    candidates={}
    for node in root.findall("ONE_DRS_ELIGIBILITY/CANDIDATE"):
        key=(int(node.findtext("VM_ID")),int(node.findtext("HOST_ID")))
        digest=node.findtext("SHA256","")
        if key in candidates or not re.fullmatch("[0-9a-f]{64}",digest):raise AssertionError("invalid native input identity")
        candidates[key]=digest
    clusters=[x for x in root.findall("CLUSTER_POOL/CLUSTER") if x.findtext("ID")==str(cid)]
    if len(clusters)!=1:raise AssertionError("native input cluster missing")
    request={"candidates":candidates,"template_sha256":clusters[0].findtext("TEMPLATE_SHA256"),"input_sha256":hashlib.sha256(data).hexdigest()}
    check("captured_native_scheduler_input_"+path.stem,bool(candidates),input_sha256=request["input_sha256"])
    return request

def emit(actions, captured=None, allow_missing=False, operations=None):
    captured = captured or capture_input()
    before = cluster().findtext("PLAN/GENERATION")
    p = ET.Element("PLAN")
    ET.SubElement(p, "ID").text = str(cid)
    ET.SubElement(p, "TEMPLATE_SHA256").text = captured["template_sha256"]
    for ident, (vid, hid, dsid) in enumerate(actions):
        operation = operations[ident] if operations else "migrate"
        a = ET.SubElement(p, "ACTION")
        for tag, val in [("ID", ident), ("VM_ID", vid), ("STATE", 0), ("OPERATION", operation),
                         ("HOST_ID", hid), ("DS_ID", dsid), ("TIMESTAMP", 0)]:
            ET.SubElement(a, tag).text = str(val)
        if operation == "migrate":
            token = captured["candidates"].get((vid, hid))
            if token is None and not allow_missing:
                raise AssertionError("controlled plan target is absent from actual native optimizer input")
            if token is not None:
                ET.SubElement(a, "ELIGIBILITY_SHA256").text = token
    queue = P / "var/checked-api-fixture"
    dest = queue / (secrets.token_hex(8) + ".json")
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(json.dumps({"cid": cid, "xml": ET.tostring(p, encoding="unicode")}))
    tmp.replace(dest)
    def accepted():
        c = cluster()
        return c if c.findtext("PLAN/GENERATION") not in [None, "", before] else None
    return waitfor(accepted)

def apply():
    c=cluster()
    return rpc("one.cluster.planexecutechecked",cid,c.findtext("PLAN_SHA256"),c.findtext("TEMPLATE_SHA256"))

def reset_case(label, snapshot=None, start_now=True):
    stop()
    for path in [DB,Path(str(DB)+"-wal"),Path(str(DB)+"-shm")]:
        if path.exists():path.unlink()
    shutil.copy2(snapshot or D/"baseline.db",DB)
    for path in F.glob("*"):
        if path.name!="control.json":path.unlink()
    (F/"control.json").write_text(json.dumps({"MIGRATE":"HOLD"}))
    for path in (P/"var/checked-api-fixture").glob("*"):path.unlink()
    if start_now:start(label)
def ledger(hid):
    h=host(hid)
    return {"cpu":int(h.findtext("HOST_SHARE/CPU_USAGE")),
            "memory":int(h.findtext("HOST_SHARE/MEM_USAGE")),
            "ids":sorted(int(x.text) for x in h.findall("VMS/ID"))}
def sql_quote(text):return "'"+str(text).replace("'","''")+"'"
def execute_sql(statement):
    with sqlite3.connect(DB,timeout=5) as con:con.executescript(statement)
def install_failure(name,table,kind,condition):
    execute_sql("CREATE TRIGGER "+name+" BEFORE "+kind+" ON "+table+" WHEN "+condition+" BEGIN SELECT RAISE(ABORT,'capacity fixture "+name+"'); END;")
def remove_failure(name):execute_sql("DROP TRIGGER "+name+";")
def set_plan_timestamp(old_time):
    with sqlite3.connect(DB,timeout=5) as con:
        row=con.execute("SELECT body FROM plan_pool WHERE cid=?",(cid,)).fetchone()
        p=ET.fromstring(row[0])
        for node in p.findall("ACTION/TIMESTAMP"):node.text=str(old_time)
        con.execute("UPDATE plan_pool SET body=? WHERE cid=?",(ET.tostring(p,encoding="unicode"),cid))
def snapshot_db(path):
    if proc is not None:raise AssertionError("snapshot requires a stopped private daemon")
    with sqlite3.connect(DB) as con:
        with sqlite3.connect(path) as backup:con.backup(backup)
def release_driver(operation,vid,result="SUCCESS"):
    (F/("release-"+operation+"-"+str(vid))).write_text(result)
def is_running_on(vid,hid):
    v=vm(vid);h=hist(v)
    return v.findtext("LCM_STATE")=="3" and h is not None and h.findtext("HID")==str(hid)
def assert_source_restored(label,vid):
    v=waitfor(lambda: vm(vid) if is_running_on(vid,source) else None)
    check(label+"_source_running",v.findtext("STATE")=="3" and hist(v).findtext("CHECKED_CAPACITY_PENDING") in [None,"0"])
    check(label+"_target_reservation_released",ledger(target)=={"cpu":100,"memory":131072,"ids":[vms[2]]})
    check(label+"_source_accounting_unchanged",ledger(source)=={"cpu":200,"memory":262144,"ids":vms[:2]})
    check(label+"_no_driver_dispatch",not pending_calls())
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="3")
    check(label+"_plan_error",cluster().findtext("PLAN/STATE")=="3")
def native_suite():
    # Same approved plan can be accepted once, and two migrations cannot both
    # consume the sole remaining capacity slot.
    reset_case("parallel")
    emit([(vms[0],target,ds),(vms[1],target,ds)])
    c=cluster();args=(cid,c.findtext("PLAN_SHA256"),c.findtext("TEMPLATE_SHA256"))
    barrier=threading.Barrier(3)
    def contender(_):
        barrier.wait(timeout=5);return rpc("one.cluster.planexecutechecked",*args)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:replies=list(pool.map(contender,range(3)))
    check("checked_plan_compare_and_swap_one_winner",sum(r[0] is True for r in replies)==1)
    waitfor(lambda: len(pending_calls())==1)
    check("two_migrations_share_one_capacity_slot",len(pending_calls())==1 and ledger(target)["cpu"]==200)
    migrated=int(pending_calls()[0]["id"])
    release_driver("MIGRATE",migrated)
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="3")
    states=[a.findtext("STATE") for a in cluster().findall("PLAN/ACTION")]
    check("competition_finishes_one_done_one_error",sorted(states)==["2","3"])
    check("successful_migration_source_ledger_released",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)
    check("successful_native_generation_retained",len(hist(vm(migrated)).findtext("CHECKED_PLAN_GENERATION",""))==64)

    # Deterministic TOCTOU fixture: after native API precheck and durable pending
    # state, but before LCM admission, reduce target capacity through a DB trigger.
    reset_case("stale-capacity")
    h=host(target);put(h,"HOST_SHARE/MAX_CPU",100)
    execute_sql("CREATE TRIGGER capacity_drift AFTER UPDATE ON vm_pool WHEN NEW.oid="+str(vms[0])+" AND OLD.lcm_state=3 AND NEW.lcm_state=72 BEGIN UPDATE host_pool SET body="+sql_quote(ET.tostring(h,encoding="unicode"))+" WHERE oid="+str(target)+"; END;")
    emit([(vms[0],target,ds)])
    check("stale_capacity_plan_accepted_before_drift",apply()[0] is True)
    assert_source_restored("stale_capacity",vms[0])
    check("stale_capacity_checked_after_api_precheck",host(target).findtext("HOST_SHARE/MAX_CPU")=="100")

    # Supported shape is validated for the whole plan before any VM changes.
    for label in ["same-host","different-datastore","pci","numa","pinned","not-running","duplicate"]:
        reset_case("shape-"+label,start_now=False)
        if label in ["pci","numa","pinned","not-running"]:
            v=dbread("vm_pool",vms[1])
            if label=="pci":
                e=ET.SubElement(v.find("TEMPLATE"),"PCI");ET.SubElement(e,"VENDOR").text="1234"
            elif label=="numa":
                e=ET.SubElement(v.find("TEMPLATE"),"NUMA_NODE");ET.SubElement(e,"TOTAL_CPUS").text="1"
            elif label=="pinned":
                e=ET.SubElement(v.find("TEMPLATE"),"TOPOLOGY");ET.SubElement(e,"PIN_POLICY").text="CORE"
            else:put(v,"LCM_STATE",16)
            dbwrite("vm_pool",vms[1],v,**({"lcm_state":16} if label=="not-running" else {}))
        start("shape-"+label)
        actions=[(vms[0],target,ds),(vms[1],source if label=="same-host" else target,ds+1 if label=="different-datastore" else ds)]
        if label=="duplicate":actions[1]=actions[0]
        emit(actions, allow_missing=True)
        reply=apply()
        check("mixed_plan_"+label+"_rejected_before_applying",reply[0] is False and cluster().findtext("PLAN/STATE")=="0")
        check("mixed_plan_"+label+"_no_partial_history",hist(vm(vms[0])).findtext("SEQ")=="0" and not pending_calls())

    # A user template cannot create the native-owned capacity/history guard.
    reset_case("template-injection")
    ok("one.vm.update",vms[0],'CHECKED_PLAN_GENERATION="'+("a"*64)+'" CHECKED_CAPACITY_PENDING="1" CHECKED_PLAN_TERM="999"',1)
    check("user_template_cannot_inject_native_guard",hist(vm(vms[0])).findtext("CHECKED_PLAN_GENERATION","")=="" and hist(vm(vms[0])).findtext("CHECKED_CAPACITY_PENDING") in [None,"0"])

    # Real native admission failure boundaries. Each fixture first reaches a
    # native-written pending record and is then stopped as an abrupt crash.
    pending_snapshot=None
    for label,table,condition in [
        ("before-host-commit","host_pool","NEW.oid="+str(target)+" AND NEW.body LIKE '%<CPU_USAGE>200</CPU_USAGE>%'"),
        ("after-host-commit","history","NEW.vid="+str(vms[0])+" AND NEW.seq=1"),
        ("before-final-admission-marker","history","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND OLD.body LIKE '%<CHECKED_CAPACITY_PENDING>1</CHECKED_CAPACITY_PENDING>%' AND NEW.body LIKE '%<CHECKED_CAPACITY_PENDING>0</CHECKED_CAPACITY_PENDING>%'")
    ]:
        reset_case(label)
        name="fault_"+label.replace("-","_")
        install_failure(name,table,"UPDATE",condition)
        emit([(vms[0],target,ds)])
        check(label+"_checked_request_accepted",apply()[0] is True)
        waitfor(lambda: hist(vm(vms[0])).findtext("CHECKED_CAPACITY_PENDING")=="1")
        time.sleep(.15)
        check(label+"_pending_native_identity",vm(vms[0]).findtext("LCM_STATE") in ["72","4"] and len(hist(vm(vms[0])).findtext("CHECKED_PLAN_GENERATION",""))==64)
        check(label+"_no_driver_before_crash",not pending_calls())
        expected=100 if label=="before-host-commit" else 200
        waitfor(lambda: ledger(target)["cpu"]==expected)
        stop(crash=True)
        remove_failure(name)
        if label=="after-host-commit":
            pending_snapshot=D/"reserved-pending.db";snapshot_db(pending_snapshot)
        start(label+"-restart")
        assert_source_restored(label+"_restart",vms[0])

    # Pending LCM state and pending bit block resize and all generic recover
    # variants. Hold recovery writes so API negatives are checked before cleanup.
    reset_case("pending-api-exclusions",pending_snapshot,start_now=False)
    install_failure("fault_hold_cancel","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.etime>0")
    start("pending-api-exclusions")
    reply=rpc("one.vm.resize",vms[0],'CPU="2" MEMORY="256" VCPU="2"',True)
    check("pending_resize_rejected",reply[0] is False)
    for op in range(6):
        reply=rpc("one.vm.recover",vms[0],op)
        check("pending_generic_recover_"+str(op)+"_rejected",reply[0] is False)
    remove_failure("fault_hold_cancel")
    assert_source_restored("pending_api_cleanup",vms[0])

    # Retry every cancellation write boundary. The next source history sequence
    # must be stable on retries, including after an orphan replacement was saved.
    for label,table,kind,condition in [
        ("target-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.etime>0"),
        ("source-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=0 AND NEW.etime>0"),
        ("restored-history","history","INSERT","NEW.vid="+str(vms[0])+" AND NEW.seq=2"),
        ("source-vm-body","vm_pool","UPDATE","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=3")
    ]:
        reset_case("cancel-"+label,pending_snapshot,start_now=False)
        name="cancel_fault_"+label.replace("-","_");install_failure(name,table,kind,condition)
        start("cancel-"+label)
        time.sleep(1.2)
        check("cancel_"+label+"_retains_pending_until_write_succeeds",hist(vm(vms[0])).findtext("CHECKED_CAPACITY_PENDING")=="1")
        check("cancel_"+label+"_no_driver",not pending_calls())
        remove_failure(name)
        assert_source_restored("cancel_"+label+"_retry",vms[0])
        with sqlite3.connect(DB) as con:
            seqs=[row[0] for row in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq",(vms[0],))]
        check("cancel_"+label+"_same_history_sequence_on_retry",seqs==[0,1,2])

    # Canonical crash image at the final pending=false / before-driver boundary.
    # This is deliberately not auto-replayed or called automatic cancellation.
    reset_case("after-final-marker",pending_snapshot,start_now=False)
    with sqlite3.connect(DB) as con:
        h=ET.fromstring(con.execute("SELECT body FROM history WHERE vid=? AND seq=1",(vms[0],)).fetchone()[0])
        put(h,"CHECKED_CAPACITY_PENDING",0)
        con.execute("UPDATE history SET body=? WHERE vid=? AND seq=1",(ET.tostring(h,encoding="unicode"),vms[0]))
    v=dbread("vm_pool",vms[0]);put(v,"LCM_STATE",4);dbwrite("vm_pool",vms[0],v,lcm_state=4)
    set_plan_timestamp(int(time.time())-300)
    start("after-final-marker")
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="4")
    check("after_final_marker_no_automatic_guest_replay",not pending_calls() and vm(vms[0]).findtext("LCM_STATE")=="4")
    check("after_final_marker_honest_timeout",cluster().findtext("PLAN/STATE")=="4")
    ok("one.vm.recover",vms[0],0)
    assert_source_restored("after_final_marker_native_recover",vms[0])

    # A successful hypervisor callback cannot report native DONE until source
    # accounting is durably released; native recover-success retries idempotently.
    reset_case("terminal-source-ledger")
    emit([(vms[0],target,ds)]);check("terminal_test_accepted",apply()[0] is True)
    waitfor(lambda: len(pending_calls())==1)
    install_failure("fault_source_release","host_pool","UPDATE","NEW.oid="+str(source)+" AND NEW.body LIKE '%<CPU_USAGE>100</CPU_USAGE>%'")
    release_driver("MIGRATE",vms[0])
    time.sleep(.3)
    check("failed_source_release_does_not_report_done",cluster().findtext("PLAN/STATE")=="1" and vm(vms[0]).findtext("LCM_STATE")=="4")
    remove_failure("fault_source_release")
    ok("one.vm.recover",vms[0],1)
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
    check("source_release_retry_reports_done_once",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200 and is_running_on(vms[0],target))

    # Old delayed completions are bound to their original immutable generation.
    for result in ["SUCCESS","FAILURE"]:
        reset_case("late-"+result.lower())
        emit([(vms[0],target,ds)]);check("late_"+result+"_accepted",apply()[0] is True)
        waitfor(lambda: len(pending_calls())==1)
        old=cluster().findtext("PLAN/GENERATION")
        set_plan_timestamp(int(time.time())-300)
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="4")
        newer=emit([(vms[1],target,ds)])
        digest=newer.findtext("PLAN_SHA256")
        check("late_"+result+"_new_generation",newer.findtext("PLAN/GENERATION")!=old)
        release_driver("MIGRATE",vms[0],result)
        waitfor(lambda: vm(vms[0]).findtext("LCM_STATE")=="3")
        check("late_"+result+"_cannot_complete_replacement_plan",cluster().findtext("PLAN/STATE")=="0" and cluster().findtext("PLAN_SHA256")==digest)


def controls(**values):
    tmp=F/"control.tmp";tmp.write_text(json.dumps(values));tmp.replace(F/"control.json")
def events(mode,operation=None):
    return [x for x in native_driver_events() if x["mode"]==mode and (operation is None or x["operation"]==operation)]
def log_position(vid):
    path=P/"var/vms"/str(vid)/"vm.log"
    return path,path.stat().st_size
def wait_native_error(position,message):
    path,offset=position
    waitfor(lambda: message in path.read_bytes()[offset:].decode(errors="replace"))
def cold_suite():
    stop()
    conf=P/"etc/oned.conf"
    content,count=re.subn(r"(?m)^LIVE_RESCHEDS\s*=.*$","LIVE_RESCHEDS = 0",conf.read_text())
    if count!=1:raise AssertionError("unique live/cold configuration required")
    conf.write_text(content)
    reset_case("cold-success")
    emit([(vms[0],target,ds)])
    check("cold_checked_request_accepted",apply()[0] is True)
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
    check("cold_native_sequence_completes",len(events("vmm","SAVE"))==1 and bool(events("tm")) and is_running_on(vms[0],target))
    check("cold_native_accounting",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)

    # A successful SAVE is insufficient to start TM: each preceding native
    # history, source ledger and VM state write must have succeeded.
    for label,table,condition,step in [
        ("source-history","history","NEW.vid="+str(vms[0])+" AND NEW.seq=0 AND NEW.etime>0","source history"),
        ("target-history","history","NEW.vid="+str(vms[0])+" AND NEW.seq=1","target history"),
        ("source-ledger","host_pool","NEW.oid="+str(source)+" AND NEW.body LIKE '%<CPU_USAGE>100</CPU_USAGE>%'","source capacity release"),
        ("vm-body","vm_pool","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=8","VM state")
    ]:
        reset_case("cold-before-tm-"+label)
        controls(SAVE="HOLD",MIGRATE="HOLD")
        emit([(vms[0],target,ds)]);check("cold_"+label+"_accepted",apply()[0] is True)
        waitfor(lambda: bool(events("vmm","SAVE")))
        name="cold_fault_"+label.replace("-","_")
        install_failure(name,table,"UPDATE",condition)
        position=log_position(vms[0]);release_driver("SAVE",vms[0])
        wait_native_error(position,"Checked cold migration persistence failed: "+step)
        check("cold_"+label+"_refuses_tm_before_durable_write",not events("tm") and vm(vms[0]).findtext("LCM_STATE")=="7" and cluster().findtext("PLAN/STATE")=="1")
        remove_failure(name);ok("one.vm.recover",vms[0],1)
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
        check("cold_"+label+"_native_retry_completes",is_running_on(vms[0],target) and ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200 and len(events("vmm","SAVE"))==1)

    # Failed SAVE must not report a completed rollback while any restoration
    # write failed. Repeated failure callbacks reuse the native history sequence.
    for label,table,kind,condition,step in [
        ("target-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.etime>0","target history"),
        ("target-ledger","host_pool","UPDATE","NEW.oid="+str(target)+" AND NEW.body LIKE '%<CPU_USAGE>100</CPU_USAGE>%'","target capacity release"),
        ("source-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=0 AND NEW.etime>0","source history"),
        ("restored-history","history","INSERT","NEW.vid="+str(vms[0])+" AND NEW.seq=2","restored source history"),
        ("vm-body","vm_pool","UPDATE","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=3","VM state")
    ]:
        reset_case("cold-rollback-"+label)
        controls(SAVE="HOLD",MIGRATE="HOLD")
        emit([(vms[0],target,ds)]);check("cold_rollback_"+label+"_accepted",apply()[0] is True)
        waitfor(lambda: bool(events("vmm","SAVE")))
        name="cold_revert_"+label.replace("-","_");install_failure(name,table,kind,condition)
        position=log_position(vms[0]);release_driver("SAVE",vms[0],"FAILURE")
        wait_native_error(position,"Checked migration recovery is unresolved: "+step)
        check("cold_rollback_"+label+"_does_not_claim_restored",vm(vms[0]).findtext("LCM_STATE")=="7" and cluster().findtext("PLAN/STATE")=="1" and not events("tm"))
        remove_failure(name);ok("one.vm.recover",vms[0],0)
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="3")
        check("cold_rollback_"+label+"_retry_restores_source",is_running_on(vms[0],source) and ledger(source)["cpu"]==200 and ledger(target)["cpu"]==100 and not events("tm"))
        with sqlite3.connect(DB) as con:
            seqs=[row[0] for row in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq",(vms[0],))]
        check("cold_rollback_"+label+"_history_retry_idempotent",seqs==[0,1,2])

def legacy_enforce_reproduction():
    RESULT["scope"]="PRIVATE_NATIVE_LEGACY_ENFORCE_REPRODUCTION_NOT_SAFETY_PASS"
    for operation in ["deploy","migrate"]:
        reset_case("legacy-enforce-red-"+operation)
        controls(DEPLOY="HOLD",MIGRATE="HOLD")
        vid=int(ok("one.vm.allocate",'NAME="capacity-legacy-stale" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]',True)) if operation=="deploy" else vms[0]
        h=host(target);put(h,"HOST_SHARE/MAX_CPU",100)
        # Native API has checked capacity before it persists the target history.
        # Change capacity exactly at that durable boundary, before LCM admission.
        execute_sql("CREATE TRIGGER legacy_capacity_drift AFTER UPDATE ON vm_pool WHEN NEW.oid="+str(vid)+" AND NEW.body LIKE '%<HID>"+str(target)+"</HID>%' AND OLD.body NOT LIKE '%<HID>"+str(target)+"</HID>%' BEGIN UPDATE host_pool SET body="+sql_quote(ET.tostring(h,encoding="unicode"))+" WHERE oid="+str(target)+"; END;")
        if operation=="deploy":reply=rpc("one.vm.deploy",vid,target,True,ds,"")
        else:reply=rpc("one.vm.migrate",vid,target,True,True,ds,0)
        check("legacy_"+operation+"_accepted_original_enforce_true",reply[0] is True)
        waitfor(lambda: bool(events("vmm",operation.upper())))
        check("legacy_"+operation+"_baseline_exposes_lost_enforce_intent",ledger(target)["cpu"]==200 and host(target).findtext("HOST_SHARE/MAX_CPU")=="100")
        check("legacy_"+operation+"_no_durable_enforce_field",hist(vm(vid)).find("ENFORCE_CAPACITY") is None)

def initial_api_history_suite():
    stop()
    conf=P/"etc/oned.conf"
    content,count=re.subn(r"(?m)^LIVE_RESCHEDS *=.*$","LIVE_RESCHEDS = 1",conf.read_text())
    if count!=1:raise AssertionError("unique live/cold configuration required")
    conf.write_text(content)
    for label,table,kind,condition in [
        ("history-insert","history","INSERT","NEW.vid="+str(vms[0])+" AND NEW.seq=1"),
        ("vm-body","vm_pool","UPDATE","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=72")
    ]:
        reset_case("initial-api-"+label)
        name="initial_api_fault_"+label.replace("-","_")
        install_failure(name,table,kind,condition)
        original=emit([(vms[0],target,ds)])
        generation=original.findtext("PLAN/GENERATION")
        check("initial_api_"+label+"_plan_accepted",apply()[0] is True)
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="3")
        check("initial_api_"+label+"_source_history_unchanged",is_running_on(vms[0],source) and hist(vm(vms[0])).findtext("SEQ")=="0")
        check("initial_api_"+label+"_no_driver_or_target_reservation",not pending_calls() and ledger(target)["cpu"]==100)
        with sqlite3.connect(DB) as con:
            row=con.execute("SELECT body FROM history WHERE vid=? AND seq=1",(vms[0],)).fetchone()
        if label=="vm-body":
            orphan=ET.fromstring(row[0]) if row else None
            check("initial_api_orphan_has_exact_failed_generation",orphan is not None and orphan.findtext("CHECKED_PLAN_GENERATION")==generation and orphan.findtext("CHECKED_CAPACITY_PENDING")=="1")
        else:
            check("initial_api_failed_insert_has_no_orphan",row is None)
        remove_failure(name)
        replacement=emit([(vms[0],target,ds)])
        next_generation=replacement.findtext("PLAN/GENERATION")
        check("initial_api_"+label+"_replacement_generation_distinct",next_generation!=generation)
        check("initial_api_"+label+"_replacement_accepted",apply()[0] is True)
        waitfor(lambda: len(pending_calls())==1)
        history=hist(vm(vms[0]))
        check("initial_api_"+label+"_only_new_generation_dispatched",history.findtext("SEQ")=="1" and history.findtext("CHECKED_PLAN_GENERATION")==next_generation and history.findtext("CHECKED_CAPACITY_PENDING")=="0")
        with sqlite3.connect(DB) as con:
            seqs=[r[0] for r in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq",(vms[0],))]
        check("initial_api_"+label+"_next_sequence_reused_once",seqs==[0,1])
        release_driver("MIGRATE",vms[0])
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
        check("initial_api_"+label+"_replacement_completes",is_running_on(vms[0],target) and ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)


def target_capacity(value):
    h=host(target);put(h,"HOST_SHARE/MAX_CPU",value);dbwrite("host_pool",target,h)
def stale_capacity_at_native_history(vid):
    h=host(target);put(h,"HOST_SHARE/MAX_CPU",100)
    execute_sql("CREATE TRIGGER legacy_capacity_drift AFTER UPDATE ON vm_pool WHEN NEW.oid="+str(vid)+" AND NEW.body LIKE '%<HID>"+str(target)+"</HID>%' AND OLD.body NOT LIKE '%<HID>"+str(target)+"</HID>%' BEGIN UPDATE host_pool SET body="+sql_quote(ET.tostring(h,encoding="unicode"))+" WHERE oid="+str(target)+"; END;")
def allocate_extra():
    return int(ok("one.vm.allocate",'NAME="capacity-enforced-extra" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]',True))
def enforced_admission_suite():
    stop();conf=P/"etc/oned.conf";content,count=re.subn(r"(?m)^LIVE_RESCHEDS *=.*$","LIVE_RESCHEDS = 1",conf.read_text())
    if count!=1:raise AssertionError("unique live/cold configuration required")
    conf.write_text(content)
    for operation in ["deploy","migrate","cold"]:
        reset_case("enforced-stale-"+operation)
        vid=allocate_extra() if operation=="deploy" else vms[0]
        controls(DEPLOY="HOLD",MIGRATE="HOLD",SAVE="HOLD")
        stale_capacity_at_native_history(vid)
        if operation=="deploy":reply=rpc("one.vm.deploy",vid,target,True,ds,"")
        else:reply=rpc("one.vm.migrate",vid,target,operation=="migrate",True,ds,0)
        check("enforced_"+operation+"_request_accepted_before_drift",reply[0] is True)
        if operation=="deploy":waitfor(lambda: vm(vid).findtext("LCM_STATE")=="39")
        else:waitfor(lambda: is_running_on(vid,source) and hist(vm(vid)).findtext("SEQ")=="2")
        check("enforced_"+operation+"_refuses_driver_after_stale_precheck",not events("tm") and not events("vmm") and ledger(target)["cpu"]==100 and host(target).findtext("HOST_SHARE/MAX_CPU")=="100")
        check("enforced_"+operation+"_intent_is_native_history",hist(vm(vid)).findtext("ENFORCE_CAPACITY")=="1")
        if operation=="deploy":
            stop();start("enforced-deploy-restart")
            check("enforced_deploy_intent_survives_restart",hist(vm(vid)).findtext("ENFORCE_CAPACITY")=="1")
            check("enforced_deploy_recover_success_requires_reservation",rpc("one.vm.recover",vid,1)[0] is False)
            position=log_position(vid);ok("one.vm.recover",vid,2)
            wait_native_error(position,"refusing driver retry")
            check("enforced_deploy_retry_rechecks_capacity",vm(vid).findtext("LCM_STATE")=="39" and not events("tm") and not events("vmm"))
        else:
            check("enforced_"+operation+"_source_accounting_preserved",ledger(source)["cpu"]==200)
        remove_failure("legacy_capacity_drift");target_capacity(200)
        controls(MIGRATE="HOLD",SAVE="HOLD")
        if operation=="deploy":ok("one.vm.recover",vid,2)
        else:
            ok("one.vm.migrate",vid,target,operation=="migrate",True,ds,0)
            driver="MIGRATE" if operation=="migrate" else "SAVE"
            waitfor(lambda: bool(events("vmm",driver)));release_driver(driver,vid)
        waitfor(lambda: is_running_on(vid,target))
        check("enforced_"+operation+"_retry_after_capacity_available",ledger(target)["cpu"]==200 and hist(vm(vid)).findtext("ENFORCE_CAPACITY")=="1")

    # Explicit force=false remains the existing documented override. These
    # controls intentionally exceed the configured capacity in the inert fixture.
    for operation in ["deploy","migrate"]:
        reset_case("force-override-"+operation)
        vid=allocate_extra() if operation=="deploy" else vms[0]
        controls(DEPLOY="HOLD",MIGRATE="HOLD")
        stale_capacity_at_native_history(vid)
        reply=rpc("one.vm.deploy",vid,target,False,ds,"") if operation=="deploy" else rpc("one.vm.migrate",vid,target,True,False,ds,0)
        check("explicit_force_"+operation+"_request_preserved",reply[0] is True)
        waitfor(lambda: bool(events("vmm",operation.upper())))
        check("explicit_force_"+operation+"_override_is_visible",ledger(target)["cpu"]==200 and host(target).findtext("HOST_SHARE/MAX_CPU")=="100" and hist(vm(vid)).findtext("ENFORCE_CAPACITY")=="0")

    # Real ordinary deploy and checked Apply contend for the same final ledger.
    for trial in range(3):
        reset_case("mixed-deploy-"+str(trial));extra=allocate_extra();emit([(vms[0],target,ds)])
        c=cluster();barrier=threading.Barrier(2)
        def contender(kind):
            barrier.wait(timeout=5)
            return rpc("one.cluster.planexecutechecked",cid,c.findtext("PLAN_SHA256"),c.findtext("TEMPLATE_SHA256")) if kind==0 else rpc("one.vm.deploy",extra,target,True,ds,"")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(contender,[0,1]))
        check("mixed_deploy_"+str(trial)+"_checked_plan_accepted",replies[0][0] is True)
        waitfor(lambda: bool(pending_calls()) or cluster().findtext("PLAN/STATE")=="3")
        if pending_calls():release_driver("MIGRATE",vms[0])
        waitfor(lambda: cluster().findtext("PLAN/STATE") in ["2","3"])
        if replies[1][0]:waitfor(lambda: vm(extra).findtext("LCM_STATE") in ["3","39"])
        winners=sum([is_running_on(vms[0],target),is_running_on(extra,target)])
        check("mixed_deploy_"+str(trial)+"_one_slot_one_winner",winners==1 and ledger(target)["cpu"]==200 and len(events("vmm","DEPLOY"))+len(pending_calls())==1)

    reset_case("mixed-resize");emit([(vms[0],target,ds)])
    c=cluster();barrier=threading.Barrier(2)
    def resize_contender(kind):
        barrier.wait(timeout=5)
        return rpc("one.cluster.planexecutechecked",cid,c.findtext("PLAN_SHA256"),c.findtext("TEMPLATE_SHA256")) if kind==0 else rpc("one.vm.resize",vms[2],'CPU="2" MEMORY="128" VCPU="2"',True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(resize_contender,[0,1]))
    check("mixed_resize_checked_plan_accepted",replies[0][0] is True)
    waitfor(lambda: bool(pending_calls()) or cluster().findtext("PLAN/STATE")=="3")
    if pending_calls():release_driver("MIGRATE",vms[0])
    waitfor(lambda: cluster().findtext("PLAN/STATE") in ["2","3"])
    if replies[1][0]:waitfor(lambda: vm(vms[2]).findtext("LCM_STATE")=="3")
    resized=float(vm(vms[2]).findtext("TEMPLATE/CPU"))==2
    check("mixed_resize_one_slot_one_winner",sum([resized,is_running_on(vms[0],target)])==1 and ledger(target)["cpu"]==200)

    reset_case("resize-ledger-failure")
    install_failure("resize_ledger_fault","host_pool","UPDATE","NEW.oid="+str(target)+" AND NEW.body LIKE '%<CPU_USAGE>200</CPU_USAGE>%'")
    reply=rpc("one.vm.resize",vms[2],'CPU="2" MEMORY="128" VCPU="2"',True)
    check("enforced_resize_failed_ledger_refuses_request",reply[0] is False and ledger(target)["cpu"]==100 and float(vm(vms[2]).findtext("TEMPLATE/CPU"))==1 and not events("vmm","RESIZE"))
    remove_failure("resize_ledger_fault")
    emit([(vms[0],target,ds)]);check("checked_apply_after_failed_resize_accepted",apply()[0] is True)
    waitfor(lambda: bool(pending_calls()));release_driver("MIGRATE",vms[0])
    waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
    check("checked_apply_after_failed_resize_capacity_consistent",ledger(target)["cpu"]==200 and is_running_on(vms[0],target))


def poweroff_source():
    ok("one.vm.action","poweroff",vms[0])
    waitfor(lambda: vm(vms[0]).findtext("STATE")=="8")
    check("offline_fixture_retains_native_source_capacity",ledger(source)["cpu"]==200)
    path=F/"driver.jsonl"
    if path.exists():path.unlink()
def source_powered_off():
    v=vm(vms[0]);return v.findtext("STATE")=="8" and hist(v).findtext("HID")==str(source)
def assert_offline_restored(label):
    waitfor(source_powered_off)
    check(label+"_source_poweroff_and_accounting",ledger(source)["cpu"]==200 and ledger(target)["cpu"]==100)
    check(label+"_no_guest_driver",not events("tm") and not events("vmm"))
    with sqlite3.connect(DB) as con:seqs=[r[0] for r in con.execute("SELECT seq FROM history WHERE vid=? ORDER BY seq",(vms[0],))]
    check(label+"_single_restored_sequence",seqs==[0,1,2])
def enforced_recovery_suite():
    # Final-admission refusal of an offline ordinary migration keeps source
    # capacity. Native recover-failure must restore history without a guest action.
    reset_case("offline-admission-refusal");poweroff_source();stale_capacity_at_native_history(vms[0])
    ok("one.vm.migrate",vms[0],target,False,True,ds,0)
    waitfor(lambda: vm(vms[0]).findtext("LCM_STATE")=="44")
    check("offline_refusal_no_transfer_and_source_retained",not events("tm") and not events("vmm") and ledger(source)["cpu"]==200 and ledger(target)["cpu"]==100)
    remove_failure("legacy_capacity_drift");stop();absent=D/"offline-refused-no-reservation.db";snapshot_db(absent)
    start("offline-no-reservation-recover");ok("one.vm.recover",vms[0],0);assert_offline_restored("offline_no_reservation")

    for label,table,kind,condition,step in [
        ("target-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.etime>0","target history"),
        ("restored-history","history","INSERT","NEW.vid="+str(vms[0])+" AND NEW.seq=2","restored source history"),
        ("vm-body","vm_pool","UPDATE","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=43 AND NEW.body LIKE '%<SEQ>2</SEQ>%'","VM state")
    ]:
        reset_case("offline-absent-"+label,absent,start_now=False);name="offline_absent_"+label.replace("-","_")
        install_failure(name,table,kind,condition);start("offline-absent-"+label)
        position=log_position(vms[0]);ok("one.vm.recover",vms[0],0)
        wait_native_error(position,"Enforced migration recovery remains unresolved: "+step)
        check("offline_absent_"+label+"_remains_unresolved",vm(vms[0]).findtext("LCM_STATE")=="44" and hist(vm(vms[0])).findtext("SEQ")=="1" and not events("tm") and not events("vmm"))
        remove_failure(name);ok("one.vm.recover",vms[0],0);assert_offline_restored("offline_absent_"+label+"_retry")

    # Exercise the opposite ledger image: target reserved, source released, then
    # the inert transfer reports failure. Recovery must reverse it durably.
    reset_case("offline-transfer-failure");poweroff_source();controls(TRANSFER="HOLD")
    ok("one.vm.migrate",vms[0],target,False,True,ds,0)
    waitfor(lambda: bool(events("tm","TRANSFER")))
    check("offline_transfer_reserves_target_releases_source",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)
    release_driver("TRANSFER",vms[0],"FAILURE");waitfor(lambda: vm(vms[0]).findtext("LCM_STATE")=="44")
    stop();reserved=D/"offline-failed-with-reservation.db";snapshot_db(reserved)
    for label,table,kind,condition,step in [
        ("target-release","host_pool","UPDATE","NEW.oid="+str(target)+" AND NEW.body LIKE '%<CPU_USAGE>100</CPU_USAGE>%'","target capacity release"),
        ("source-reservation","host_pool","UPDATE","NEW.oid="+str(source)+" AND NEW.body LIKE '%<CPU_USAGE>200</CPU_USAGE>%'","source capacity reservation"),
        ("target-history","history","UPDATE","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.etime>0","target history"),
        ("restored-history","history","INSERT","NEW.vid="+str(vms[0])+" AND NEW.seq=2","restored source history"),
        ("vm-body","vm_pool","UPDATE","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=43 AND NEW.body LIKE '%<SEQ>2</SEQ>%'","VM state")
    ]:
        reset_case("offline-reserved-"+label,reserved,start_now=False);name="offline_reserved_"+label.replace("-","_")
        install_failure(name,table,kind,condition);start("offline-reserved-"+label)
        position=log_position(vms[0]);ok("one.vm.recover",vms[0],0)
        wait_native_error(position,"Enforced migration recovery remains unresolved: "+step)
        check("offline_reserved_"+label+"_keeps_failed_target_identity",vm(vms[0]).findtext("LCM_STATE")=="44" and hist(vm(vms[0])).findtext("HID")==str(target) and hist(vm(vms[0])).findtext("SEQ")=="1")
        check("offline_reserved_"+label+"_no_driver",not events("tm") and not events("vmm"))
        remove_failure(name);ok("one.vm.recover",vms[0],0);assert_offline_restored("offline_reserved_"+label+"_retry")

    reset_case("offline-source-capacity-drift",reserved)
    h=host(source);put(h,"HOST_SHARE/MAX_CPU",100);dbwrite("host_pool",source,h)
    position=log_position(vms[0]);ok("one.vm.recover",vms[0],0)
    wait_native_error(position,"Enforced migration recovery remains unresolved: source capacity reservation")
    check("offline_rollback_honors_current_source_capacity",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==100 and vm(vms[0]).findtext("LCM_STATE")=="44" and not events("tm") and not events("vmm"))
    h=host(source);put(h,"HOST_SHARE/MAX_CPU",800);dbwrite("host_pool",source,h)
    ok("one.vm.recover",vms[0],0);assert_offline_restored("offline_source_capacity_retry")

    # Retrying the original refused target also closes source accounting before
    # TM. It cannot bypass that write on the existing PROLOG_FAILURE retry route.
    reset_case("offline-target-retry",absent);target_capacity(200)
    install_failure("offline_retry_source_release","host_pool","UPDATE","NEW.oid="+str(source)+" AND NEW.body LIKE '%<CPU_USAGE>100</CPU_USAGE>%'")
    position=log_position(vms[0]);ok("one.vm.recover",vms[0],2)
    wait_native_error(position,"Enforced migration pre-transfer persistence failed: source capacity release")
    check("offline_target_retry_blocks_tm_until_source_release",not events("tm") and not events("vmm") and ledger(source)["cpu"]==200 and ledger(target)["cpu"]==200)
    remove_failure("offline_retry_source_release");ok("one.vm.recover",vms[0],2)
    waitfor(lambda: vm(vms[0]).findtext("STATE")=="8" and hist(vm(vms[0])).findtext("HID")==str(target))
    check("offline_target_retry_completes_with_single_ledger",ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)

    stop();conf=P/"etc/oned.conf";content,count=re.subn(r"(?m)^LIVE_RESCHEDS *=.*$","LIVE_RESCHEDS = 0",conf.read_text())
    if count!=1:raise AssertionError("unique live/cold configuration required")
    conf.write_text(content)
    for label,table,condition in [
        ("history","history","NEW.vid="+str(vms[0])+" AND NEW.seq=1 AND NEW.body NOT LIKE '%<PETIME>0</PETIME>%'"),
        ("vm-body","vm_pool","NEW.oid="+str(vms[0])+" AND NEW.lcm_state=35")
    ]:
        reset_case("checked-before-restore-"+label);controls(TRANSFER="HOLD")
        emit([(vms[0],target,ds)]);check("checked_before_restore_"+label+"_accepted",apply()[0] is True)
        waitfor(lambda: bool(events("tm","TRANSFER")))
        name="before_restore_"+label.replace("-","_");install_failure(name,table,"UPDATE",condition)
        position=log_position(vms[0]);release_driver("TRANSFER",vms[0])
        wait_native_error(position,"Cannot persist enforced prolog completion; refusing next driver step")
        check("checked_before_restore_"+label+"_does_not_dispatch_guest",not events("vmm","RESTORE") and vm(vms[0]).findtext("LCM_STATE")=="8" and cluster().findtext("PLAN/STATE")=="1")
        remove_failure(name);ok("one.vm.recover",vms[0],1)
        waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
        check("checked_before_restore_"+label+"_retry_completes",len(events("vmm","RESTORE"))==1 and is_running_on(vms[0],target) and ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)

def downgrade_gap_suite():
    from native_downgrade_guard import inspect_rows, inspect_snapshot
    for label in ("live", "poweroff", "deploy"):
        reset_case("downgrade-gap-" + label)
        controls(MIGRATE="HOLD", TRANSFER="HOLD", DEPLOY="HOLD")
        vid = vms[0]
        state, lcm, sequence = 3, 3, 1
        if label == "poweroff":
            poweroff_source()
            state, lcm = 8, 0
        elif label == "deploy":
            vid = int(ok("one.vm.allocate", 'NAME="downgrade-gap-deploy" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]', True))
            state, lcm, sequence = 2, 0, 0
        # This trigger captures the actual API commit while the VM lock is held
        # and before the LCM event can be enqueued. It observes native rows; it
        # does not invent a VM state, history, or host reservation.
        execute_sql("""
            CREATE TABLE gap_vm AS SELECT oid,state,lcm_state,body FROM vm_pool WHERE 0;
            CREATE TABLE gap_plan AS SELECT cid,state,body FROM plan_pool WHERE 0;
            CREATE TABLE gap_history AS SELECT vid,seq,body FROM history WHERE 0;
            CREATE TABLE gap_host AS SELECT oid,body FROM host_pool WHERE 0;
            CREATE TRIGGER capture_native_api_gap AFTER UPDATE ON vm_pool
            WHEN NEW.oid=""" + str(vid) + " AND NEW.state=" + str(state) +
            " AND NEW.lcm_state=" + str(lcm) +
            " AND NEW.body LIKE '%<SEQ>" + str(sequence) + "</SEQ>%'" +
            " AND NEW.body LIKE '%<HID>" + str(target) + "</HID>%'" +
            """ AND NEW.body LIKE '%<ENFORCE_CAPACITY>1</ENFORCE_CAPACITY>%'
            AND (SELECT count(*) FROM gap_vm)=0
            BEGIN
                INSERT INTO gap_vm SELECT oid,state,lcm_state,body FROM vm_pool;
                INSERT INTO gap_plan SELECT cid,state,body FROM plan_pool;
                INSERT INTO gap_history SELECT vid,seq,body FROM history;
                INSERT INTO gap_host SELECT oid,body FROM host_pool;
            END;
        """)
        if label == "deploy":
            ok("one.vm.deploy", vid, target, True, ds, "")
        else:
            ok("one.vm.migrate", vid, target, label == "live", True, ds, 0)
        stop()
        with sqlite3.connect("file:" + str(DB) + "?mode=ro", uri=True) as con:
            con.execute("PRAGMA query_only=ON")
            con.execute("BEGIN")
            vm_rows = con.execute("SELECT oid,state,lcm_state,body FROM gap_vm").fetchall()
            plan_rows = con.execute("SELECT cid,state,body FROM gap_plan").fetchall()
            history_rows = con.execute("SELECT vid,seq,body FROM gap_history").fetchall()
            host_rows = con.execute("SELECT oid,body FROM gap_host").fetchall()
        selected = next((r for r in vm_rows if r[0] == vid), None)
        check("downgrade_" + label + "_captured_native_pre_lcm_state",
              selected is not None and selected[1:3] == (state, lcm))
        current = next(ET.fromstring(body) for ident, seq, body in history_rows if ident == vid and seq == sequence)
        check("downgrade_" + label + "_captured_canonical_target",
              hist(ET.fromstring(selected[3])).findtext("SEQ") == str(sequence) and
              current.findtext("HID") == str(target) and current.findtext("ENFORCE_CAPACITY") == "1" and
              current.findtext("STIME") == "0")
        target_row = next(ET.fromstring(body) for ident, body in host_rows if ident == target)
        check("downgrade_" + label + "_capture_precedes_target_reservation",
              target_row.findtext("HOST_SHARE/CPU_USAGE") == "100" and
              str(vid) not in [n.text for n in target_row.findall("VMS/ID")])
        report = inspect_rows(vm_rows, plan_rows, history_rows)
        check("downgrade_" + label + "_guard_refuses_actual_native_gap",
              not report["database_ready_for_older_binary"] and
              any(b["resource"] == "VM" and b["id"] == vid for b in report["blockers"]))
        snapshot = OUT / ("native-api-gap-" + label + ".snapshot.json")
        snapshot.write_text(json.dumps({
            "schema": "onedrs.native-db-snapshot/v1", "backend": "sqlite",
            "transaction": {"isolation": "SERIALIZABLE", "read_only": True,
                            "consistent_snapshot": True,
                            "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()},
            "capture": "actual native API VM-body commit, captured inside its transaction",
            "vm_rows": vm_rows, "plan_rows": plan_rows, "history_rows": history_rows}, indent=2) + "\n")
        snapshot.chmod(0o600)
        loaded = inspect_snapshot(snapshot)
        check("downgrade_" + label + "_snapshot_loader_matches_row_policy",
              loaded["blockers"] == report["blockers"])
        (OUT / ("native-api-gap-" + label + "-guard.json")).write_text(json.dumps(loaded, indent=2) + "\n")
        RESULT.setdefault("native_api_gap_captures", []).append({
            "case": label, "vm": vid, "state": state, "lcm_state": lcm,
            "canonical_sequence": sequence, "current_stime": current.findtext("STIME"),
            "snapshot_sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
            "guard_sha256": hashlib.sha256((D / "native_downgrade_guard.py").read_bytes()).hexdigest()})

try:
    start("bootstrap")
    cid=int(ok("one.cluster.allocate","capacity-disposable"))
    ok("one.cluster.update",cid,policy(),1)
    caps=cluster().find("ONE_DRS_CHECKED_CAPABILITIES")
    check("native_capability_v3_scope",caps is not None and caps.findtext("VERSION")=="3" and caps.findtext("CAPACITY")=="ATOMIC" and caps.findtext("MIGRATION")=="RUNNING_UNPINNED_NO_PCI_NO_VMGROUP_SAME_DATASTORE_CROSS_HOST" and caps.findtext("ELIGIBILITY")=="SOURCE_BOUND_CURRENT_OWNER_REQUIREMENTS")
    source=int(ok("one.host.allocate","capacity-source","capacity","capacity",cid))
    target=int(ok("one.host.allocate","capacity-target","capacity","capacity",cid))
    ds=int(ok("one.datastore.allocate",'NAME="capacity-system" TYPE="SYSTEM_DS" TM_MAD="dummy" DISK_TYPE="FILE"',cid))
    for name in ["source-a","source-b","target-resident"]:
        vms.append(int(ok("one.vm.allocate",'NAME="capacity-'+name+'" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]',True)))
    stop()
    for hid in [source,target]:
        h=dbread("host_pool",hid)
        put(h,"STATE",2);put(h,"PREV_STATE",2)
        for tag,value in {"MAX_CPU":800 if hid==source else 200,"MAX_MEM":8388608,"CPU_USAGE":0,"MEM_USAGE":0,"RUNNING_VMS":0}.items():put(h,"HOST_SHARE/"+tag,value)
        for tag,value in {"ARCH":"x86_64","HYPERVISOR":"kvm","PIN_POLICY":"NONE"}.items():put(h,"TEMPLATE/"+tag,value)
        dbwrite("host_pool",hid,h,state=2)
    start("capacity-ready")
    for vid,hid in zip(vms,[source,source,target]):
        ok("one.vm.deploy",vid,hid,True,ds,"")
        waitfor(lambda vid=vid: vm(vid).findtext("LCM_STATE")=="3",20)
    check("native_fixture_vms_running",all(vm(i).findtext("STATE")=="3" and vm(i).findtext("LCM_STATE")=="3" for i in vms))
    check("native_initial_host_ledger",host(source).findtext("HOST_SHARE/CPU_USAGE")=="200" and host(target).findtext("HOST_SHARE/CPU_USAGE")=="100")
    (OUT/"native-cluster-capability.xml").write_text(ok("one.cluster.info",cid,False)+"\n")
    (OUT/"fixture-identities.json").write_text(json.dumps({"cluster":cid,"source":source,"target":target,"datastore":ds,"vms":vms},indent=2)+"\n")
    stop()
    with sqlite3.connect(DB) as con:
        with sqlite3.connect(D/"baseline.db") as backup:con.backup(backup)
    if SUITE in ["all","live"]:native_suite()
    if SUITE in ["all","cold"]:cold_suite()
    if SUITE in ["all","api-history"]:initial_api_history_suite()
    if SUITE in ["all","enforce"]:enforced_admission_suite()
    if SUITE in ["all","recovery"]:enforced_recovery_suite()
    if SUITE in ["all","downgrade"]:downgrade_gap_suite()
    if SUITE in ["all","generation","origin","origin-ledger","origin-orphan"]:
        import native_generation_contract
        native_generation_contract.run(globals())
    if SUITE in ["all","callback-guard","pending-api","legacy-callback-boundary"]:
        import native_pending_entry_contract
        native_pending_entry_contract.run(globals())
    if SUITE=="legacy-red":legacy_enforce_reproduction()
    RESULT["status"]="REPRODUCED" if SUITE=="legacy-red" else "PASS"
except Exception as exc:
    RESULT["status"]="FAIL";RESULT["error"]=str(exc)
    raise
finally:
    try:stop()
    finally:
        RESULT["finished_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        (OUT/"capacity-result.json").write_text(json.dumps(RESULT,indent=2)+"\n")
        print(json.dumps({"status":RESULT.get("status"),"checks":len(RESULT["checks"]),"error":RESULT.get("error")}),flush=True)
