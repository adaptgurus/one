# OneDRS R13 — guarded native DR3 follower canary and rollback

**Executed 19 November 2026, 06:08–06:09 IST. Verdict: PASS_NATIVE_FOLLOWER_UPGRADE_AND_ROLLBACK.** Original live DR1–DR3 cluster was restored to OpenNebula R8. This is a real single-follower lab canary, not full multi-controller release, physical failure, VM migration, or production acceptance.

## Exact package/source custody

- Integrated R13 native source: `06dc1aaac0bce10d2cf06c56d9dd1f71e29d2054` (PR #61, stacked on PR #60).
- DR3 on-host single-run canary script SHA-256: `f9b1195c348d38dd1fcd5a9f6f2e7015ceb4f1c722a4b6c330feb2a286a04185`, root-private at `/root/ls-onedrs-r13-follower-canary-20261119/dr3_canary_r13.py`. Derived from the original accepted R10 DR3 follower script; exact host/payload/signature/rollback/driver hash guards updated.
- Exact **lab-only signed R13 RPM** SHA-256: `c37dd678b4756288d4bbd898f2f2054da6e79ed0682a45ee90e88107d3315279`.
- Exact **lab-only signed original R8 rollback RPM** SHA-256: `f84b8c8936343cb37d8ea39728113182645a8fdb92a73fb7d275d47d3ea51b18`.
- Lab-only signer fingerprints were individually verified against the staged public keys; temporarily imported for signature-enforced DNF and removed at end. Neither is a production trust authority.
- Exact R13 running `oned` SHA-256: `006c90bc98ab63336b0df24b58da44e95cced3b7cf0be6eb5282de8150a3272e`. Restored original R8 `oned`: `d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1`.
- Restored exact pre-existing DR3 native KVM deployment driver SHA-256: `df93b32c041f367c43365a38f863041ecf5ca292b37fbf78136b87e89e759bd6` (mode 0750, owner oneadmin).

## Preconditions and execution

Pre-canary DR1 leader, DR2/DR3 followers, same term/index/commit; DR1–DR3 originally installed R8. Native VM state inventory stable: **30 records**, 18 running and 12 powered off; checked via authenticated native API. DR3 kept libvirtd/hypervisor networking and running guests; R13 and rollback packages were signature/digest preflighted, and `rpm -Uvh --test --nosignature` against R13 passed dependency closure before package changes.

DR3 root-private backup retained: 352,016,113-byte native database dump, `tar --acls --xattrs` of original configuration/auth/SSH, exact deployment driver copy, the 30-VM native inventory and canary logs. Existing security helper and original config/auth hash guards passed. The canary did not make VM lifecycle/host power/network or schema migration requests. Only this DR3 follower underwent service/package transition; DR1 and DR2 kept quorum.

Native follower was installed with signature-enforced offline DNF (no repositories), services started, exact running hash checked, native authenticated API 7.4.1 and cluster hostpool of four checked, and Raft caught up. After verifying the pre-canary VM inventory, it was downgraded to exact R8 via signature-enforced offline DNF; original driver restored; R8 restarted and Raft caught up. Original management services were restored. Both test-only GPG keys retired.

## New evidence

- Start: `2026-11-19T00:38:41.783945+00:00`; end `2026-11-19T00:39:15.159000+00:00`.
- Result: `PASS_NATIVE_FOLLOWER_UPGRADE_AND_ROLLBACK`; **16/16 action exits zero**.
- Measured R13 readiness after start: **0.855 s**; measured rollback readiness after start: **0.570 s**. These are bounded poll-to-synced observations **not RTO/downtime**.
- Synchronized Raft post-canary: DR1 leader, DR2/DR3 followers, term **3531**, index/commit **164949** each.
- Native VM inventory before/after: exactly **30 records**, stable identity/state/host/datastore/history fields byte-identical (the two root-private JSON files had the same SHA-256 `ebdaf6edb9f663117df20be70616c03d4740c34a3d50dac4f487b721a0378cf7`).
- Post-canary package/version/executable/driver verified R8; original OpenNebula, SSH agent, HEM, FireEdge and libvirtd services independently checked active; both lab signer public keys absent. Existing DR4 eight OVN test guests and read-only DS104/105 were not touched.
- Raw exact root-private on-host receipt: `/root/ls-onedrs-r13-follower-canary-20261119/canary-result.json`, packages, `vm-before.json` / `vm-after.json`, audit logs and backup. No credentials or private keys published.

## Explicit outstanding acceptance

**Whole module remains NO-GO.** Only DR3 follower canary passed and original R8 was restored; no integrated R13 fleet deployment or 12-hour soak exists. Need independent review/hosted CI, exact candidate package/signing policy, coordinated safe three-controller canary/rollback, owned disposable VM placement/optimization/migration and data verification, DR4 network and native datastore eligibility, independent power/storage fencing, secure vTPM/NVRAM and nonshared recovery, authenticated V7/BFF E2E, partition/failure-domain recovery, and a fresh 12-hour installed-candidate soak. Three Raft voters cannot survive two simultaneous controller losses.
