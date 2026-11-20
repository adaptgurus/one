#!/usr/bin/python3
"""Private namespace-only driver protocol recorder; never executes a driver payload."""
import json, os, sys, time, threading, hashlib
from pathlib import Path
P=Path(os.environ["ONE_LOCATION"]).resolve()
if P.name!="prefix" or not P.parent.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("private prefix required")
root=P/"var/capacity-fixture"
root.mkdir(exist_ok=True)
mode=sys.argv[1] if len(sys.argv)>1 else "vmm"
lock=threading.Lock()
pending=[]
stop=threading.Event()
def send(op,ident="",result="SUCCESS",extra=""):
    with lock:
        print(" ".join(x for x in [op,result,ident,extra] if x),flush=True)
def controller():
    while not stop.wait(.02):
        for path in root.glob("callback-*.json"):
            item = json.loads(path.read_text())
            if item["mode"] != mode:
                continue
            send(item["operation"], str(item["id"]), item.get("result", "SUCCESS"), item.get("extra", ""))
            path.rename(path.with_suffix(".sent"))
        with lock:
            work=list(pending)
        for op,ident in work:
            release=root/("release-"+op+"-"+ident)
            if release.exists():
                result=release.read_text().strip() or "SUCCESS"
                send(op,ident,result,"fixture-"+ident if op=="DEPLOY" and result=="SUCCESS" else "")
                release.unlink()
                with lock:pending.remove((op,ident))
thread=threading.Thread(target=controller,daemon=True);thread.start()
for line in sys.stdin:
    parts=line.strip().split(None,2)
    if not parts:continue
    op=parts[0];ident=parts[1] if len(parts)>1 else ""
    if op=="INIT":
        send("INIT");continue
    if op=="FINALIZE":break
    item={"time":time.time(),"mode":mode,"operation":op,"id":ident,
          "payload_sha256":hashlib.sha256((parts[2] if len(parts)>2 else "").encode()).hexdigest()}
    with lock:
        with (root/"driver.jsonl").open("a") as f:f.write(json.dumps(item)+"\n")
    if mode=="im":continue
    controls=json.loads((root/"control.json").read_text()) if (root/"control.json").exists() else {}
    policy=controls.get(op,"SUCCESS")
    if policy=="HOLD":
        with lock:pending.append((op,ident))
    elif op=="POLL":
        send(op,ident,policy,"STATE=a CPU=0 MEMORY=0")
    else:
        send(op,ident,policy,"fixture-"+ident if op=="DEPLOY" else "")
stop.set();thread.join(timeout=1)
