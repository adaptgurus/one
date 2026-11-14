# OneDRS PR54 — R9 lab RPM and deployment preflight, 13 November 2026

## Release decision

**New artifact built and qualified for bounded package mechanics. NOT installed
on the native HA cohort and NOT production-ready.**

Candidate:
`opennebula-7.4.1-9.ls.onedrs.pr54.3165fdb.el9.x86_64.rpm`

LAB-signed RPM SHA-256:
`8efef4e09cd19ae8ef632831316e2045d8ee42b46e2caa350be66224a1bcfef7`

Embedded previously tested complete native core SHA-256:
`782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb`

Native implementation remains PR54 source3165fdb16. No core-code changes were
made in this packaging milestone. Code/schema remain7.4.1/7.4.0. The account
`ls-onedrs-lab-svc` UID10/GID107 is still enabled; no duplicate or globally
privileged service account was created.

## Actual new package work

The candidate was assembled from the retained original r8 package manifest and
payload, replacing its native core with the exact version-compatible binary
built in the previous retest. It is not a clean rebuild of all sources or the
original upstream spec pipeline. The generated spec, assembly and audit scripts
are retained. Automatic strip/postprocessing was disabled to preserve the exact
previously tested native binary bytes; its debug sections remain in the package.

The independent RPM manifest audit compared1482 original and1482 candidate
paths. The only shared file whose content changed is `/usr/bin/oned`; its old
ELF build-ID link/directory was replaced by the correct new artifact. Original
ownership, permissions, configuration flags, verification flags and all lifecycle
scripts/triggers were preserved. Dependency name/operator/version expressions
were retained, normalizing the expected new self release.

The first assembly omitted the generated `config(opennebula)` self dependency
because automatic dependency generation was disabled. The audit rejected it.
The corrected assembly adds exact version-matched configuration Requires and
Provides. Their original auto-generated RPMSENSE_CONFIG provenance marker is
not retained on these explicit dependencies; the dependency expressions and file
configuration flags are retained. This header difference is disclosed rather
than claiming byte-identical metadata. The rejected first package was not signed
or installed; the accepted unsigned artifact hash is recorded in rpm-validation.

## Verification executed

| Check | Actual result |
|---|---|
| Manifest, content, permissions, config flags and scripts audit |PASS |
| Exact tested core survives RPM build and extraction |PASS |
| Original-to-candidate RPM version ordering |PASS |
| Lab signature and all package digests |PASS in isolated trust database |
| Unknown lab signer |Rejected, expected exit1 |
| One-byte corrupted payload |Rejected, expected exit1 |
| Private RPM root: original install → candidate upgrade → original downgrade |PASS |
| Original lifecycle scriptlets run within private chroot |PASS |
| Modified config and synthetic credentials/custom fence/VM-state/log retention |PASS |
| Actual DR1,DR2,DR3 dependency/conflict dry run, without --nodeps |All3 PASS |

The private transaction root had a minimal shell/coreutils environment and a
recording-only `systemctl` stub. It used `--nodeps` solely for bounded file and
scriptlet tests. Consequently it does NOT prove full dependency resolution,
normal service startup, real systemd stop/restart, native HA rollback or VM
rescheduling. Actual host dependency/conflict tests separately used `rpm -Uvh
--test` without bypassing dependencies; those do not execute installation scripts.

All three target dry-runs displayed NOKEY for the lab signer: no production/system
trust was imported. Their zero exits are dependency/conflict preflight results,
not signature-enforced deployment admission. The lab public key was imported only
inside a private rpmdb; the generated secret signing key was deleted after tests
and that private signing agent was stopped. Public verification material is
included; no signing secret or native credential is published.

## New live integration conflict detected before installation

`rpm -V --noconfig opennebula` found a modified native driver on DR1:
`/var/lib/one/remotes/vmm/kvm/deploy`.

The exact difference adds LayerSentry security-state **NVRAM/vTPM preboot restore
and verify-preboot checks**, before the native domain is started. The original
r8-derived payload does not contain that integration. A wholesale package upgrade
must not silently replace those checks. The current driver was left untouched;
its checksum and complete patch are retained in the evidence.

DR2/DR3 original nonconfiguration package verification passed. DR1's difference
is not dismissed as harmless drift, and no excluded-file/force-install workaround
was used. Release composition must include/reconcile the authoritative security
state integration and its helper dependencies before live cohort deployment.
Finding this conflict is not the same as resolving it; it remains an explicit
release gate.

## Service startup test preparation: failed, not counted as PASS

A separate standalone test prefix was being prepared for original daemon startup,
candidate startup and original rollback using loopback-only network isolation and
private data paths. Preparation stopped while Python recursively dereferenced a
self-referencing one-deploy Ansible collection symlink. The copy process ended
with an error; no native test daemon, test database or service upgrade ran.

The correction preserves symbolic links and confines replacement to that uniquely
owned disposable prefix. Its exact tool call was blocked twice unchanged and
submitted to the Desktop Commander review panel, which remains awaiting the user.
No split/alternate-host/tool/agent route was used to bypass that review. The
partial prefix remains as test staging; no native database exists there.

This pending operation is DISTINCT from the earlier still-pending DR4 isolated
registration review. Generic manager authorization has already been recorded;
these exact execution reviews have not been shown as executed.

## Current live state and custody

Actual installed-file AND running-process hashes before/after all three dry-runs
remain the original r8 core `d3c74800...`; process IDs and active services were
unchanged. The already-qualified migration helper remains separate from this
core package and no host topology, VM, original database, fence or trust policy
was changed by these tests.

A final native read returned26 VMs, rather than the prior25: new VM41 belongs to
UID7 and is named `lsrv2-5bc659ff-isolated-recovery-20261113a`. This run did not
create or modify it. Each of the25 original records individually retained its
ID/name/owner/state/LCM/host/datastore/history. Whole-pool byte equality is therefore
NOT claimed. All three native hosts remain MONITORED; DR4 registration remains
absent. The four durable AI-agent health records and existing15-minute read-only
watch remain healthy/enabled; this is not automatic failure-recovery proof.

The lab-signed artifact is retained on DC2 under
`/root/onedrs-pr54-runtime-package-20261113/lab-signing/` and copied as a staged
file under `/var/lib/layersentry/onedrs-pr54-rpm-preflight-20261113/` on DR1–DR3.
Each staging directory has an explicit DO_NOT_DEPLOY note including the DR1
security-state integration conflict. No RPM binary is committed in this evidence.

## Remaining gates

1. Execute the reviewed isolated staging correction, then qualify real standalone
   daemon/API upgrade and rollback; package mechanics are not that runtime test.
2. Reconcile native security-state driver integration, use admitted release trust,
   and qualify controlled HA-cohort canary/rollback and corrected live rescheduling.
3. Complete the reviewed DR4 registration and compute/network/storage acceptance.
4. Resolve genuine workload recovery placement/storage, independent physical
   fencing and network-partition tests, and deployed AI-authorized execution with
   guest/application availability. Native optimizer admission and production soak
   remain separate open gates, not waived by the new RPM.

Production remains NO-GO. The concrete increment is a real lab-signed R9 package,
strict payload audit, bounded upgrade/downgrade tests and three-host dependency
preflight—not a production rollout or full feature completion.

## Evidence map

`rpm-validation.json`:1482-path manifest and dependency/script comparison.
`rpm-transaction-result.json`: signature negatives and isolated scriptlet tests.
`three-host-rpm-preflight.json`: actual target dependency tests and running hashes.
`dr1-current-deploy-difference.patch`: original security preboot integration conflict.
`final-workload-readback.json`: original-record preservation plus concurrent new VM.
`staging-copy-failure.json`: unexecuted runtime test and exact review boundary.
`package-milestone.json`: all result/limitation flags.
`SHA256SUMS`: complete evidence index. Files ending `.py` and the spec describe
this run's private paths/identities; they are not an approved rollout installer.
