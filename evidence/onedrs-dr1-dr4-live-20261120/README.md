# DR1–DR4 native live migration qualification — 20 November 2026

## Result and scope

Four additional real OpenNebula live migrations passed after the earlier DR1–DR4 round trip recorded in commit `64e53dd749e7bfaf05464f00f79c676151eca27a`. These receipts qualify the migration endpoint mesh for the owned 256 MiB synthetic VM on the existing R8 native daemon. They do not qualify the new checked plan APIs, application recovery, a production SLA, physical failure domains, or a complete release candidate.

The only VM targeted by lifecycle calls in this qualification was native VM 53, domain UUID `1c133f56-0d0c-4d0e-aefd-1a990f71489b`. It has one vCPU, a 64 MiB shared volatile disk, and no network interface. Its fixed, fsynced data payload remained intact and its guest heartbeat advanced after every move. Boot count 4 and boot ID `d041ba65-70f1-42b0-9a01-0e72164d8396` remained unchanged. The declared completion bound was 180 seconds and the declared fixed-payload loss bound was zero bytes; this does not establish a continuously written application RPO.

| Direction | Native host IDs | Completion, UTC | Elapsed | History sequence |
| --- | --- | --- | --- | --- |
| DR1 to DR2 | 0 to 1 | 04:23:22.348 | 4.586 s | 5 to 6 |
| DR2 to DR4 | 1 to 4 | 04:24:57.796 | 3.811 s | 6 to 7 |
| DR4 to DR3 | 4 to 2 | 04:27:00.135 | 5.379 s | 7 to 8 |
| DR3 to DR1 | 2 to 0 | 04:29:32.021 | 3.619 s | 8 to 9 |

The four canary receipts are under `dr1/canary/`. Each verifies native terminal state, target host, datastore 104, expected history sequence, guest continuity, and the custody of 32 other native VM records during that bounded operation. The final canary location is DR1 at history sequence 9.

## Actual migration transport

Source-side witnesses under each host's `endpoint/` directory associate the observed TCP connection with the native QEMU PID, start identity, and VM UUID. The helper first checks the exact source host profile, generation, DMI identity, bridge and veth custody, and admitted peer. A prepared role alone is not considered socket or completion proof.

| Direction | Observed source endpoint | Observed target endpoint |
| --- | --- | --- |
| DR1 to DR2 | 10.201.20.2:55394 | 10.201.20.3:49152 |
| DR2 to DR4 | 10.201.20.3:37900 | 10.201.20.6:49152 |
| DR4 to DR3 | 10.201.20.6:42732 | 10.201.20.4:49152 |
| DR3 to DR1 | 10.201.20.4:57186 | 10.201.20.2:49153 |

All four hosts used helper SHA-256 `e2006979aef27d1d32db5c856b2840398ae23b1b06ada272009b838a37b6768f`. It is the source-pinned lab override from the reviewed migration-admission branch, not a qualified production RPM. The observed migration transport is plain TCP over a lab logical migration network; these receipts make no encryption or physically dedicated network claim. The native migration driver remains responsible for migration.

## Custody exception retained

DR1, DR2, and DR4 passed the aggregate before/after host snapshot checks. DR3's strict aggregate check detected an additional unrelated VM 54 between its broader cohort snapshots. The original difference is retained in `dr3/endpoint/peer-live-custody-difference.json`; it is not rewritten as a pass.

The separate reconciliation receipt confirms that all seven baseline DR3 guests retained their QEMU identities and inactive configurations, the libvirt daemon remained unchanged, and the owned canary departed. The additional VM's QEMU started at 04:25:34 UTC, between the DR2-to-DR4 and DR4-to-DR3 operations. This qualification took no lifecycle action against VM 54. There is no claim that every guest on DR3 remained unchanged across the entire cohort window. Fresh custody checks are required before subsequent maintenance.

## Evidence integrity and remaining gates

`receipt-manifest.json` records the original source path, byte length, and SHA-256 for each of the 26 collected files. The collector validated all JSON, parsed the Python harnesses, checked every recorded hash, and rejected private-key material. The README is an explanation of the collected receipts, not an additional execution result.

Original DR1–DR3 still ran `opennebula-7.4.1-8.ls.onedrs.e39bf32.el9.x86_64`, with oned SHA-256 `d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1`. DR4 remained disabled for automatic placement in isolated qualification cluster 103; this was explicit manual migration, not automatic admission of DR4. Physical parent mappings and fencing endpoints remain unverified. The separate R13 read-only soak cannot be credited to the pending combined release candidate.
