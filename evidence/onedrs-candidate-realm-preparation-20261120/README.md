# Fresh candidate realm preparation — 20 November 2026

This is preparation evidence for a disposable nested software qualification realm. No new OneDRS native candidate was installed or started when these receipts were collected. It does not establish application readiness, native HA, physical failure-domain independence, or a completed soak.

## Owned resources

Five fresh controller/compute VMs use the isolated network `ls-onedrs-rc-20261120`, bridge `lsdrrc20br0`, and addresses 192.168.247.11–15. Each has 2 vCPU, 4 GiB memory, and a sparse 10 GiB root overlay backed by the recorded immutable Rocky 9 cloud image. The network has static addressing, no DHCP or DNS service, and a dedicated SSH key with preseeded strict host identity checks.

A sixth disposable VM, `ls-onedrs-rc-storage` at 192.168.247.16, provides a separate software storage domain with 1 vCPU and 2 GiB memory. It is outside the planned five-member controller/compute fault set. All six VMs share the same physical parent; none is an independent physical failure domain.

The earlier R13 realm at 192.168.246.0/24 and its read-only soak are separate and were preserved. DC1 and the original DR controllers were not changed by this preparation.

## Verified preparation

- The five-node provisioning custody reconciliation preserves all 46 preexisting VM identities, processes, start times and definitions, all seven preexisting network definitions, and existing routes. The new network's connection count changed as its new guests started; the original difference and reconciliation are both retained.
- Signed distribution dependencies installed normally on all five fresh nodes. No dependency or signature bypass was used.
- Verified vendor dependencies installed on all five nodes, with 124 cached RPM signature checks per node. The migration package's dependency on the final native server package was retained for that final normal package transaction; no vendor native server was installed as a substitute.
- Local MariaDB 10.5.29 was prepared with loopback binding, WSREP disabled, empty native schemas, and READ-COMMITTED isolation. Native Raft bootstrap still requires the final candidate and a common authoritative database/auth bootstrap.
- The native oneadmin account has UID/GID 9869 across all five nodes. All 25 native SSH matrix checks passed with strict, preseeded host keys.
- Creating the sixth storage VM preserved the then-existing 52 running domains' UUIDs, processes, start ticks and definitions, all existing network definitions, and the outer NFS service/export custody.
- The new storage VM's initial compute data-write test failed because its read-only pseudo-root and writable child exports lacked mount boundaries. The correction is confined to the new storage VM: separate backing directories and persistent bind mounts, a read-only pseudo-root/fence leaf, and writable data leaves. The final qualification passed 75 native oneadmin cross-node reads against actual server hashes. The initial failure is retained.
- Final storage qualification preserved all 52 preexisting domain identities/processes/definitions, existing networks/routes, outer NFS service/export identity, and both old R13 share read paths. An unallowlisted outer-host connection to new storage port 2049 was refused; the fence leaf was empty, original five SSH pins were preserved, and parent free space was 22,793,560,064 bytes. This is one software storage domain on the same physical parent.

## Retained failures and limits

The initial network start failed because the parent could not create another dnsmasq inotify instance. The new realm was changed to static addressing without changing the parent's global limit. A subsequent VM start failed because the owned image directory lacked traversal permission for its QEMU identity; only that new directory was corrected.

The first dependency install wrapper failed its privileged identity read before installation. The second wrapper passed. The first vendor package transaction correctly refused the migration/server dependency coupling; the revised preparation leaves the coupled package for the candidate install.

The outer NFS service has NFSv3 disabled. The proposed outer export was refused before mutation; the separate storage VM was created instead. No outer NFS protocol change, reload, restart, or export change was used.

Host free-space checks use a 15 GiB floor. Concurrent activity outside this realm also consumed parent disk space, so before/after free-space differences cannot all be attributed to this work.

## Evidence handling

`manifest.json` identifies each explicitly collected source file, size and SHA-256. The scripts are one-off, resource-bound lab procedures, not reusable production installers. Failed and superseded receipts remain evidence and must not be replayed or interpreted as current PASS states.

Private SSH keys, cloud-init user data, seed ISOs, bootstrap credentials, client option files and raw native database snapshots are excluded. Source scripts generate or read protected credentials at runtime and contain no credential values. Referenced private install logs remain on the owned parent with their hashes recorded in the receipts.

The next gates are the exact combined native build and signed package dependency closure, native controller bootstrap, actual VM placement/migration/recovery with fences, and a new uninterrupted installed-candidate soak. Earlier source tests and the older R13 soak do not satisfy those gates.

The first final storage observer also refused an incorrect old-realm known-hosts path before proceeding. Its failure receipt and the corrected observer are retained; no new key was accepted through trust-on-first-use. Final storage PASS is dated 2026-11-20 06:11:15 UTC.

## Fresh guest network and bootstrap source checkpoint

The five fresh nodes have a separate bridge with unicast VXLAN VNI24720, MTU1450 and exact peer addresses. Host-only qualification passed all20 cross-node DF probes,25 pinned native SSH paths,20 guest-bridge-to-management SSH denials, and5 storage-to-management SSH denials. Existing eth0 addressing, default routes, profiles and all four shared mounts remained unchanged. A repeated storage/custody observer passed75 shared reads and preserved52 preexisting domain identities/processes/definitions, outer networking and NFS, and the old R13 share paths. Earlier preparation and observer failures and their corrections are retained in the network receipts. These are host-network tests, not workload network continuity or production failure-domain qualification.

The public bootstrap proposal and its16-check renderer result are retained alongside the failed first fixture receipt. The proposal uses native Raft/VIP behavior, exact five-node membership and an unfenceable sixth storage node. The one-off lab fence design requires exact domain identities, a durable journal and a fresh single-use claim. Private keys, live authentication material and private rendered configurations are excluded. At this checkpoint there is no final candidate identity, installed candidate, native canary, enabled fence authority, fault run or candidate soak.
