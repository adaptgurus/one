#!/usr/bin/env bash
set -euo pipefail
ROOT_STATE=/var/lib/layersentry/agent-root
AGENT_STATE=/var/lib/layersentry/agent
PENDING="$ROOT_STATE/pending-release.json"
HEALTHY="$AGENT_STATE/healthy-version"
[[ -f "$PENDING" && -f "$HEALTHY" ]] || exit 0
readarray -t data < <(python3 - "$PENDING" "$HEALTHY" <<'PY'
import json, pathlib, sys
p=json.load(open(sys.argv[1]))
h=pathlib.Path(sys.argv[2]).read_text().strip()
print(p.get('version',''))
print(h)
PY
)
[[ -n "${data[0]:-}" && "${data[0]}" == "${data[1]:-}" ]] || exit 0
rm -f "$PENDING" "$HEALTHY"
sync -f "$ROOT_STATE" 2>/dev/null || true
