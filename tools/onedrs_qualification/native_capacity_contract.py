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
RESULT={"scope":"PRIVATE_NATIVE_CAPACITY_AND_CRASH_CONTRACTS_WITH_INERT_DRIVERS","started_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"binary_sha256":hashlib.sha256((D/"candidate-oned").read_bytes()).hexdigest(),"checks":[],"shutdowns":[]}
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
def emit(actions):
    before=cluster().findtext("PLAN/GENERATION")
    p=ET.Element("PLAN");ET.SubElement(p,"ID").text=str(cid)
    ET.SubElement(p,"TEMPLATE_SHA256").text=cluster().findtext("TEMPLATE_SHA256")
    for ident,(vid,hid,dsid) in enumerate(actions):
        a=ET.SubElement(p,"ACTION")
        for tag,val in [("ID",ident),("VM_ID",vid),("STATE",0),("OPERATION","migrate"),("HOST_ID",hid),("DS_ID",dsid),("TIMESTAMP",0)]:
            ET.SubElement(a,tag).text=str(val)
    queue=P/"var/checked-api-fixture"
    dest=queue/(secrets.token_hex(8)+".json")
    tmp=dest.with_suffix(".tmp");tmp.write_text(json.dumps({"cid":cid,"xml":ET.tostring(p,encoding="unicode")}));tmp.replace(dest)
    def accepted():
        c=cluster()
        return c if c.findtext("PLAN/GENERATION") not in [None,"",before] else None
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
        emit(actions)
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

try:
    start("bootstrap")
    cid=int(ok("one.cluster.allocate","capacity-disposable"))
    ok("one.cluster.update",cid,policy(),1)
    caps=cluster().find("ONE_DRS_CHECKED_CAPABILITIES")
    check("native_capability_v2_scope",caps is not None and caps.findtext("VERSION")=="2" and caps.findtext("CAPACITY")=="ATOMIC" and caps.findtext("MIGRATION")=="RUNNING_UNPINNED_NO_PCI_SAME_DATASTORE_CROSS_HOST")
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
    native_suite()
    RESULT["status"]="PASS"
except Exception as exc:
    RESULT["status"]="FAIL";RESULT["error"]=str(exc)
    raise
finally:
    try:stop()
    finally:
        RESULT["finished_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        (OUT/"capacity-result.json").write_text(json.dumps(RESULT,indent=2)+"\n")
        print(json.dumps({"status":RESULT.get("status"),"checks":len(RESULT["checks"]),"error":RESULT.get("error")}),flush=True)
