#!/usr/bin/python3
"""Native source-bound eligibility contracts with disposable resources and inert drivers.
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
if (OUT/"eligibility-result.json").exists() or DB.exists():raise SystemExit("fresh runtime required")
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
RESULT={"scope":"PRIVATE_NATIVE_ELIGIBILITY_CONTRACTS_WITH_INERT_DRIVERS","started_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"binary_sha256":hashlib.sha256((D/"candidate-oned").read_bytes()).hexdigest(),"checks":[],"shutdowns":[]}
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

def emit(actions, captured=None, token_mode="valid"):
    captured=captured or capture_input()
    before=cluster().findtext("PLAN/GENERATION")
    p=ET.Element("PLAN");ET.SubElement(p,"ID").text=str(cid)
    ET.SubElement(p,"TEMPLATE_SHA256").text=captured["template_sha256"]
    for ident,(vid,hid,dsid) in enumerate(actions):
        a=ET.SubElement(p,"ACTION")
        for tag,val in [("ID",ident),("VM_ID",vid),("STATE",0),("OPERATION","migrate"),("HOST_ID",hid),("DS_ID",dsid),("TIMESTAMP",0)]:
            ET.SubElement(a,tag).text=str(val)
        token=captured["candidates"][(vid,hid)]
        if token_mode=="forged":token="0"*64
        if token_mode=="borrowed":token=captured["candidates"][(vms[1],hid)]
        if token_mode!="missing":ET.SubElement(a,"ELIGIBILITY_SHA256").text=token
    queue=P/"var/checked-api-fixture"
    dest=queue/(secrets.token_hex(8)+".json")
    tmp=dest.with_suffix(".tmp");tmp.write_text(json.dumps({"cid":cid,"xml":ET.tostring(p,encoding="unicode")}));tmp.replace(dest)
    def accepted():
        c=cluster()
        return c if c.findtext("PLAN/GENERATION") not in [None,"",before] else None
    return waitfor(accepted)

def reject_before_dispatch(label):
    before=vm(vms[0]);before_source=ledger(source);before_target=ledger(target)
    reply=apply()
    check(label+"_checked_apply_rejected",reply[0] is False)
    check(label+"_ready_plan_retained",cluster().findtext("PLAN/STATE")=="0")
    check(label+"_no_guest_driver",not pending_calls())
    check(label+"_no_history_or_capacity_change",hist(vm(vms[0])).findtext("SEQ")==hist(before).findtext("SEQ") and ledger(source)==before_source and ledger(target)==before_target)

def eligibility_suite():
    reset_case("native-source-positive")
    capture=capture_input();plan=emit([(vms[0],target,ds)],capture)
    token=capture["candidates"][(vms[0],target)]
    check("native_plan_echoes_input_token",plan.findtext("PLAN/ACTION/ELIGIBILITY_SHA256")==token)
    check("current_native_readback_eligible",plan.findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="ELIGIBLE")
    (OUT/"native-cluster-eligible.xml").write_text(ET.tostring(plan,encoding="unicode")+"\n")
    ok("one.host.update",target,'ELIGIBILITY_UNRELATED_MONITOR_NOTE="changed"',1)
    check("unrelated_monitoring_does_not_expire_token",cluster().findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="ELIGIBLE")
    check("native_bound_apply_accepted",apply()[0] is True)
    waitfor(lambda: len(pending_calls())==1)
    check("eligibility_persisted_in_native_history",hist(vm(vms[0])).findtext("CHECKED_ELIGIBILITY_SHA256")==token)
    release_driver("MIGRATE",vms[0]);waitfor(lambda: cluster().findtext("PLAN/STATE")=="2")
    check("bound_native_migration_reaches_done",is_running_on(vms[0],target) and ledger(source)["cpu"]==100 and ledger(target)["cpu"]==200)

    for token_mode in ["missing","forged","borrowed"]:
        reset_case("token-"+token_mode)
        emit([(vms[0],target,ds)],token_mode=token_mode)
        reject_before_dispatch("token_"+token_mode)

    reset_case("requirement-drift")
    emit([(vms[0],target,ds)])
    ok("one.vm.update",vms[0],'<TEMPLATE><SCHED_REQUIREMENTS><![CDATA[ID = '+str(source)+']]></SCHED_REQUIREMENTS></TEMPLATE>',1)
    check("requirement_drift_native_readback_stale",cluster().findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="STALE")
    reject_before_dispatch("requirement_drift")

    reset_case("label-drift")
    ok("one.host.update",target,'ELIGIBILITY_LABEL="allowed"',1)
    ok("one.vm.update",vms[0],'<TEMPLATE><SCHED_REQUIREMENTS><![CDATA[ELIGIBILITY_LABEL = "allowed"]]></SCHED_REQUIREMENTS></TEMPLATE>',1)
    emit([(vms[0],target,ds)])
    ok("one.host.update",target,'ELIGIBILITY_LABEL="denied"',1)
    check("target_label_drift_native_readback_stale",cluster().findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="STALE")
    reject_before_dispatch("target_label_drift")

    reset_case("group-unsupported")
    group=int(ok("one.vmgroup.allocate",'NAME="eligibility-group" ROLE=[NAME="workers"]'))
    ok("one.vm.vmgroupadd",vms[0],group,"workers")
    emit([(vms[0],target,ds)])
    check("VMGroup_scope_reported_unsupported",cluster().findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="UNSUPPORTED")
    reject_before_dispatch("VMGroup_unqualified")

    reset_case("owner-authorization-drift")
    gid=int(ok("one.group.allocate","eligibility-owner-group"))
    # Native group allocation creates wildcard resource ACLs. Remove only this
    # newly allocated private group's defaults so revocation tests exact access.
    for rule in xml("one.acl.info").findall("ACL"):
        if int(rule.findtext("USER"),16)==(0x200000000 | gid):
            ok("one.acl.delrule",int(rule.findtext("ID")))
    uid=int(ok("one.user.allocate","eligibility-owner",secrets.token_urlsafe(32),"core",[gid]))
    rule=int(ok("one.acl.addrule",format(0x100000000 | uid,"x"),format(0x2000000000 | 0x100000000 | target,"x"),"2","100000000"))
    ok("one.vm.chown",vms[0],uid,gid)
    emit([(vms[0],target,ds)])
    ok("one.acl.delrule",rule)
    check("current_owner_acl_revocation_reported_stale",cluster().findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="STALE")
    reject_before_dispatch("owner_acl_revoked")

    reset_case("late-target-label-drift")
    ok("one.host.update",target,'ELIGIBILITY_LABEL="allowed"',1)
    ok("one.vm.update",vms[0],'<TEMPLATE><SCHED_REQUIREMENTS><![CDATA[ELIGIBILITY_LABEL = "allowed"]]></SCHED_REQUIREMENTS></TEMPLATE>',1)
    emit([(vms[0],target,ds)])
    h=host(target);put(h,"TEMPLATE/ELIGIBILITY_LABEL","denied")
    execute_sql("CREATE TRIGGER eligibility_drift AFTER UPDATE ON vm_pool WHEN NEW.oid="+str(vms[0])+" AND OLD.lcm_state=3 AND NEW.lcm_state=72 BEGIN UPDATE host_pool SET body="+sql_quote(ET.tostring(h,encoding="unicode"))+" WHERE oid="+str(target)+"; END;")
    check("late_label_drift_accepted_before_native_state_transition",apply()[0] is True)
    assert_source_restored("late_label_drift",vms[0])
    check("late_label_checked_inside_native_admission",host(target).findtext("TEMPLATE/ELIGIBILITY_LABEL")=="denied")

try:
    start("bootstrap")
    cid=int(ok("one.cluster.allocate","capacity-disposable"))
    ok("one.cluster.update",cid,policy(),1)
    caps=cluster().find("ONE_DRS_CHECKED_CAPABILITIES")
    check("native_capability_v3_eligibility_scope",caps is not None and caps.findtext("VERSION")=="3" and caps.findtext("CAPACITY")=="ATOMIC" and caps.findtext("MIGRATION")=="RUNNING_UNPINNED_NO_PCI_NO_VMGROUP_SAME_DATASTORE_CROSS_HOST" and caps.findtext("ELIGIBILITY")=="SOURCE_BOUND_CURRENT_OWNER_REQUIREMENTS")
    source=int(ok("one.host.allocate","capacity-source","capacity","capacity",cid))
    target=int(ok("one.host.allocate","capacity-target","capacity","capacity",cid))
    ds=int(ok("one.datastore.allocate",'NAME="capacity-system" TYPE="SYSTEM_DS" TM_MAD="dummy" DISK_TYPE="FILE"',cid))
    for name in ["source-a","source-b","target-resident"]:
        vms.append(int(ok("one.vm.allocate",'NAME="capacity-'+name+'" CPU="1" MEMORY="128" VCPU="1" OS=[ARCH="x86_64"]',True)))
    stop()
    for hid in [source,target]:
        h=dbread("host_pool",hid)
        put(h,"STATE",2);put(h,"PREV_STATE",2)
        for tag,value in {"MAX_CPU":800 if hid==source else 200,"TOTAL_CPU":800 if hid==source else 200,"MAX_MEM":8388608,"TOTAL_MEM":8388608,"CPU_USAGE":0,"MEM_USAGE":0,"RUNNING_VMS":0}.items():put(h,"HOST_SHARE/"+tag,value)
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
    eligibility_suite()
    RESULT["status"]="PASS"
except Exception as exc:
    RESULT["status"]="FAIL";RESULT["error"]=str(exc)
    raise
finally:
    try:stop()
    finally:
        RESULT["finished_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        (OUT/"eligibility-result.json").write_text(json.dumps(RESULT,indent=2)+"\n")
        print(json.dumps({"status":RESULT.get("status"),"checks":len(RESULT["checks"]),"error":RESULT.get("error")}),flush=True)
