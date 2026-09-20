#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${1:?state-file path required}"
STAMP="$(date +%Y%m%d%H%M%S)"
TEST_GROUP="ls-ui-e2e-${STAMP}"
TEST_USER="ls-ui-e2e-${STAMP}"
TEST_PASS="LsE2E-$(openssl rand -hex 12)"
GID=""
UIDN=""

cleanup_partial() {
  set +e
  if [[ -n "${UIDN}" ]]; then
    while read -r acl; do
      [[ -n "${acl}" ]] && oneacl delete "${acl}" >/dev/null 2>&1 || true
    done < <(oneacl list | awk -v u="#${UIDN}" -v g="@${GID}" '$2 == u || $2 == g {print $1}')
    oneuser delete "${UIDN}" >/dev/null 2>&1 || true
  fi
  [[ -n "${GID}" ]] && onegroup delete "${GID}" >/dev/null 2>&1 || true
  rm -f "/tmp/${TEST_GROUP}.tmpl" "${STATE_FILE}"
}
trap cleanup_partial ERR

GID="$(onegroup create "${TEST_GROUP}" | awk '/^ID:/ {print $2} /^[0-9]+$/ {print $1}' | tail -1)"
[[ "${GID}" =~ ^[0-9]+$ ]] || { echo "Invalid group ID: ${GID}" >&2; exit 8; }
cat > "/tmp/${TEST_GROUP}.tmpl" <<'EOF'
FIREEDGE = [
  DEFAULT_VIEW = "cloud",
  VIEWS = "cloud"
]
EOF
onegroup update "${GID}" "/tmp/${TEST_GROUP}.tmpl"
UIDN="$(oneuser create "${TEST_USER}" "${TEST_PASS}" --group "${GID}" | awk '/^ID:/ {print $2} /^[0-9]+$/ {print $1}' | tail -1)"
[[ "${UIDN}" =~ ^[0-9]+$ ]] || { echo "Invalid user ID: ${UIDN}" >&2; exit 9; }

acl_id() {
  oneacl create "$1" | awk '/ID:/ {print $2}'
}

ACL_VM_CREATE="$(acl_id "#${UIDN} VM/* CREATE")"
ACL_TEMPLATE="$(acl_id "#${UIDN} TEMPLATE/#0 USE")"
ACL_IMAGE="$(acl_id "#${UIDN} IMAGE/#0 USE")"
ACL_NET="$(acl_id "#${UIDN} NET/#0 USE")"

umask 077
cat > "${STATE_FILE}" <<EOF
USER=${TEST_USER}
PASS=${TEST_PASS}
UID=${UIDN}
GROUP=${TEST_GROUP}
GID=${GID}
ACL_VM_CREATE=${ACL_VM_CREATE}
ACL_TEMPLATE=${ACL_TEMPLATE}
ACL_IMAGE=${ACL_IMAGE}
ACL_NET=${ACL_NET}
EOF

rm -f "/tmp/${TEST_GROUP}.tmpl"
trap - ERR
