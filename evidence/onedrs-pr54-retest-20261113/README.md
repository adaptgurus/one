# OneDRS PR54 retest — production deployment still pending

Verified 13 November 2026, approximately 08:39–08:52 IST.
Implementation remains `3165fdb1603787a2ac4d9655a17999e0c189db47`.

## Decision

**Bounded rebuild/regression/schema retest PASS. Production deployment remains
PENDING / NO-GO. The running native optimizer still fails VM11 recovery admission.**
No original controller was restarted, upgraded, failed over or reconfigured.
The separately pending DR4 enrollment review was not executed or bypassed.

## New progress beyond the earlier source-only test

The corrected native scheduler translation unit was rebuilt in a private copy
of the exact retained OpenNebula7.4.1 r8 package build, replacing only the PR54
scheduler source and adding its header. The original package's
`include/NebulaService.h` and `src/template/Template.cc` were kept byte-identical.
Original compile/link flags, linked libraries and existing package object files
were reused; the complete native `oned` binary linked successfully.

This is an **incremental packaged-baseline full binary relink**, not a clean
rebuild of every object and not an installable/signed RPM. The original4.2GiB
build tree and original installed files were not altered.

Candidate binary SHA-256:
`782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb`

The candidate retains code version7.4.1 and shared/local database version7.4.0.
Its original package banner suffix `27b39092-dirty` is deliberately unchanged;
the patch's precise provenance is the source commit, build recipe and binary
hash, NOT that older banner suffix. The candidate is retained privately on DC2
under `/root/onedrs-pr54-package-retest-20261113/build/src/nebula/oned` with an
explicit DO_NOT_DEPLOY note at the retest root.

## Fresh tests executed

| Test | Result |
|---|---|
| C++ direct scheduler-context cases |10 PASS |
| Exhaustive cached-pool/destination combinations |4,032 PASS |
| Native Python scheduler tests, including real CBC destination restriction |41 PASS |
| Full native core compile/archive/link against original package objects |PASS |
| Dynamic libraries resolved |PASS |
| Original ELF architecture/type, GNU_RELRO and BIND_NOW preserved |PASS |
| Original binary initializes a new isolated MySQL database |PASS |
| Candidate binary initializes a separate new isolated MySQL database |PASS |
| Resulting complete schemas |40 tables, identical definitions |
| Both binaries' database-version declarations/checks |7.4.0 retained |

The SQL tests used a new private MariaDB10.5.29 process bound to loopback33654,
with its own socket, data directory, two empty test databases and fresh
least-scope test credentials. No live database was read, copied or modified.
Only `oned -i` bootstrap/version paths ran; native service managers did not start.

### First test failure and corrected interpretation

The first harness incorrectly expected `oned -i` to succeed on an already
initialized database. It failed at duplicate logdb indexes. Repeating that
operation using the ORIGINAL binary reproduced exactly the same behavior.
The corrected test therefore verifies successful fresh initialization, identical
schema definitions, accepted7.4.0 version checks and unchanged schema/version
rows after the expected non-idempotent initialization attempts.

Exit255 on those existing-database initialization controls is explicitly retained
and expected; it is NOT counted as successful daemon startup. This does not test
normal service restart, HA failover or runtime rollback. Raw first-attempt result
and sanitized logs are retained, rather than hiding the failed assumption.

The full link also emits generated-parser One Definition Rule warnings. No
warning-free build or sanitizer run is claimed. `build-recipe.json` preserves
the actual arguments and original version/schema inputs.

## Fresh deployed-runtime retest

Direct installed-file AND `/proc/<pid>/exe` hashing on DR1, DR2 and DR3 confirmed
all three still run `opennebula-7.4.1-8.ls.onedrs.e39bf32.el9`, not PR54's candidate.
Installed/running core hash on all three:
`d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1`.
All three services and node agents were active. Their existing migration-network
helper remained `46d1a4c89a34f519f348869182c4caaf0b75dafe288f502e3e9a2bdb121af4ed`.
The installed core RPM signatures still report `(none)`.

One manual-mode native cluster0 optimization request was submitted once.
The request returned0, but the authoritative scheduler log reported:

    resilience admission failed: VM 11 has no eligible surviving host

No plan was executed. All25 original VM identities, states, LCM states, hosts,
system datastores and history sequences remained identical. The ONE_DRS policy
was unchanged. DR4 remained absent from native enrollment.
This is a retest of the ORIGINAL deployed build; it is not a live retest of the
new serializer fix. It confirms that deployment is not the only outstanding
acceptance condition: the separate workload storage/placement gate remains.

## Cleanup and remaining release sequence

Both private SQL servers stopped, their listener/socket disappeared, and the
new private data directories and generated test credentials were removed.
Sanitized evidence and the private candidate build remain. No existing VM,
physical host, storage policy, signed release trust or production database changed.

The remaining deployment sequence is to package the version-compatible candidate
through the original release process, verify package/signature admission and
preserved original configuration, then perform a controlled native HA canary and
rollback and rerun actual rescheduling on the installed candidate. No new RPM
was built in this retest. No candidate service startup/canary or corrected live
rescheduling has passed yet. Original policy/storage eligibility, DR4 qualification,
independent physical fencing/partition recovery, deployed AI execution and
application acceptance remain separate module gates. Do not mark them passed
from these bounded build/schema results.

## Evidence index

`retest-summary.json`: explicit result/limitation matrix.
`core-build-result.json` and `build-recipe.json`: full binary and version custody.
`cpp-context-retest.log` and `native-python-retest.log`: fresh regression results.
`mysql-compatibility-result.json`:40-table schema tests and expected controls.
`mysql-compatibility-first-attempt.json`: retained failed harness assumption.
`ELF-compatibility.json`: retained executable hardening/architecture checks.
`live-running-builds.json`: installed and actually running DR1–DR3 identities.
`live-optimizer-retest.json`, `bounded-optimizer-log.txt`, VM snapshots: current
native admission failure and original workload/policy preservation.
`SHA256SUMS`: complete evidence-file digests.
