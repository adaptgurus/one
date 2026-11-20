#!/usr/bin/python3
"""Test-only scheduler MAD for the isolated native API contract harness."""
import base64
import json
import os
from pathlib import Path
import sys
import threading
import time

prefix = Path(os.environ["ONE_LOCATION"]).resolve()
if prefix.name != "prefix" or not prefix.parent.name.startswith("ls-onedrs-checked-api-runtime-"):
    raise SystemExit("This fixture requires a dedicated private test prefix")
queue = prefix / "var/checked-api-fixture"
stop = threading.Event()
output = threading.Lock()

def send(line):
    with output:
        print(line, flush=True)

def feed():
    while not stop.wait(0.02):
        for path in sorted(queue.glob("*.json")):
            item = json.loads(path.read_text())
            encoded = base64.b64encode(item["xml"].encode()).decode()
            send("OPTIMIZE SUCCESS " + str(item["cid"]) + " " + encoded)
            path.rename(path.with_suffix(".sent"))

thread = None
for line in sys.stdin:
    operation = line.split()[0] if line.split() else ""
    if operation == "INIT":
        send("INIT SUCCESS")
        thread = threading.Thread(target=feed, daemon=True)
        thread.start()
    elif operation == "FINALIZE":
        break
stop.set()
if thread is not None:
    thread.join(timeout=2)
