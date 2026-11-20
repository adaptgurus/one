# Native VMGroup integration: source and compile checkpoint

Status: COMPILE_ONLY. No runtime, fault-injection, driver, service-control or fleet test was started in this follow-up. The checked migration shape and published capability still exclude VMGroup until combined native qualification. This checkpoint is not a production-readiness or live admission claim.

## Source

The native VMGroup helper and companion originate from reviewed commits e62f73e45091472cfa8a9c5bdf36ad0924d7c373 and 350c6506f57c0e025412f6f9028b28412efaa264, preserved here as decded60c7 and 8a1af30787. The adapter delta adds:

- VM -> VMGroup -> target-host serialization at API publication and final LCM admission. Explicit direct native force retains its existing constraint bypass while using the same group lock.
- Pre-history planner group BUSY is a non-admitted READY deferral. A conflict after durable API admission instead uses native cancellation or remains unresolved; it is not replayed.
- Cancellation retains the group through target release, source re-reservation and restored canonical history/VM writes, then releases group and VM before plan callbacks.
- Exact cached native group XML in scheduler candidate identities, plus current group identity checks. The checked VMGroup shape gate remains closed.
- Dynamic membership add/remove holds the same native group lock through acknowledged group and VM writes. An ambiguous partial write returns an error rather than fabricating rollback.
- Complete reverse membership inspection detects a canonical VM pointing to a missing role entry. Native PoolSQL search has no LIMIT. Its SQL prefilter selects non-DONE bodies containing VMGROUP and get_ro inspects only current TEMPLATE/VMGROUP, so numeric CDATA and historical false positives cannot silently omit a member.
- Role/template changes and group deletion use the consistency check. Deleting a populated group refuses until its native memberships are removed; there is no automatic detach.
- The settled peer classifier includes ordinary capacity_admission_pending and the durable cancellation marker, including closed-history partial cancellation.

## Build custody

A fresh private reflink of the exact R17 revision-4 vendor 7.4.1 build cache was made at /root/ls-onedrs-r18-vendor-build-20261120. The original cache was not modified. The build applies the full C++ source delta from 625da064a6477105b109a919eb29c602f97a6ec4, records the actual source head plus working delta and per-file hashes, and compiles both oned and onemonitord with the retained distro hardening, C++17, gRPC, MariaDB, SQLite and systemd flags.

The inherited revision-4 compiler settings contained an older source_head string; the original receipt was preserved and its separate source-custody correction is included by hash. This build has its own accurate head/delta fields and qualification-only version string. Its result is solely a successful build, not a final package.

## Required qualification before promotion

Run the native VMGroup companion and combined admission/recovery suite only in a separately authorized private runtime phase. Required boundaries include concurrent enforced member admissions, target peer transitions, budget zero and positive serial deferral, explicit force interaction, restart, partial membership addition/removal, inverse orphan refusal, populated/empty deletion, cancellation marker persistence with closed histories, and normal/failed history and host writes. Existing checked hardware/datastore restrictions remain intact.

The known same-VM late driver response after explicit recovery remains an unresolved release risk tracked in the pending-entry evidence. Root owns a separate request-correlation source slice. Reserve epoch/outcome proof adapters and their runtime qualification are also not complete in this checkpoint. No new capability is promoted by this commit.
