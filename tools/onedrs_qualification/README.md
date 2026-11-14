# OneDRS lab rollback qualification candidate

This directory contains **source-only qualification tooling**, not a new
OpenNebula daemon, a production updater, or permission to execute a deployment.
It is stacked on native PR54 commit `39a418b895ebbe196af6c75f9ed0169c2bc1c9b8`.
PR55's strict VM-state/identity guard is separate and is not included in R10.

## Implemented boundaries

`rollback_guard.py` checks exact enrolled endpoint/server IDs, unique leader,
consistent/pinned term, nonregressing committed state, and valid log geometry.
It requires two complete sampled rounds with a closing leader reread and exact
COMMIT=LOG_INDEX agreement on every node. This is a strict **sampled** check,
not an atomic snapshot, a proof of partition safety, or a new Raft implementation.
Malformed/missing/duplicate XML fields, changed authority and invalid geometry
fail explicitly. Transport retries have finite per-call and overall deadlines;
actual node lag is retained in diagnostics instead of an empty assertion message.

The acceptance budget remains 90 seconds. A separately bounded 150-second
original-state restoration window can follow a timeout. It does not turn the
missed acceptance deadline into success. Before management is enabled, the
coordinator requires original installed/running binaries, original driver,
protected configuration and original guest inventory. Unresolved consensus or
identity drift leaves management disabled rather than forcing success.

`cohort_candidate.py` incorporates the guard into a candidate version of the
actual attempted coordinator. Its finalization code does not reinstall or
restart already-running original cores after late catch-up. It reports
`FAIL_ACCEPTANCE_ORIGINAL_RESTORED` separately from a genuinely successful
acceptance and from an unresolved restoration. Service failures remain failures;
key cleanup is not attempted until all expected service restorations succeed.
`node_actor_candidate.py` adds installed/running hash, driver/configuration,
original-domain and service checks to readback. Both executors refuse Python
optimization mode before any native action because inherited guards use asserts.

Do not execute these files from the repository or against the completed run's
directory. The candidate requires a new, root-private admitted staging directory
under `/var/lib/layersentry/onedrs-r10-cohort-*`, exact pinned artifacts, reviewed
preflight/rollback custody, and the unchanged scope restrictions. The generated
actor must be staged as `node_actor.py`; the previously tested native PTY
`guest_test.py` also requires source review and exact staging. No new staging,
installation, restart or native mutation was executed for this candidate.
This candidate is not crash-safe autonomous fleet recovery; interruption/resume
and a fresh effectful cohort replay remain required before deployment admission.

## Run source tests without any native effects

From this directory:

```sh
python3 -m unittest -v test_rollback_guard test_cohort_candidate test_xmlrpc_boundary
python3 -O -m unittest -q test_rollback_guard test_cohort_candidate test_xmlrpc_boundary
python3 topology_sweep.py
```

The generated coordinator's actual finalization AST is executed with effect
spies. The XML-RPC tests use three ephemeral loopback HTTP servers and a temporary
authentication token; every server/thread is stopped and joined after each test.
No host services or native workload API are used by those tests. Legacy
reproduction tests load only the original recorded quorum/finalization AST,
not the old executable script. Under `-O`, the test explicitly demonstrates the
legacy assertion bypass rather than expecting an assertion that Python removes.

`read_only_probe.py` has only `one.zone.raftstatus` calls against the three fixed
lab endpoints, with bounded transport deadlines. It successfully sampled the
actual restored lab; it is not an installation, rescheduling or stress test.

## References consulted

OpenNebula7.4 HA upgrade documentation:
https://docs.opennebula.io/7.4/software/upgrade_process/upgrade_guide/upgrading_ha/

OpenNebula7.4 Raft service settings:
https://docs.opennebula.io/7.4/product/operation_references/opennebula_services_configuration/oned/

Ongaro and Ousterhout, Raft extended paper, Figure2:
https://raft.github.io/raft.pdf

Those references describe maintenance/consensus semantics. They do not approve
this local qualification runner or certify the LayerSentry package.
