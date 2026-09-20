#!/usr/bin/env bash
set -euo pipefail

find_vm_id() {
  local test_user="$1"
  local vm_name="$2"
  onevm list -x | python3 -c '
import sys
import xml.etree.ElementTree as ET
user, name = sys.argv[1:3]
root = ET.parse(sys.stdin).getroot()
ids = [
    vm.findtext("ID")
    for vm in root.findall("VM")
    if vm.findtext("UNAME") == user and vm.findtext("NAME") == name
]
print(ids[-1] if ids else "")
' "${test_user}" "${vm_name}"
}

MODE="${1:?readback|cleanup required}"

if [[ "${MODE}" == "readback" ]]; then
  TEST_USER="${2:?user required}"
  VM_NAME="${3:?vm name required}"
  OUT="${4:?output required}"
  VMID="$(find_vm_id "${TEST_USER}" "${VM_NAME}")"
  [[ -n "${VMID}" ]] || { echo "VM not found: ${TEST_USER}/${VM_NAME}" >&2; exit 2; }

  STAT=""
  for _ in $(seq 1 90); do
    STAT="$(onevm list | awk -v id="${VMID}" '$1 == id {print $5}')"
    [[ "${STAT}" == "runn" ]] && break
    [[ "${STAT}" == "fail" ]] && break
    sleep 2
  done

  umask 077
  {
    printf 'VMID=%s\nSTAT=%s\n' "${VMID}" "${STAT}"
    onevm show "${VMID}" -x | python3 -c '
import sys
import xml.etree.ElementTree as ET
vm = ET.parse(sys.stdin).getroot()
def emit(k, v):
    if v is not None:
        print(f"{k}={v}")
emit("ID", vm.findtext("ID"))
emit("NAME", vm.findtext("NAME"))
emit("UNAME", vm.findtext("UNAME"))
emit("GNAME", vm.findtext("GNAME"))
emit("STATE", vm.findtext("STATE"))
emit("LCM_STATE", vm.findtext("LCM_STATE"))
emit("TEMPLATE_ID", vm.findtext("TEMPLATE_ID") or vm.findtext(".//TEMPLATE_ID"))
for i, disk in enumerate(vm.findall("./TEMPLATE/DISK")):
    emit(f"DISK_{i}_IMAGE_ID", disk.findtext("IMAGE_ID"))
for i, nic in enumerate(vm.findall("./TEMPLATE/NIC")):
    emit(f"NIC_{i}_NETWORK_ID", nic.findtext("NETWORK_ID"))
    emit(f"NIC_{i}_NETWORK", nic.findtext("NETWORK"))
'
  } > "${OUT}"

  [[ "${STAT}" == "runn" ]] || { echo "VM did not reach RUNNING; state=${STAT}" >&2; exit 3; }

elif [[ "${MODE}" == "cleanup" ]]; then
  TEST_USER="${2:?user required}"
  VM_NAME="${3:?vm name required}"
  UIDN="${4:?uid required}"
  GID="${5:?gid required}"

  VMID="$(find_vm_id "${TEST_USER}" "${VM_NAME}")"
  if [[ -n "${VMID}" ]]; then
    onevm terminate --hard "${VMID}" >/dev/null 2>&1 || true
    for _ in $(seq 1 60); do
      onevm show "${VMID}" >/dev/null 2>&1 || break
      sleep 1
    done
    onevm show "${VMID}" >/dev/null 2>&1 && {
      echo "VM cleanup failed for ${VMID}" >&2
      exit 4
    }
  fi

  while read -r acl; do
    [[ -n "${acl}" ]] && oneacl delete "${acl}" >/dev/null 2>&1 || true
  done < <(oneacl list | awk -v u="#${UIDN}" -v g="@${GID}" '$2 == u || $2 == g {print $1}')

  oneuser delete "${UIDN}" >/dev/null 2>&1 || true
  onegroup delete "${GID}" >/dev/null 2>&1 || true

  oneuser show "${UIDN}" >/dev/null 2>&1 && { echo "User cleanup failed" >&2; exit 5; }
  onegroup show "${GID}" >/dev/null 2>&1 && { echo "Group cleanup failed" >&2; exit 6; }
  exit 0
else
  echo "Unknown mode: ${MODE}" >&2
  exit 7
fi
