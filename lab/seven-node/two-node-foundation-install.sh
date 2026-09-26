#!/usr/bin/env bash
set -euo pipefail
umask 077

RUN_ID="${1:?run id required}"
ROOT=/root/layersentry-two-node-foundation
LOCK="$ROOT/run.lock"
KEY="$ROOT/deploy_ed25519"
KNOWN="$ROOT/known_hosts"
REPO="$ROOT/one-deploy"
INVENTORY="$ROOT/inventory.yml"
VAULT_PASS="$ROOT/vault-pass"
VAULT_VARS="$ROOT/vault-vars.yml"
ONE_DEPLOY_COMMIT=361df79c154b691aaf8a89cbcfe1864d75543ec0
NFS_SERVER=172.17.60.210
NFS_EXPORT=/Pool_NVME1/Backup_NVME_DATA/NFS_shared_Mountpoint

mkdir -p "$ROOT/logs"
exec 9>"$LOCK"
flock -n 9 || { echo FOUNDATION_INSTALL=SKIPPED_LOCKED; exit 0; }
test -s "$KEY"
chmod 600 "$KEY"

LOG="$ROOT/logs/install-$RUN_ID.log"
exec > >(tee -a "$LOG") 2>&1
echo "OBSERVED_AT=$(date -u +%FT%TZ)"
echo "CONTROLLER=$(hostname)"
echo "ONE_DEPLOY_COMMIT=$ONE_DEPLOY_COMMIT"

dnf -y install epel-release dnf-plugins-core git make python3 python3-pip python3-devel gcc gcc-c++ ansible-core nfs-utils rsync openssl iputils

if [[ ! -d "$REPO/.git" ]]; then
  git clone https://github.com/OpenNebula/one-deploy.git "$REPO"
fi
git -C "$REPO" fetch --tags --prune
git -C "$REPO" checkout --detach "$ONE_DEPLOY_COMMIT"
test "$(git -C "$REPO" rev-parse HEAD)" = "$ONE_DEPLOY_COMMIT"
make -C "$REPO" requirements
echo ONEDEPLOY_REQUIREMENTS=PASS

: > "$KNOWN"
chmod 600 "$KNOWN"
for ip in 172.17.60.30 172.17.60.31; do
  ssh-keyscan -T 8 -H "$ip" >> "$KNOWN" 2>/dev/null
done
for ip in 172.17.60.30 172.17.60.31; do
  ssh-keygen -F "$ip" -f "$KNOWN" >/dev/null
done
echo SSH_KNOWN_HOSTS=PASS

# The pinned OneDeploy revision rejects Rocky Linux before package deployment.
# Fail before making any further target-side changes instead of retrying an
# already-proven unsupported platform tuple.
for ip in 172.17.60.30 172.17.60.31; do
  target_os="$({ ssh -q -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes \
    -o PasswordAuthentication=no -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$KNOWN" layersentry-deploy@"$ip" \
    '. /etc/os-release; printf "%s:%s\n" "$ID" "$VERSION_ID"'; } 2>/dev/null)"
  case "$target_os" in
    almalinux:9*|rhel:9*) ;;
    *)
      echo "ONEDEPLOY_PLATFORM_UNSUPPORTED=$ip:$target_os"
      echo "PINNED_ONEDEPLOY_SUPPORTED_TARGETS=almalinux:9,rhel:9"
      exit 42
      ;;
  esac
done
echo ONEDEPLOY_PLATFORM_PREFLIGHT=PASS

if [[ ! -s "$VAULT_PASS" ]]; then
  openssl rand -hex 24 > "$VAULT_PASS"
fi
chmod 600 "$VAULT_PASS"
ONE_PASS="$(openssl rand -hex 24)"
printf 'one_pass: %s\n' "$ONE_PASS" > "$VAULT_VARS"
unset ONE_PASS
chmod 600 "$VAULT_VARS"
ansible-vault encrypt --vault-password-file "$VAULT_PASS" "$VAULT_VARS" >/dev/null

cat > "$INVENTORY" <<EOF
---
all:
  vars:
    env_name: layersentry-functional-lab
    ansible_python_interpreter: /usr/bin/python3
    ansible_user: layersentry-deploy
    ansible_become: true
    ansible_become_method: sudo
    ansible_ssh_private_key_file: $KEY
    ensure_hosts: true
    one_version: '7.4.1'
    db_backend: MariaDB
    unsafe_migrations: false
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
              BRIDGE_LIST: '172.17.60.31'
        IMAGE_DS:
          default:
            id: 1
            managed: true
            symlink:
              groups: [frontend, node]
              src: /srv/layersentry/nfs/images/1/
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
              src: /srv/layersentry/nfs/files/2/
            template:
              TYPE: FILE_DS
              DS_MAD: fs
              TM_MAD: ssh

frontend:
  hosts:
    layersentry1: { ansible_host: 172.17.60.30 }

node:
  hosts:
    layersentry2: { ansible_host: 172.17.60.31 }
EOF
chmod 600 "$INVENTORY"

export ANSIBLE_HOST_KEY_CHECKING=True
export ANSIBLE_SSH_ARGS="-q -o BatchMode=yes -o IdentitiesOnly=yes -o PasswordAuthentication=no -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN"
EXTRA=(--vault-password-file "$VAULT_PASS" -e "@$VAULT_VARS")

ansible -i "$INVENTORY" all -m ping "${EXTRA[@]}"
echo ANSIBLE_CONNECTIVITY=PASS

NFS_CMD="dnf -y install nfs-utils >/tmp/layersentry-nfs-utils.log; mkdir -p /srv/layersentry/nfs; grep -Fq '$NFS_SERVER:$NFS_EXPORT /srv/layersentry/nfs ' /etc/fstab || echo '$NFS_SERVER:$NFS_EXPORT /srv/layersentry/nfs nfs4 rw,hard,_netdev,nosuid,nodev,vers=4.2,timeo=600,retrans=2 0 0' >> /etc/fstab; mountpoint -q /srv/layersentry/nfs || mount /srv/layersentry/nfs; findmnt -n /srv/layersentry/nfs"
ansible -i "$INVENTORY" all -m shell -a "$NFS_CMD" "${EXTRA[@]}"

mkdir -p /srv/layersentry/nfs/{workload/system/0,images/1,files/2,evidence/two-node-foundation/$RUN_ID}
touch /srv/layersentry/nfs/.layersentry-write-test
rm -f /srv/layersentry/nfs/.layersentry-write-test
echo AUTHORIZED_NFS_PREPARE=PASS

cd "$REPO"
ansible-playbook -i "$INVENTORY" --syntax-check "${EXTRA[@]}" opennebula.deploy.pre
ansible-playbook -i "$INVENTORY" --syntax-check "${EXTRA[@]}" opennebula.deploy.site
echo ONEDEPLOY_SYNTAX=PASS

ansible-playbook -vv -i "$INVENTORY" "${EXTRA[@]}" opennebula.deploy.pre | tee "$ROOT/logs/pre-$RUN_ID.log"
echo ONEDEPLOY_PRE=PASS
ansible-playbook -vv -i "$INVENTORY" "${EXTRA[@]}" opennebula.deploy.site | tee "$ROOT/logs/site-$RUN_ID.log"
echo ONEDEPLOY_SITE=PASS

ansible -i "$INVENTORY" frontend -m shell -a 'systemctl is-active opennebula; systemctl is-active mariadb; runuser -u oneadmin -- onehost list; runuser -u oneadmin -- onedatastore list' "${EXTRA[@]}"
ansible -i "$INVENTORY" node -m shell -a 'test -c /dev/kvm; virsh -c qemu:///system list --all >/dev/null; echo KVM_READY=PASS' "${EXTRA[@]}"
ansible -i "$INVENTORY" all -m shell -a 'findmnt -n /srv/layersentry/nfs' "${EXTRA[@]}"
echo TWO_NODE_FOUNDATION_INSTALL=PASS

EVIDENCE=/srv/layersentry/nfs/evidence/two-node-foundation/$RUN_ID
cp "$LOG" "$EVIDENCE/"
cp "$ROOT/logs/pre-$RUN_ID.log" "$EVIDENCE/"
cp "$ROOT/logs/site-$RUN_ID.log" "$EVIDENCE/"
sed -E 's#ansible_ssh_private_key_file: .*#ansible_ssh_private_key_file: REDACTED#' "$INVENTORY" > "$EVIDENCE/inventory.sanitized.yml"
sha256sum "$EVIDENCE"/* > "$EVIDENCE/SHA256SUMS"
