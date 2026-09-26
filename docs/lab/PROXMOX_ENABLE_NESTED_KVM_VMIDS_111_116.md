# Proxmox nested-KVM commands for LayerSentry VMIDs 111-116

Run each VM block on that VM's current owning Proxmox host as `root`.

The procedure performs a clean guest shutdown and stops without changing the
CPU configuration if the guest does not shut down within 180 seconds. It does
not force-stop a guest.

## Check the owning Proxmox host first

```bash
hostname
egrep -m1 -o 'vmx|svm' /proc/cpuinfo

if test -e /sys/module/kvm_intel/parameters/nested; then
    printf 'INTEL_NESTED='
    cat /sys/module/kvm_intel/parameters/nested
elif test -e /sys/module/kvm_amd/parameters/nested; then
    printf 'AMD_NESTED='
    cat /sys/module/kvm_amd/parameters/nested
else
    echo 'NO_KVM_NESTED_PARAMETER'
fi
```

The nested value must be `Y`, `1`, or otherwise enabled before changing the VM.

## VMID 111 - layersentry1 - 172.17.60.30

```bash
VMID=111
test -f "/etc/pve/qemu-server/${VMID}.conf" || { echo "VMID ${VMID} is not on $(hostname)"; exit 1; }
qm config "$VMID" > "/root/qemu-${VMID}-before-nested-$(date -u +%Y%m%dT%H%M%SZ).conf"
qm shutdown "$VMID" --timeout 180
for attempt in $(seq 1 36); do test "$(qm status "$VMID" | awk '{print $2}')" = stopped && break; sleep 5; done
test "$(qm status "$VMID" | awk '{print $2}')" = stopped || { echo 'Clean shutdown did not complete; no change made'; exit 1; }
qm set "$VMID" --cpu host
qm config "$VMID" | grep '^cpu:'
qm start "$VMID"
qm status "$VMID"
```

## VMID 112 - layersentry2 - 172.17.60.31

```bash
VMID=112
test -f "/etc/pve/qemu-server/${VMID}.conf" || { echo "VMID ${VMID} is not on $(hostname)"; exit 1; }
qm config "$VMID" > "/root/qemu-${VMID}-before-nested-$(date -u +%Y%m%dT%H%M%SZ).conf"
qm shutdown "$VMID" --timeout 180
for attempt in $(seq 1 36); do test "$(qm status "$VMID" | awk '{print $2}')" = stopped && break; sleep 5; done
test "$(qm status "$VMID" | awk '{print $2}')" = stopped || { echo 'Clean shutdown did not complete; no change made'; exit 1; }
qm set "$VMID" --cpu host
qm config "$VMID" | grep '^cpu:'
qm start "$VMID"
qm status "$VMID"
```

## VMID 113 - layersentry3 - 172.17.60.32

```bash
VMID=113
test -f "/etc/pve/qemu-server/${VMID}.conf" || { echo "VMID ${VMID} is not on $(hostname)"; exit 1; }
qm config "$VMID" > "/root/qemu-${VMID}-before-nested-$(date -u +%Y%m%dT%H%M%SZ).conf"
qm shutdown "$VMID" --timeout 180
for attempt in $(seq 1 36); do test "$(qm status "$VMID" | awk '{print $2}')" = stopped && break; sleep 5; done
test "$(qm status "$VMID" | awk '{print $2}')" = stopped || { echo 'Clean shutdown did not complete; no change made'; exit 1; }
qm set "$VMID" --cpu host
qm config "$VMID" | grep '^cpu:'
qm start "$VMID"
qm status "$VMID"
```

## VMID 115 - layersentry5 - 172.17.60.34

```bash
VMID=115
test -f "/etc/pve/qemu-server/${VMID}.conf" || { echo "VMID ${VMID} is not on $(hostname)"; exit 1; }
qm config "$VMID" > "/root/qemu-${VMID}-before-nested-$(date -u +%Y%m%dT%H%M%SZ).conf"
qm shutdown "$VMID" --timeout 180
for attempt in $(seq 1 36); do test "$(qm status "$VMID" | awk '{print $2}')" = stopped && break; sleep 5; done
test "$(qm status "$VMID" | awk '{print $2}')" = stopped || { echo 'Clean shutdown did not complete; no change made'; exit 1; }
qm set "$VMID" --cpu host
qm config "$VMID" | grep '^cpu:'
qm start "$VMID"
qm status "$VMID"
```

## VMID 116 - layersentry6 - 172.17.60.35

```bash
VMID=116
test -f "/etc/pve/qemu-server/${VMID}.conf" || { echo "VMID ${VMID} is not on $(hostname)"; exit 1; }
qm config "$VMID" > "/root/qemu-${VMID}-before-nested-$(date -u +%Y%m%dT%H%M%SZ).conf"
qm shutdown "$VMID" --timeout 180
for attempt in $(seq 1 36); do test "$(qm status "$VMID" | awk '{print $2}')" = stopped && break; sleep 5; done
test "$(qm status "$VMID" | awk '{print $2}')" = stopped || { echo 'Clean shutdown did not complete; no change made'; exit 1; }
qm set "$VMID" --cpu host
qm config "$VMID" | grep '^cpu:'
qm start "$VMID"
qm status "$VMID"
```

## VMID 114 - layersentry4 - verification only

VMID 114 already passed the previous nested-KVM probe. Do not change it unless
the following verification now fails:

```bash
ssh root@172.17.60.33 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
```

## Verify each changed guest

Replace the address with the VM you changed:

```bash
ssh root@172.17.60.30 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
ssh root@172.17.60.31 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
ssh root@172.17.60.32 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
ssh root@172.17.60.34 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
ssh root@172.17.60.35 "egrep -m1 -o 'vmx|svm' /proc/cpuinfo; test -c /dev/kvm && ls -l /dev/kvm"
```

Each changed guest must display `vmx` or `svm` and a character device at
`/dev/kvm`.
