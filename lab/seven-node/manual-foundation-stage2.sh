#!/usr/bin/env bash
set -euo pipefail
umask 077

RUN_ID="${1:?run id required}"
ROOT=/root/layersentry-manual-deploy
REPO="$ROOT/one-deploy"
INVENTORY="$ROOT/inventory.yml"
VAULT_PASS="$ROOT/vault-pass"
VAULT_VARS="$ROOT/vault-vars.yml"
KNOWN_HOSTS="$ROOT/known_hosts"
LOG="$ROOT/logs/stage2-$RUN_ID.log"
SITE_LOG="$ROOT/logs/one-deploy-site-$RUN_ID.log"
VERIFY_LOG="$ROOT/logs/site-verify-$RUN_ID.log"
EVIDENCE="/srv/layersentry/nfs/images/evidence/seven-node-foundation/$RUN_ID"

test -f "$ROOT/STAGE1_COMPLETE"
test -d "$REPO/.git"
test -f "$INVENTORY"
test -f "$VAULT_PASS"
test -f "$VAULT_VARS"
mkdir -p "$EVIDENCE"

exec > >(tee -a "$LOG") 2>&1
echo "utc=$(date -u +%FT%TZ)"
echo "stage=manual-foundation-stage2"
echo "controller=$(hostname)"

cd "$REPO"
export ANSIBLE_HOST_KEY_CHECKING=True
export ANSIBLE_SSH_ARGS="-q -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS"
EXTRA=(--vault-password-file "$VAULT_PASS" -e "@$VAULT_VARS")

ansible-playbook -i "$INVENTORY" --syntax-check "${EXTRA[@]}" opennebula.deploy.site

set +e
ansible-playbook -vv -i "$INVENTORY" "${EXTRA[@]}" opennebula.deploy.site > "$SITE_LOG" 2>&1
SITE_RC=$?
set -e

cp "$LOG" "$EVIDENCE/"
cp "$SITE_LOG" "$EVIDENCE/"
echo "ONEDEPLOY_SITE_RC=$SITE_RC"
if [[ "$SITE_RC" -ne 0 ]]; then
  tail -n 300 "$SITE_LOG"
  sha256sum "$EVIDENCE"/* > "$EVIDENCE/STAGE2_SHA256SUMS" || true
  exit "$SITE_RC"
fi

{
  echo "=== FRONTEND SERVICES ==="
  ansible -i "$INVENTORY" frontend -m shell -a "systemctl is-active opennebula; systemctl is-active mariadb; systemctl is-active opennebula-fireedge 2>/dev/null || systemctl is-active opennebula-sunstone 2>/dev/null || true" "${EXTRA[@]}"

  echo "=== COMPUTE KVM ==="
  ansible -i "$INVENTORY" node -m shell -a "test -c /dev/kvm; virsh -c qemu:///system list --all >/dev/null; echo KVM_READY=PASS" "${EXTRA[@]}"

  echo "=== NFS MOUNTS ==="
  ansible -i "$INVENTORY" all -m shell -a "findmnt -n /srv/layersentry/nfs/workload; findmnt -n /srv/layersentry/nfs/images" "${EXTRA[@]}"

  echo "=== OPENNEBULA INVENTORY ==="
  ansible -i "$INVENTORY" layersentry3 -m shell -a "runuser -u oneadmin -- onehost list; runuser -u oneadmin -- onedatastore list; runuser -u oneadmin -- onecluster list; runuser -u oneadmin -- onevm list" "${EXTRA[@]}"

  echo "=== NEW SITE TO TESTER ROUTE ==="
  for ip in 10.10.10.21 10.10.10.22 10.10.10.23; do
    for port in 22 2633 19444 19445; do
      if timeout 3 bash -c "</dev/tcp/$ip/$port" 2>/dev/null; then
        echo "NEW_SITE_TO_TESTER ip=$ip port=$port tcp=PASS"
      else
        echo "NEW_SITE_TO_TESTER ip=$ip port=$port tcp=FAIL"
      fi
    done
  done
} | tee "$VERIFY_LOG"

for host in layersentry1 layersentry2 layersentry4; do
  ansible -i "$INVENTORY" layersentry3 -m shell -a "runuser -u oneadmin -- onehost list | grep -q '$host'" "${EXTRA[@]}" >/dev/null
done

for dsid in 0 1 2; do
  ansible -i "$INVENTORY" layersentry3 -m shell -a "runuser -u oneadmin -- onedatastore show $dsid >/dev/null" "${EXTRA[@]}" >/dev/null
done

if timeout 8 bash -c '</dev/tcp/172.17.60.20/2633' 2>/dev/null; then
  echo "OPENNEBULA_VIP_2633=PASS" | tee -a "$VERIFY_LOG"
else
  echo "OPENNEBULA_VIP_2633=FAIL" | tee -a "$VERIFY_LOG" >&2
  exit 51
fi

cp "$VERIFY_LOG" "$EVIDENCE/"
sha256sum "$EVIDENCE"/* > "$EVIDENCE/STAGE2_SHA256SUMS"
touch "$ROOT/FOUNDATION_COMPLETE"
echo "SEVEN_NODE_FOUNDATION=PASS"
