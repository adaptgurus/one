#!/usr/bin/env bash
set -euo pipefail
umask 077

RUN_ID="${1:?run id required}"
ROOT=/root/layersentry-manual-deploy
LOCK="$ROOT/locks/run-$RUN_ID"
mkdir -p "$ROOT/locks" "$ROOT/logs"

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "MANUAL_STAGE1=SKIPPED_ALREADY_CLAIMED"
  exit 0
fi

cleanup_plaintext() {
  if [[ -f "$ROOT/.root-pass.tmp" ]]; then
    shred -u "$ROOT/.root-pass.tmp" 2>/dev/null || rm -f "$ROOT/.root-pass.tmp"
  fi
}
trap cleanup_plaintext EXIT

IFS= read -r ROOT_PASS
if [[ -z "$ROOT_PASS" ]]; then
  echo "missing bootstrap password on stdin" >&2
  exit 2
fi
printf '%s\n' "$ROOT_PASS" > "$ROOT/.root-pass.tmp"
chmod 600 "$ROOT/.root-pass.tmp"
unset ROOT_PASS

LOG="$ROOT/logs/stage1-$RUN_ID.log"
exec > >(tee -a "$LOG") 2>&1
echo "utc=$(date -u +%FT%TZ)"
echo "stage=manual-foundation-stage1"
echo "controller=$(hostname)"
echo "one_deploy_commit=13f8d02692dc415fa5efb3305699b3db42e7d6f9"

dnf -y install epel-release dnf-plugins-core git make python3 python3-pip python3-devel gcc gcc-c++ ansible-core sshpass nfs-utils rsync openssl iputils

REPO="$ROOT/one-deploy"
if [[ ! -d "$REPO/.git" ]]; then
  git clone https://github.com/OpenNebula/one-deploy.git "$REPO"
fi
git -C "$REPO" fetch --tags --prune
git -C "$REPO" checkout --detach 13f8d02692dc415fa5efb3305699b3db42e7d6f9
test "$(git -C "$REPO" rev-parse HEAD)" = "13f8d02692dc415fa5efb3305699b3db42e7d6f9"
cd "$REPO"
make requirements
echo "ONEDEPLOY_REQUIREMENTS=PASS"

: > "$ROOT/known_hosts"
chmod 600 "$ROOT/known_hosts"
echo "SSH_KNOWN_HOSTS_BOOTSTRAP=TOFU_FIXED_IPS"

VAULT_PASS="$ROOT/vault-pass"
VAULT_VARS="$ROOT/vault-vars.yml"
if [[ ! -f "$VAULT_PASS" ]]; then
  openssl rand -hex 24 > "$VAULT_PASS"
  chmod 600 "$VAULT_PASS"
fi
ROOT_PASS="$(cat "$ROOT/.root-pass.tmp")"
ONE_PASS="$(openssl rand -hex 24)"
printf 'ansible_password: %s\none_pass: %s\n' "$ROOT_PASS" "$ONE_PASS" > "$VAULT_VARS"
chmod 600 "$VAULT_VARS"
ansible-vault encrypt --vault-password-file "$VAULT_PASS" "$VAULT_VARS" >/dev/null
unset ROOT_PASS ONE_PASS
cleanup_plaintext

INVENTORY="$ROOT/inventory.yml"
cat > "$INVENTORY" <<'EOF'
---
all:
  vars:
    env_name: layersentry-seven-node
    ansible_python_interpreter: /usr/bin/python3
    ansible_user: root
    ensure_hosts: true
    one_version: '7.4.1'
    db_backend: MariaDB
    unsafe_migrations: false
    one_vip: 172.17.60.20
    one_vip_cidr: 26
    one_vip_if: enp6s18
    opennebula_repo_url:
      RedHat: https://downloads.opennebula.io/repo/7.4/RedHat
    opennebula_repo_pre_enable:
      Rocky:
        subscription_manager:
          '9': []
        config_manager:
          '9': [crb, highavailability]
        extra_repos:
          '9': []
        extra_rpms:
          '9': [https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm]
    ds:
      mode: generic
      config:
        SYSTEM_DS:
          system:
            id: 0
            managed: true
            enabled: true
            symlink:
              groups: [node]
              src: /srv/layersentry/nfs/workload/system/0/
            template:
              TYPE: SYSTEM_DS
              TM_MAD: shared
              BRIDGE_LIST: "{{ groups.node | map('extract', hostvars, ['ansible_host']) | join(' ') }}"
        IMAGE_DS:
          default:
            id: 1
            managed: true
            symlink:
              groups: [frontend, node]
              src: /srv/layersentry/nfs/images/images/1/
            template:
              TYPE: IMAGE_DS
              DS_MAD: fs
              TM_MAD: shared
              DISK_TYPE: FILE
        FILE_DS:
          files:
            id: 2
            managed: true
            symlink:
              groups: [frontend]
              src: /srv/layersentry/nfs/images/files/2/
            template:
              TYPE: FILE_DS
              DS_MAD: fs
              TM_MAD: ssh

frontend:
  hosts:
    layersentry3: { ansible_host: 172.17.60.32 }
    layersentry5: { ansible_host: 172.17.60.34 }
    layersentry6: { ansible_host: 172.17.60.35 }

node:
  hosts:
    layersentry1: { ansible_host: 172.17.60.30 }
    layersentry2: { ansible_host: 172.17.60.31 }
    layersentry4: { ansible_host: 172.17.60.33 }
EOF
chmod 600 "$INVENTORY"

export ANSIBLE_HOST_KEY_CHECKING=True
export ANSIBLE_SSH_ARGS="-q -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$ROOT/known_hosts"
EXTRA=(--vault-password-file "$VAULT_PASS" -e "@$VAULT_VARS")

ansible -i "$INVENTORY" all -m ping "${EXTRA[@]}"
for ip in 172.17.60.30 172.17.60.31 172.17.60.32 172.17.60.33 172.17.60.34 172.17.60.35; do
  if ! ssh-keygen -F "$ip" -f "$ROOT/known_hosts" >/dev/null 2>&1; then
    echo "SSH_HOSTKEY_RECORD=FAIL ip=$ip" >&2
    exit 32
  fi
  echo "SSH_HOSTKEY_RECORD=PASS ip=$ip"
done
export ANSIBLE_SSH_ARGS="-q -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$ROOT/known_hosts"
echo "SSH_KNOWN_HOSTS_STRICT=PASS"

NFS_CMD="dnf -y install nfs-utils >/tmp/layersentry-nfs-utils.log; \
mkdir -p /srv/layersentry/nfs/workload /srv/layersentry/nfs/images; \
grep -Fq '172.17.60.210:/Pool_NVME1/Backup_NVME_DATA/NFS_shared_Mountpoint /srv/layersentry/nfs/workload ' /etc/fstab || \
echo '172.17.60.210:/Pool_NVME1/Backup_NVME_DATA/NFS_shared_Mountpoint /srv/layersentry/nfs/workload nfs4 rw,hard,_netdev,nosuid,nodev,vers=4.2,timeo=600,retrans=2 0 0' >> /etc/fstab; \
grep -Fq '172.17.60.210:/Pool_NVME1/images_repo/IMD_images /srv/layersentry/nfs/images ' /etc/fstab || \
echo '172.17.60.210:/Pool_NVME1/images_repo/IMD_images /srv/layersentry/nfs/images nfs4 rw,hard,_netdev,nosuid,nodev,vers=4.2,timeo=600,retrans=2 0 0' >> /etc/fstab; \
mountpoint -q /srv/layersentry/nfs/workload || mount /srv/layersentry/nfs/workload; \
mountpoint -q /srv/layersentry/nfs/images || mount /srv/layersentry/nfs/images; \
findmnt -n /srv/layersentry/nfs/workload; findmnt -n /srv/layersentry/nfs/images"
ansible -i "$INVENTORY" all -m shell -a "$NFS_CMD" "${EXTRA[@]}"

touch /srv/layersentry/nfs/workload/.layersentry-write-test
rm -f /srv/layersentry/nfs/workload/.layersentry-write-test
touch /srv/layersentry/nfs/images/.layersentry-write-test
rm -f /srv/layersentry/nfs/images/.layersentry-write-test
mkdir -p /srv/layersentry/nfs/workload/system/0
mkdir -p /srv/layersentry/nfs/images/images/1 /srv/layersentry/nfs/images/files/2
EVIDENCE="/srv/layersentry/nfs/images/evidence/seven-node-foundation/$RUN_ID"
mkdir -p "$EVIDENCE"

if arping -D -I enp6s18 -c 3 172.17.60.20 >/tmp/layersentry-vip-arping.log 2>&1; then
  echo "VIP_172.17.60.20_FREE=PASS"
else
  cat /tmp/layersentry-vip-arping.log
  echo "VIP_172.17.60.20_FREE=FAIL" >&2
  exit 41
fi

ansible-playbook -i "$INVENTORY" --syntax-check "${EXTRA[@]}" opennebula.deploy.pre
ansible-playbook -i "$INVENTORY" --syntax-check "${EXTRA[@]}" opennebula.deploy.site

set +e
ansible-playbook -vv -i "$INVENTORY" "${EXTRA[@]}" opennebula.deploy.pre > "$ROOT/logs/one-deploy-pre-$RUN_ID.log" 2>&1
RC=$?
set -e

cp "$LOG" "$EVIDENCE/"
cp "$ROOT/logs/one-deploy-pre-$RUN_ID.log" "$EVIDENCE/"
cp "$INVENTORY" "$EVIDENCE/inventory.yml"
sha256sum "$EVIDENCE"/* > "$EVIDENCE/STAGE1_SHA256SUMS"

echo "ONEDEPLOY_PRE_RC=$RC"
if [[ "$RC" -ne 0 ]]; then
  tail -n 200 "$ROOT/logs/one-deploy-pre-$RUN_ID.log"
  exit "$RC"
fi

touch "$ROOT/STAGE1_COMPLETE"
echo "MANUAL_FOUNDATION_STAGE1=PASS"
