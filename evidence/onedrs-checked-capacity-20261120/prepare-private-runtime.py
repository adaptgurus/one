#!/usr/bin/python3
from pathlib import Path
import os, json, re, secrets, shutil, subprocess, sys, hashlib
D=Path(sys.argv[1]).resolve()
if D.parent!=Path("/root") or not D.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("dedicated private runtime required")
if D.exists():raise SystemExit("refusing existing runtime")
base=Path("/root/ls-onedrs-checked-api-runtime-vendor-r14-acl-r3-20261120/prefix")
binary=Path(sys.argv[2] if len(sys.argv)>2 else "/root/ls-onedrs-r15-vendor-build-20261120/src/nebula/oned")
build=json.loads(Path("/root/ls-onedrs-r15-native-evidence-20261120/capacity-build-r3-result.json").read_text())
assert build["status"]=="PASS" and hashlib.sha256(binary.read_bytes()).hexdigest()==build["artifacts"]["src/nebula/oned"]["sha256"]
D.mkdir(mode=0o700);(D/"evidence").mkdir()
subprocess.run(["cp","-a","--reflink=auto",str(base),str(D/"prefix")],check=True)
P=D/"prefix"
for f in (P/"var").glob("one.db*"):f.unlink()
for sub in [P/"var/.one",P/"var/.ssh",P/"log",P/"var/checked-api-fixture"]:
    if sub.exists():shutil.rmtree(sub)
    sub.mkdir(mode=0o700)
for sub in ["lock","run"]:
    p=P/"var"/sub
    if p.exists():shutil.rmtree(p)
    p.mkdir()
auth=P/"var/.one/one_auth";auth.write_text("oneadmin:"+secrets.token_urlsafe(40)+"\n");auth.chmod(0o600)
for x in (P/"etc").rglob("*.conf"):
    if x.is_symlink():continue
    t=x.read_text(errors="strict")
    t=t.replace(str(base),str(P)).replace("/root/onedrs-pr54-runtime-package-20261113/prefix",str(P))
    x.write_text(t)
conf=P/"etc/oned.conf";t=conf.read_text()
replacements={
"VM_MAD":'VM_MAD = [NAME="capacity", EXECUTABLE="native_capacity_mad_fixture.py", ARGUMENTS="vmm", TYPE="kvm", KEEP_SNAPSHOTS="yes", LIVE_RESIZE="yes"]',
"IM_MAD":'IM_MAD = [NAME="capacity", EXECUTABLE="native_capacity_mad_fixture.py", ARGUMENTS="im", THREADS=1]',
"TM_MAD":'TM_MAD = [EXECUTABLE="native_capacity_mad_fixture.py", ARGUMENTS="tm"]'
}
for name,value in replacements.items():
    found=[False]
    def repl(m):
        if found[0]:return ""
        found[0]=True;return value
    t=re.sub(r"(?ms)^"+name+r"\s*=\s*\[.*?\]",repl,t)
    assert found[0],name
for name,value in {"MANAGER_TIMER":1,"ACTION_TIMEOUT":30,"MAX_ACTIONS_PER_HOST":3,"MAX_ACTIONS_PER_CLUSTER":30,"LIVE_RESCHEDS":1,"DRS_INTERVAL":-1,"MONITORING_INTERVAL_DATASTORE":86400,"MONITORING_INTERVAL_MARKET":86400}.items():
    pattern=r"(?m)^"+name+r"\s*=.*$"
    if re.search(pattern,t):t=re.sub(pattern,name+" = "+str(value),t)
    else:t+="\n"+name+" = "+str(value)+"\n"
conf.write_text(t)
source=Path("/root/ls-onedrs-ci-portable-20261120/tools/onedrs_qualification")
for name,dest in [("native_capacity_mad_fixture.py","native_capacity_mad_fixture.py"),("native_plan_mad_fixture.py","one_sched")]:
    shutil.copy2(source/name,P/"lib/mads"/dest);(P/"lib/mads"/dest).chmod(0o700)
subprocess.run(["cp","--reflink=auto",str(binary),str(D/"candidate-oned")],check=True)
(D/"host-namespaces.json").write_text(json.dumps({n:os.readlink("/proc/self/ns/"+n) for n in ["mnt","net","pid"]}))
(P/"var/capacity-fixture").mkdir()
(P/"var/capacity-fixture/control.json").write_text(json.dumps({"MIGRATE":"HOLD"}))
print(json.dumps({"runtime":str(D),"binary_sha256":build["artifacts"]["src/nebula/oned"]["sha256"],"original_services_changed":False}))
