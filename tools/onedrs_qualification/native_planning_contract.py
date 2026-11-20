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
if (OUT/"planning-result.json").exists() or DB.exists():raise SystemExit("fresh runtime required")
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
RESULT={"scope":"PRIVATE_NATIVE_CHECKED_PLANNING_CONTRACTS_WITH_INERT_DRIVERS","started_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"binary_sha256":hashlib.sha256((D/"candidate-oned").read_bytes()).hexdigest(),"checks":[],"shutdowns":[]}
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

def native_request(c=None):
    c=cluster() if c is None else c
    return c.find("PLAN/REQUEST")

def base_args():
    c=cluster()
    return c.findtext("TEMPLATE_SHA256"),c.findtext("PLAN_SHA256","")

def begin_generate(nonce=None):
    nonce=nonce or secrets.token_hex(32)
    template,base=base_args()
    prior={p.name for p in (P/"var/checked-api-fixture").glob("*.input.xml")}
    reply=rpc("one.cluster.optimizechecked",cid,template,base,nonce)
    check("generate_accepted_"+nonce[:8],reply[0] is True)
    return capture_checked_input(nonce,template,base,prior)

def capture_checked_input(nonce,template,base,prior):
    queue=P/"var/checked-api-fixture"
    path=waitfor(lambda:next((p for p in queue.glob("*.input.xml") if p.name not in prior),None))
    raw=path.read_bytes();root=ET.fromstring(raw)
    check("request_nonce_reaches_native_input_"+nonce[:8],root.findtext("ONE_DRS_REQUEST/NONCE")==nonce and root.findtext("ONE_DRS_REQUEST/CLUSTER_ID")==str(cid) and root.findtext("ONE_DRS_REQUEST/TEMPLATE_SHA256")==template)
    candidates={(int(x.findtext("VM_ID")),int(x.findtext("HOST_ID"))):x.findtext("SHA256") for x in root.findall("ONE_DRS_ELIGIBILITY/CANDIDATE")}
    c=cluster();request=native_request(c)
    check("durable_request_precedes_optimizer_response_"+nonce[:8],request is not None and request.findtext("NONCE")==nonce and request.findtext("STATE")=="GENERATING" and request.findtext("BASE_PLAN_SHA256","")==base and c.findtext("PLAN/STATE")=="-1")
    return {"nonce":nonce,"template":template,"base":base,"candidates":candidates,"input_sha256":hashlib.sha256(raw).hexdigest()}

def queue_result(binding,actions,nonce=None,template=None,error=None,omit_nonce=False):
    p=ET.Element("PLAN")
    ET.SubElement(p,"ID").text=str(cid)
    ET.SubElement(p,"TEMPLATE_SHA256").text=template or binding["template"]
    if not omit_nonce:ET.SubElement(p,"REQUEST_NONCE").text=nonce or binding["nonce"]
    if error is not None:ET.SubElement(p,"REQUEST_ERROR").text=error
    for ident,(vid,hid,dsid) in enumerate(actions):
        a=ET.SubElement(p,"ACTION")
        for tag,val in [("ID",ident),("VM_ID",vid),("STATE",0),("OPERATION","migrate"),("HOST_ID",hid),("DS_ID",dsid),("TIMESTAMP",0),("ELIGIBILITY_SHA256",binding["candidates"][(vid,hid)])]:
            ET.SubElement(a,tag).text=str(val)
    dest=P/"var/checked-api-fixture"/(secrets.token_hex(8)+".json")
    tmp=dest.with_suffix(".tmp");tmp.write_text(json.dumps({"cid":cid,"xml":ET.tostring(p,encoding="unicode")}));tmp.replace(dest)
    waitfor(lambda:dest.with_suffix(".sent").exists())
    return dest

def wait_request(nonce,state):
    def matches():
        c=cluster();r=native_request(c)
        return c if r is not None and r.findtext("NONCE")==nonce and r.findtext("STATE")==state else None
    return waitfor(matches)

def unchanged_after_response(label,digest):
    # The fixture receipt proves the response was sent. Observe a stable native
    # readback after its asynchronous manager callback without reissuing mutation.
    time.sleep(.35)
    check(label,cluster().findtext("PLAN_SHA256")==digest)

def as_user(session,method,*args):
    with xmlrpc.client.ServerProxy("http://127.0.0.1:2633/RPC2",allow_none=True) as api:
        return getattr(api,method)(session,*args)

def planning_suite():
    global cid
    reset_case("planning-ready-reject")
    b=begin_generate();c=cluster();busy=c.findtext("PLAN_SHA256");template=c.findtext("TEMPLATE_SHA256")
    (OUT/"native-cluster-generating.xml").write_text(ET.tostring(c,encoding="unicode")+"\n")
    for label,method,args in [
        ("generate","one.cluster.optimizechecked",(cid,template,busy,secrets.token_hex(32))),
        ("reject","one.cluster.planrejectchecked",(cid,busy,template,secrets.token_hex(32))),
        ("apply","one.cluster.planexecutechecked",(cid,busy,template)),
        ("configure","one.cluster.updatedrschecked",(cid,'ONE_DRS=[AUTOMATION="manual",POLICY="pack"]',template)),
        ("legacy_generate","one.cluster.optimize",(cid,)),
        ("legacy_apply","one.cluster.planexecute",(cid,)),
        ("legacy_delete","one.cluster.plandelete",(cid,)),
    ]:
        check("generating_blocks_"+label,rpc(method,*args)[0] is False)
    check("generating_busy_rejections_do_not_change_identity",cluster().findtext("PLAN_SHA256")==busy)
    queue_result(b,[(vms[0],target,ds)])
    ready=wait_request(b["nonce"],"READY")
    (OUT/"native-cluster-planning-ready.xml").write_text(ET.tostring(ready,encoding="unicode")+"\n")
    generation=ready.findtext("PLAN/GENERATION");approved=ready.findtext("PLAN_SHA256")
    check("ready_result_correlates_native_generation",len(generation)==64 and native_request(ready).findtext("PLAN_GENERATION")==generation and ready.findtext("PLAN/STATE")=="0")
    check("generate_does_not_execute_recommendations",not pending_calls() and hist(vm(vms[0])).findtext("SEQ")=="0")
    check("checked_ready_cannot_bypass_apply_contract",rpc("one.cluster.planexecute",cid)[0] is False)
    check("reject_stale_plan_fails",rpc("one.cluster.planrejectchecked",cid,"0"*64,template,secrets.token_hex(32))[0] is False)
    check("reject_stale_policy_fails",rpc("one.cluster.planrejectchecked",cid,approved,"0"*64,secrets.token_hex(32))[0] is False)
    reject_nonce=secrets.token_hex(32)
    check("reject_exact_ready_plan_accepted",rpc("one.cluster.planrejectchecked",cid,approved,template,reject_nonce)[0] is True)
    rejected=wait_request(reject_nonce,"REJECTED")
    check("reject_retains_exact_generation_and_base",rejected.findtext("PLAN/STATE")=="-1" and not rejected.findall("PLAN/ACTION") and native_request(rejected).findtext("PLAN_GENERATION")==generation and native_request(rejected).findtext("BASE_PLAN_SHA256")==approved)
    (OUT/"native-cluster-rejected.xml").write_text(ET.tostring(rejected,encoding="unicode")+"\n")
    check("reject_replay_fails",rpc("one.cluster.planrejectchecked",cid,approved,template,reject_nonce)[0] is False)
    queue_result(b,[(vms[0],target,ds)])
    unchanged_after_response("late_ready_cannot_revive_rejected_plan",rejected.findtext("PLAN_SHA256"))

    next_request=begin_generate()
    pending_digest=cluster().findtext("PLAN_SHA256")
    queue_result(next_request,[(vms[0],target,ds)],omit_nonce=True)
    unchanged_after_response("unbound_legacy_response_cannot_replace_checked_request",pending_digest)
    queue_result(next_request,[(vms[0],target,ds)],nonce=b["nonce"])
    unchanged_after_response("superseded_request_response_is_discarded",pending_digest)
    queue_result(next_request,[])
    noop=wait_request(next_request["nonce"],"NOOP")
    check("empty_native_result_is_explicit_noop",noop.findtext("PLAN/STATE")=="-1" and not noop.findall("PLAN/ACTION") and len(native_request(noop).findtext("PLAN_GENERATION",""))==64)
    (OUT/"native-cluster-noop.xml").write_text(ET.tostring(noop,encoding="unicode")+"\n")

    b=begin_generate()
    queue_result(b,[],error="controlled native optimizer error")
    failed=wait_request(b["nonce"],"ERROR")
    check("native_optimizer_error_is_not_noop",failed.findtext("PLAN/STATE")=="-1" and native_request(failed).findtext("ERROR") and not failed.findall("PLAN/ACTION"))

    reset_case("planning-policy-drift")
    b=begin_generate()
    ok("one.cluster.update",cid,'ONE_DRS=[AUTOMATION="manual",POLICY="pack",ENABLED="yes"]',1)
    queue_result(b,[(vms[0],target,ds)])
    failed=wait_request(b["nonce"],"ERROR")
    check("policy_drift_prevents_ready",not failed.findall("PLAN/ACTION") and not pending_calls())

    reset_case("planning-request-write")
    before=cluster();template,base=base_args()
    install_failure("request_write","plan_pool","UPDATE","NEW.cid="+str(cid)+" AND NEW.body LIKE '%<STATE>GENERATING</STATE>%'")
    nonce=secrets.token_hex(32)
    check("request_write_failure_rejected",rpc("one.cluster.optimizechecked",cid,template,base,nonce)[0] is False)
    check("no_optimizer_dispatch_before_durable_request",not list((P/"var/checked-api-fixture").glob("*.input.xml")) and cluster().find("PLAN/REQUEST") is None)
    remove_failure("request_write")
    b=begin_generate()
    install_failure("result_write","plan_pool","UPDATE","NEW.cid="+str(cid)+" AND NEW.body LIKE '%<STATE>READY</STATE>%'")
    queue_result(b,[(vms[0],target,ds)])
    time.sleep(.3)
    check("failed_result_write_stays_generating",native_request().findtext("STATE")=="GENERATING" and not cluster().findall("PLAN/ACTION"))
    remove_failure("result_write")
    queue_result(b,[(vms[0],target,ds)])
    wait_request(b["nonce"],"READY")
    check("same_bound_optimizer_result_can_commit_after_write_recovery",not pending_calls())

    reset_case("planning-restart")
    b=begin_generate()
    inputs={p.name for p in (P/"var/checked-api-fixture").glob("*.input.xml")}
    stop();start("planning-after-restart")
    failed=wait_request(b["nonce"],"ERROR")
    check("restart_records_correlated_error_without_optimizer_replay",inputs=={p.name for p in (P/"var/checked-api-fixture").glob("*.input.xml")} and not pending_calls() and "restarted" in native_request(failed).findtext("ERROR",""))
    queue_result(b,[(vms[0],target,ds)])
    unchanged_after_response("pre_restart_response_cannot_revive_request",failed.findtext("PLAN_SHA256"))

    reset_case("planning-timeout")
    b=begin_generate()
    with sqlite3.connect(DB) as con:
        body=ET.fromstring(con.execute("SELECT body FROM plan_pool WHERE cid=?",(cid,)).fetchone()[0])
        put(body,"REQUEST/STARTED_AT",int(time.time())-601)
        con.execute("UPDATE plan_pool SET body=? WHERE cid=?",(ET.tostring(body,encoding="unicode"),cid))
    failed=wait_request(b["nonce"],"ERROR")
    check("optimizer_timeout_is_durable_error",not pending_calls() and "timed out" in native_request(failed).findtext("ERROR",""))

    reset_case("planning-concurrent")
    template,base=base_args();nonces=[secrets.token_hex(32),secrets.token_hex(32)]
    prior={p.name for p in (P/"var/checked-api-fixture").glob("*.input.xml")}
    barrier=threading.Barrier(2)
    def contender(nonce):
        barrier.wait(timeout=5)
        return rpc("one.cluster.optimizechecked",cid,template,base,nonce)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        replies=list(pool.map(contender,nonces))
    check("concurrent_generate_has_exactly_one_winner",sum(x[0] is True for x in replies)==1)
    nonce=nonces[next(i for i,x in enumerate(replies) if x[0] is True)]
    b=capture_checked_input(nonce,template,base,prior)
    queue_result(b,[(vms[0],target,ds)]);ready=wait_request(nonce,"READY")
    plan_hash=ready.findtext("PLAN_SHA256");reject_nonce=secrets.token_hex(32);barrier=threading.Barrier(2)
    def apply_or_reject(action):
        barrier.wait(timeout=5)
        if action=="apply":return rpc("one.cluster.planexecutechecked",cid,plan_hash,template)
        return rpc("one.cluster.planrejectchecked",cid,plan_hash,template,reject_nonce)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        replies=list(pool.map(apply_or_reject,["apply","reject"]))
    check("apply_and_reject_compare_and_swap_one_winner",sum(x[0] is True for x in replies)==1)
    if replies[0][0] is True:
        waitfor(lambda:len(pending_calls())==1)
        release_driver("MIGRATE",vms[0]);waitfor(lambda:cluster().findtext("PLAN/STATE")=="2")
        check("apply_winner_cannot_be_relabelled_rejected",native_request().findtext("NONCE")==b["nonce"])
    else:
        wait_request(reject_nonce,"REJECTED")
        check("reject_winner_never_dispatches_migration",not pending_calls())

    reset_case("planning-group-review")
    group=int(ok("one.vmgroup.allocate",'NAME="planning-group" ROLE=[NAME="workers"]'))
    ok("one.vm.vmgroupadd",vms[0],group,"workers")
    b=begin_generate();queue_result(b,[(vms[0],target,ds)])
    ready=wait_request(b["nonce"],"READY")
    check("group_recommendations_remain_reviewable",len(ready.findall("PLAN/ACTION"))==1 and ready.findtext("ONE_DRS_PLAN_ELIGIBILITY/STATE")=="UNSUPPORTED")
    check("unqualified_group_apply_remains_rejected",apply()[0] is False and not pending_calls())

    reset_case("planning-auth-and-empty")
    password=secrets.token_urlsafe(32)
    uid=int(ok("one.user.allocate","planning-scoped",password,"core",[1]))
    session="planning-scoped:"+password
    template,base=base_args()
    check("native_unauthorized_generate_rejected",as_user(session,"one.cluster.optimizechecked",cid,template,base,secrets.token_hex(32))[0] is False)
    check("native_unauthorized_reject_rejected",as_user(session,"one.cluster.planrejectchecked",cid,"a"*64,template,secrets.token_hex(32))[0] is False)
    ok("one.acl.addrule",format(0x100000000 | uid,"x"),format(0x200000000000 | 0x100000000 | cid,"x"),"5","100000000")
    nonce=secrets.token_hex(32);prior={p.name for p in (P/"var/checked-api-fixture").glob("*.input.xml")}
    check("exact_scoped_cluster_admin_can_generate",as_user(session,"one.cluster.optimizechecked",cid,template,base,nonce)[0] is True)
    b=capture_checked_input(nonce,template,base,prior);queue_result(b,[])
    wait_request(nonce,"NOOP")
    for malformed in ["","a"*63,"A"*64,"z"*64]:
        template,base=base_args()
        check("invalid_request_nonce_rejected_"+str(len(malformed))+"_"+malformed[:1],rpc("one.cluster.optimizechecked",cid,template,base,malformed)[0] is False)
    original=cid
    try:
        cid=int(ok("one.cluster.allocate","planning-empty"))
        ok("one.cluster.update",cid,policy(),1)
        template,base=base_args();nonce=secrets.token_hex(32)
        count=len(list((P/"var/checked-api-fixture").glob("*.input.xml")))
        check("empty_cluster_generate_accepted",rpc("one.cluster.optimizechecked",cid,template,base,nonce)[0] is True)
        empty=wait_request(nonce,"NOOP")
        check("empty_cluster_noop_is_native_without_driver_request",empty.findtext("PLAN/STATE")=="-1" and len(list((P/"var/checked-api-fixture").glob("*.input.xml")))==count)
    finally:cid=original

try:
    start("bootstrap")
    cid=int(ok("one.cluster.allocate","capacity-disposable"))
    ok("one.cluster.update",cid,policy(),1)
    caps=cluster().find("ONE_DRS_CHECKED_CAPABILITIES")
    check("native_capability_v3_eligibility_scope",caps is not None and caps.findtext("VERSION")=="3" and caps.findtext("CAPACITY")=="ATOMIC" and caps.findtext("MIGRATION")=="RUNNING_UNPINNED_NO_PCI_NO_VMGROUP_SAME_DATASTORE_CROSS_HOST" and caps.findtext("ELIGIBILITY")=="SOURCE_BOUND_CURRENT_OWNER_REQUIREMENTS")
    check("native_checked_planning_capabilities",caps.findtext("GENERATE")=="REQUEST_NONCE_POLICY_PLAN_CAS" and caps.findtext("REJECT")=="READY_GENERATION_POLICY_PLAN_CAS")
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
    planning_suite()
    RESULT["status"]="PASS"
except Exception as exc:
    RESULT["status"]="FAIL";RESULT["error"]=str(exc)
    raise
finally:
    try:stop()
    finally:
        RESULT["finished_at"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        (OUT/"planning-result.json").write_text(json.dumps(RESULT,indent=2)+"\n")
        print(json.dumps({"status":RESULT.get("status"),"checks":len(RESULT["checks"]),"error":RESULT.get("error")}),flush=True)
