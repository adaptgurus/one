# R14 vendor 7.4.1 qualification — 20 November 2026

## Outcome and scope

The reviewed authorization and atomic approval changes were backported to the exact preserved R13 vendor 7.4.1 native source and built into a compatible lab RPM. This closes the development-binary compatibility gap documented in the preceding source contract evidence. All checks below used private namespaces or a private RPM root. No installed native binary, service, fleet workload, global RPM trust database or production signing authority was changed.

This evidence qualifies native API behavior, persistent data compatibility, package integrity and bounded installation/rollback mechanics. Actual migration completion, original-fleet canary/HA behavior and control-plane integration remain separate gates. GitHub-hosted CI is not claimed by this evidence.

## Artifact identity

| Item | Exact identity |
|---|---|
| Reviewed native/Python source | `5995c42b8a0fb17ad959e5eb6af2d9e6da0f4037` |
| Native version returned by API | `7.4.1` |
| RPM NEVRA | `opennebula-7.4.1-14.ls.onedrs.5995c42b.lab.el9.x86_64` |
| Signed RPM SHA-256 | `605cb94f219b99d40d5dae7d5c18c4e0b09910301cb99c339c24b2f48b82d404` |
| Unsigned RPM SHA-256 | `3e2f14229ee5a1687eb8bc6948cf8fbeb92d6dc446279a1fb9ffb0b26eecefbe` |
| oned SHA-256 | `54964060a4c477fb19920315dd745ddab9e12cf32697a285017c15703783ba7b` |
| onemonitord SHA-256 | `79f13abf3ac6ed04ab70f3c5e18af1f7ad1dd57978fc44e096af23bf5581b405` |
| Retained security deploy driver | `3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b` |
| Ephemeral lab signer fingerprint | `AACFE85E1B776B5BDF88421D014F01A58FAF4FD2` |

The signed artifact is on DC2 at `/root/ls-onedrs-r14-private-rpm-20261120/lab-signing/opennebula-7.4.1-14.ls.onedrs.5995c42b.lab.el9.x86_64.rpm`. The public lab key is adjacent as `RPM-GPG-KEY-R14-LAB-ONLY`. Its private key was deleted after signing and testing. This key is a disposable lab test identity, not production release trust.

## Native source and build custody

The source baseline is `/root/onedrs-shutdown-rca-20261115/vendor-build`. Its pre-build controller and monitor binaries matched the original R13 payload exactly. All **770** native source files matched the retained R13 manifest (SHA-256 `ab746ff6f043b7edc7d1eda73dd91d4a9475976e09184152e1ac51aa9a1d82a7`).

A private copy at `/root/ls-onedrs-r14-vendor-build-20261120` received only `native-reviewed.patch`, produced from source commits `33ef640b..5995c42b` over the eleven reviewed C++ headers/sources. The patch applied without conflict. The version, database, template parser, native service and prior lifecycle guard contracts were retained. No unreviewed file changed relative to the baseline manifest.

The build retained the original gRPC, MySQL, SQLite and systemd options and the original RPM compiler/linker hardening flags. The exact command and environment are in `native-build-input.json`; it completed successfully in 147.852 seconds. ELF shared-library requirements are unchanged from R13; NOW/PIE linking remains enabled. Build output identities, complete resulting native source manifest and patch file hashes are included.

## Actual native RPC and service identity tests

The real vendor daemon passed **43** initial native XML-RPC contract checks, then **53** checks in a fresh run expanded for the proposed control-plane service identity. Both native shutdowns in each accepted run exited zero. Every run used fresh SQLite data, a private mount/PID/network namespace and loopback-only networking with no registered hosts or VMs.

The final run proves:

- Native group allocation automatically adds HOST/NET/DATASTORE grants. The fixture removes only the fresh group's automatic rules and verifies no group rules remain. A new user in that isolated group, with neither oneadmin nor users-group membership, can use exactly `#UID CLUSTER/#CID USE+ADMIN #0`.
- That identity can read the approved cluster and native version, update the checked policy and execute the checked migration approval.
- The same identity receives native authorization error 512 for another cluster. Revoking the exact ACL restores denial. A separate read-only audit of the final private database confirms the two ambient ALL-subject ACLs grant only USE; they are the normal zone and marketplace read rules and do not grant mutation rights.
- Concurrent execution of one approval has exactly one winner; concurrent policy changes have exactly one winner.
- Wrong/malformed identities, replaced generations, policy changes, stale optimizer replies, replay, unbound legacy plans and power-operation plans are rejected.
- Unrelated cluster attributes, immutable generation, exact native XML hashing, NIC/timestamp fields and restart persistence are preserved.

The native ACL RPC consumes hexadecimal fields, unlike the human CLI syntax. The verified encoding is user `hex(0x100000000 | uid)`, resource `hex(0x200000000000 | 0x100000000 | cid)`, rights `5`, zone `100000000`. The first scoped-ACL fixture mistakenly sent human CLI tokens directly and was rejected as malformed; its failed receipt is retained. A second run passed 50 operation checks but had not inventoried the new group's automatic grants; its receipt is retained as incomplete authority inventory. The final fresh run passed 53 checks after removing only those fixture-owned grants, verifying the exact UID rule, and proving both UID/group rule inventories empty after revocation. No product authorization guard was weakened.

The test scheduler MAD provides controlled plans referencing nonexistent VM 999999. Execution therefore reaches native ERROR safely; these checks prove authorization and transaction behavior, not successful VM migration.

## Native R8/R14 data compatibility

A separate real-daemon test passed **24** checks across **R8 → R14 → R8 → R14** using one private SQLite database. All four instances reported version 7.4.1 and all four shutdowns exited zero.

R14 read the original cluster template, performed a checked policy write and persisted a generated plan. The original R8 binary read the new policy and extended plan and wrote an unrelated template attribute. Re-upgraded R14 read that write, retained the exact plan generation/digest, and detected that the old API's template change invalidated the plan's earlier policy binding. No schema migration was required. The disposable cluster was removed through the native API.

## Package and signing tests

The package recipe verified all **1,225** regular R13 payload files before copying. Changes are limited to the two native binaries and their ELF debug links, five OneDRS runtime files, and two matching XSDs. The explicit packaged Python 3.12 interpreter remains intact. Original dependency declarations, lifecycle scriptlets, file ownership, modes and configuration flags are retained.

The private signing/install test passed all thirteen stages, including rejection of an unknown lab signer and a tampered payload, accepted signature/digest validation after importing the public key only into a private RPM database, and original RPM installation → R14 upgrade → original R8 downgrade. Original scriptlets ran inside the private root with a recording-only systemctl stub. Modified configuration, test credentials, a custom inert fence fixture, VM-state markers and logs survived both transitions.

These private RPM transactions use `--nodeps` because the chroot contains only the scriptlet substrate. They do not claim package dependency closure on a live node or real systemd startup. Native service startup/data compatibility is covered by the separate namespace tests above; live-node dependency checks and rollout remain required.

## Reproduction and evidence

The native RPC harness is `tools/onedrs_qualification/native_checked_api_contract.py`; the four-stage database harness is `tools/onedrs_qualification/native_vendor_upgrade_contract.py`. Both require fresh private paths and distinct namespaces. Use a new private prefix containing only newly generated test oneadmin credentials; copied generated service-auth files are inappropriate for a fresh database.

Package and signing recipes are retained as `build-r14-lab-package.py` and `sign-and-test-r14.py`. They refuse existing output paths. Reproduction requires a checkout at the exact reviewed source commit and renamed fresh private output directories; preserve the original R13 build, payload and receipts.

`evidence-manifest.json` binds the retained receipts, source manifests, recipes and exact native XML fixture. Full raw logs remain under the absolute DC2 paths in those receipts. All accepted results are separate from the discarded fixture attempt.
