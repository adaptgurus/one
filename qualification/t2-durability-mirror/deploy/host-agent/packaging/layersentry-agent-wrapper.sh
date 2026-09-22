#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/layersentry/agent
ROOT_STATE=/var/lib/layersentry/agent-root
AGENT_STATE=/var/lib/layersentry/agent
CURRENT="$ROOT/current/layersentry-host-agent"
PENDING="$ROOT_STATE/pending-release.json"
HEALTHY="$AGENT_STATE/healthy-version"
CONFIG=/etc/layersentry/host-agent.json

install -d -o root -g root -m 0700 "$ROOT_STATE"

if [[ -f "$PENDING" ]]; then
  readarray -t data < <(python3 - "$PENDING" "$HEALTHY" <<'PY'
import json,sys,pathlib
p=json.load(open(sys.argv[1]))
healthy=pathlib.Path(sys.argv[2]).read_text().strip() if pathlib.Path(sys.argv[2]).exists() else ""
print(p.get("version", ""))
print(p.get("previous", ""))
print(int(p.get("attempts", 0)))
print(healthy)
PY
)
  version="${data[0]:-}"
  previous="${data[1]:-}"
  attempts="${data[2]:-0}"
  healthy="${data[3]:-}"

  if [[ -n "$version" && "$healthy" == "$version" ]]; then
    rm -f "$PENDING" "$HEALTHY"
  elif (( attempts >= 3 )); then
    case "$previous" in
      "$ROOT"/releases/*)
        ln -sfn "$previous" "$ROOT/current.new"
        mv -Tf "$ROOT/current.new" "$ROOT/current"
        rm -f "$PENDING" "$HEALTHY"
        ;;
      *)
        echo "LayerSentry agent rollback refused: invalid previous release path" >&2
        exit 70
        ;;
    esac
  else
    python3 - "$PENDING" <<'PY'
import json,os,sys,tempfile
path=sys.argv[1]
p=json.load(open(path)); p["attempts"]=int(p.get("attempts",0))+1
fd,tmp=tempfile.mkstemp(dir=os.path.dirname(path),prefix='.pending-')
with os.fdopen(fd,'w') as f:
    json.dump(p,f,sort_keys=True); f.write('\n'); f.flush(); os.fsync(f.fileno())
os.chmod(tmp,0o600); os.replace(tmp,path)
PY
  fi
fi

[[ -x "$CURRENT" ]] || { echo "LayerSentry agent current binary is missing" >&2; exit 71; }

CLIENT_CERT=/var/lib/layersentry/agent/pki/client.crt
CLIENT_KEY=/var/lib/layersentry/agent/pki/client.key
BOOTSTRAP=/etc/layersentry/bootstrap-token

if [[ ! -s "$CLIENT_CERT" || ! -s "$CLIENT_KEY" ]]; then
  [[ -s "$BOOTSTRAP" ]] || { echo "LayerSentry enrollment material is missing" >&2; exit 72; }
  /usr/sbin/runuser -u layersentry-agent -- "$CURRENT" enroll --config "$CONFIG"
  [[ -s "$CLIENT_CERT" && -s "$CLIENT_KEY" ]] || { echo "LayerSentry enrollment did not persist client identity" >&2; exit 73; }
  rm -f -- "$BOOTSTRAP"
  sync -f /etc/layersentry 2>/dev/null || true
fi

exec /usr/sbin/runuser -u layersentry-agent -- "$CURRENT" run --config "$CONFIG"
