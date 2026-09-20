#!/usr/bin/env bash
set -euo pipefail

CFG="/etc/one/fireedge/sunstone/sunstone-server.conf"
MODE="${1:?enable|restore required}"

wait_ready() {
  local code="000"
  for _ in $(seq 1 45); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:2616/fireedge/layersentry || true)"
    if [[ "${code}" == "200" || "${code}" == "302" ]]; then
      printf 'HTTP=%s\n' "${code}"
      return 0
    fi
    sleep 1
  done
  echo "FireEdge did not return HTTP 200/302" >&2
  return 1
}

if [[ "${MODE}" == "enable" ]]; then
  STATE_FILE="${2:?state-file required}"
  STAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP="/var/backups/layersentry/sunstone-server.vm-create-livequal-${STAMP}.conf"
  mkdir -p /var/backups/layersentry
  cp -a "${CFG}" "${BACKUP}"

  python3 - "${CFG}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
marker = "layersentry_capabilities:\n"
if marker not in text:
    raise SystemExit("layersentry_capabilities section missing")
if "\n  VM_CREATE:\n" in text:
    raise SystemExit("VM_CREATE already present before temporary qualification")

block = """  VM_CREATE:
    enabled: true
    implementation: true
    backend: true
    configuration: true
    health: true
    authorization: true
    compatibility: true
    qualification: true
    readOnly: false
    reason: 'Temporary live qualification only; restore after E2E.'
"""
path.write_text(text.replace(marker, marker + block, 1))
PY

  systemctl restart opennebula-fireedge
  systemctl is-active --quiet opennebula-fireedge
  wait_ready
  umask 077
  printf 'BACKUP=%s\n' "${BACKUP}" > "${STATE_FILE}"
  chmod 0644 "${STATE_FILE}"
elif [[ "${MODE}" == "restore" ]]; then
  BACKUP="${2:?backup path required}"
  test -f "${BACKUP}"
  cp -a "${BACKUP}" "${CFG}"
  systemctl restart opennebula-fireedge
  systemctl is-active --quiet opennebula-fireedge
  wait_ready
else
  echo "Unknown mode: ${MODE}" >&2
  exit 2
fi
