#!/usr/bin/env bash
set -euo pipefail

slot="${1:?SCSI slot required}"
pub64="${2:?base64 public key required}"
dev=""

for sys in /sys/block/sd*/device; do
  target=$(readlink -f "$sys")
  case "$target" in
    *:0:0:"$slot")
      dev="/dev/$(basename "$(dirname "$sys")")"
      ;;
  esac
done

test -n "$dev"
echo "ATTACHED_DEVICE=$dev"
lsblk -o NAME,SIZE,FSTYPE,TYPE "$dev"

part=$(lsblk -lnpo NAME,TYPE,FSTYPE "$dev" | awk '$2=="part" && $3=="LVM2_member" {print $1; exit}')
test -n "$part"
vg=$(sudo -n pvs --noheadings -o vg_name "$part" | xargs)
test -n "$vg"
sudo -n vgchange -ay "$vg" >/dev/null

rootlv=$(sudo -n lvs --noheadings -o lv_path "$vg" | awk '/root/ {print $1; exit}')
test -n "$rootlv"

mnt=/mnt/layersentry-dr-fe1
sudo -n mkdir -p "$mnt"
cleanup() {
  sudo -n umount "$mnt" 2>/dev/null || true
  sudo -n vgchange -an "$vg" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sudo -n mount "$rootlv" "$mnt"
auth="$mnt/var/lib/one/.ssh/authorized_keys"
test -f "$auth"

key=$(printf '%s' "$pub64" | base64 -d)
if ! grep -qxF "$key" "$auth"; then
  printf '%s\n' "$key" | sudo -n tee -a "$auth" >/dev/null
fi

uid=$(awk -F: '$1=="oneadmin" {print $3}' "$mnt/etc/passwd")
gid=$(awk -F: '$1=="oneadmin" {print $4}' "$mnt/etc/passwd")
test -n "$uid"
test -n "$gid"
sudo -n chown "$uid:$gid" "$auth"
sudo -n chmod 600 "$auth"
echo "ONEADMIN_KEY_INJECT=PASS"
