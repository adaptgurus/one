# DR4 native migration qualification — 2026-11-20

This checkpoint records the reviewed migration endpoint, additive peer admission, bounded libvirt configuration change, and a real native live round trip between DR1 and DR4. It extends the earlier bridge/NFS/native enrollment and cold-migration checkpoint. It is not a production-readiness declaration.

## Actual results

| Check | Observed result |
| --- | --- |
| DR4 migration endpoint | Protected profile and v3 endpoint installed; exact dedicated persistence unit replay passed |
| DR1–DR3 peer admission | Additive DR4 /32 routes admitted with separate protected peer receipts; original four-role profiles and OVN references unchanged |
| DR4 libvirt configuration | Explicit migration address 10.201.20.6 and ports 49152–49215 loaded by restarting only libvirtd |
| Existing DR4 guests | All eight existing persistent OVN guest UUIDs, QEMU process IDs/start identities and inactive configurations preserved |
| DR1 → DR4 live migration | Native VM53 moved in 7.185 seconds; actual QEMU socket 10.201.20.2:53576 → 10.201.20.6:49152 |
| DR4 → DR1 live migration | Native VM53 returned in 5.334 seconds; actual QEMU socket 10.201.20.6:57010 → 10.201.20.2:49152 |
| Guest continuity | Boot count 4 and boot identity unchanged; advancing guest heartbeat and unchanged fixed-payload SHA256 in both directions |
| Other native workloads | All 32 other native VM identities, states, locations and current history sequences preserved across each migration |
| Source/destination proof | Source QEMU absent after departure; matching UUID present on destination; post-round-trip DR4 no longer runs VM53 |
| Security posture | SELinux Enforcing throughout; six exact runtime/permanent firewall rules added for the three migration sources only |

The native canary is VM53, UUID 1c133f56-0d0c-4d0e-aefd-1a990f71489b, owned operation ls-onedrs-dr4-canary-20261120-12e6486a. It has 1 vCPU, 256 MiB RAM, a 64 MiB shared RAW disk and no network interface. The immutable 64 KiB synthetic payload has SHA256 5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a. The retained boot identity is d041ba65-70f1-42b0-9a01-0e72164d8396. This payload proves the bounded canary assertion, not recovery of arbitrary application data.

The first live migration completed at 09:30:54 IST and the return completed at 09:33:43 IST on 20 November 2026. Native history advanced from sequence 3 to 4 to 5. The final canary location is DR1, native host0, datastore104. DR4 remains disabled for automatic scheduling in qualification cluster103.

## Preserved failures and observation corrections

The first DR3 peer-admission precheck refused before changing anything because another writer had created native VM54 on DR3. The refreshed baseline retained the original seven guest identities and explicitly added only the new stable VM54 identity. The second admission passed. That unrelated VM was never modified.

The first return-migration attempt stopped before calling the native API because a two-second read of the shared console file from the other host did not advance. Direct DR4 QEMU status and writer-local console reads showed a running guest with an advancing heartbeat and the same boot identity. The R2 harness therefore reads DR4 console telemetry through the already trusted native oneadmin SSH path whenever DR4 hosts the guest, and waits a bounded interval for freshness. The original harness, failed precheck record and corrected harness are all retained. The initial outbound result is additionally supported by the later direct DR4 observation, actual destination QEMU identity and successful live return.

The DR4 libvirt restart was deliberately preceded by moving VM53 off DR4 using the already qualified cold path. At restart, only the eight existing persistent guests were present and all reported no active job. The libvirtd PID changed from97935 to2215655; their QEMU processes did not change. Installed libvirt11.10.0 loads qemu.conf at driver initialization; its reload path does not refresh that configuration. No host reboot was performed.

## Source and artifact identity

The migration helper is built with Go1.26.11 from reviewed platform commits4a85ad88832f8caca63052f71cde3ae49955e418, a93a1067a5e7eb6a17a13030a3589a8bc098671a and2eaffdc8462b01fa74f2610bfa02fb4b5d4ba52e. Its SHA256 is e2006979aef27d1d32db5c856b2840398ae23b1b06ada272009b838a37b6768f. All four hosts run that exact source-pinned lab helper. Original binaries are retained privately on each host. This is not a production RPM qualification.

DR4 uses profile generation onedrs-dr4-migration-20261120-v1, SHA256 ca06facdbfe20f901433d6b5f2b10d8a00f922dd2cded8b345609d376294e795. Its migration address is10.201.20.6. DR1–DR3 retain addresses10.201.20.2, .3 and .4 and their original base-profile hashes. Separate peer-overlay hashes bind the additive admission.

The installed native OpenNebula daemon remained R8 throughout these actual migrations. These results do not qualify the newer checked-plan capacity/eligibility implementation, its package or the V7 Apply path.

## Boundaries still open

The role endpoint is a veth/bridge binding, not dedicated physical isolation. QEMU memory transfer here used plain TCP; the observed role addresses do not prove encrypted migration. No active-endpoint decommission or concurrent peer revocation is advertised: those operations fail closed until native quiescence can be established.

DR2 and DR3 peer admission/reachability passed, but this checkpoint does not claim a live migration from each of those hosts to DR4. It does not prove original-site fencing, physical failure-domain independence, N+2 recovery, arbitrary local-disk/TPM/pinned workload recovery, reboot persistence, certificate renewal, a completed soak, or production package installation.

The receipt manifest binds 42 exact collected scripts, public profiles and observation files to their original hosts and SHA256 values. Native authentication files, private SSH/TLS keys, raw environment files and original credential-bearing configuration backups were not collected.
