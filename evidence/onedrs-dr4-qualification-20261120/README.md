# DR4 native qualification checkpoint — 2026-11-20

This directory preserves executed lab evidence and the exact one-off qualification scripts. It is not a reusable installer or a production-readiness certificate. Do not replay these scripts against a changed lab. The manifest binds each copied file to its source host, original path, size and SHA-256. Private credentials, private keys, raw environments and configuration backups are excluded.

## Executed results

| Area | Observation |
| --- | --- |
| Management bridge | Committed a NetworkManager checkpoint for DR4's existing uplink and new `br-mgmt`. The management address, gateway, bridge MAC, required route, eight existing OVN guest processes/configurations and NAT network were preserved. External SSH and guest egress checks passed. |
| Native SSH | Installed bounded native-user trust from authenticated host-key observations and verified all six DR4↔DR1–3 paths with strict host-key checking. |
| Shared storage | Native-user read/write, cross-host payload verification, append visibility and lock exclusion passed on the existing NFS exports for datastores 104 and 105. Only unique owned witness files were written and removed. This does not establish storage fencing. |
| Persistence | Exact systemd NFS automounts were installed with inaccessible local underlays. Canonical shared-file paths and native-user access passed. Existing active libvirtd was enabled for boot; inactive competing modular units were disabled for boot. No daemon restart or host reboot occurred. |
| Native enrollment | Created qualification cluster 103 and host 4 for DR4. Automatic scheduling and OneDRS remain disabled for this host/cluster. Reservations include the eight pre-existing OVN guests and a host allowance. The original cluster policy and 31 original VM custody records were preserved. |
| Native boot | Owned VM 53, UUID `1c133f56-0d0c-4d0e-aefd-1a990f71489b`, booted on DR4 through the real native driver and datastore 104. Its synthetic guest verified a persistent payload and emitted a serial heartbeat. It has one vCPU, 256 MiB RAM, a 64 MiB volatile disk and no NIC. |
| Cold DR4→DR1 | Passed in 4.087 seconds. Native history advanced; guest boot counter advanced from 1 to 2; persistent payload hash matched; the other 31 native VMs were unchanged. |
| Cold DR1→DR4 | Passed in 7.123 seconds. Native history advanced; boot counter advanced from 2 to 3; persistent payload hash matched; the other 31 native VMs were unchanged. |
| Durable agent health | A read-only query through the original TLS-verified SQL path found fresh HEALTHY rows for DR1–DR4, aged 2–11 seconds. The original control plane remains observe-only and ADVISORY. |

The cold-migration tests declared a 180-second recovery bound and zero loss of the fixed synthetic payload before execution. These are narrow test criteria, not a customer workload SLA or autonomous failure-recovery qualification. The native VM remains owned qualification workload 53 on DR4 at this checkpoint.

## Failures retained and corrected

- The first enrollment attempt created the owned empty qualification cluster but rejected an incomplete OneDRS policy vector. The continuation verified ownership and resumed that exact cluster; no duplicate cluster was created.
- The first persistence attempt expected `stat` to trigger an automount. The second exposed an inaccessible canonical parent created under the private umask. Both attempts rolled back their bounded changes; the third used an actual directory access and explicit parent permissions and passed.
- The original reusable initramfs contained an older guest init despite a corrected root filesystem. It was rejected before allocating a VM. The archive was rebuilt from the verified init. The next preflight exposed the combined autofs/NFS readback representation; the corrected check passed before allocation.

Failed receipts and the associated script revisions are preserved. They have not been relabeled as successful.

## Remaining release gates

Live migration still requires the protected DR4 migration endpoint and explicitly admitted peer routes. DR4 remains disabled for automatic placement. Physical failure-domain independence and original-site host/storage fencing are unqualified. Existing workload storage and placement constraints still prevent an unrestricted reserve claim.

The newly built R14 native controller is withheld while atomic checked-migration capacity admission is corrected and tested. Original DR1–3 controllers remain R8. An R13 nested observational soak is separately running; neither its elapsed time nor these cold-migration receipts qualify a later native candidate or a physical customer deployment.

## Hosted CI provider result

The companion `dc2/provider-blocker.json` records a real dispatch attempt after workflow registration through PR 62. GitHub returned HTTP 422, `Actions has been disabled for this repository.`, while repository permissions reported Actions enabled and the workflow active. No run was created. The exact provider-side cause is not observable through the checked repository endpoints. No alternate account/repository or permission bypass was attempted, and no support message was sent. Local executed test results remain separately identified.
