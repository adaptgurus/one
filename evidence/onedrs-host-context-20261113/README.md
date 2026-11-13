# Native OneDRS cluster-health context — 13 November 2026

**New live result: initial placement by the actual OneDRS scheduler PASS.**
**New native defect: rescheduling incorrectly counts the filtered destination
pool as the complete healthy cluster. Source correction and focused native tests
PASS; the corrected oned core has NOT been deployed. Full lab feature acceptance
remains incomplete.**

Implementation: `3165fdb1603787a2ac4d9655a17999e0c189db47` in `adaptgurus/one`.
Original native source: `e39bf32b45831ef77e6aa50f8d90c148052a4c4b`.

## What actually ran on the original DR control plane

A new exclusively owned VM40, shared SYSTEM datastore116 and approved template7
were created for this test. The existing `ls-onedrs-lab-svc` UID10/GID107 performed
VM instantiation, hold/release, policy update, reschedule/unresched and termination.
Administrator authority was used only for scoped datastore/template preparation
and cleanup. No new service principal or broader base permissions were added.

The test guest used one vCPU,256MiB memory and a64MiB qcow2 disk on an isolated
subdirectory of the existing NFS export. It had no NIC. Its static init wrote and
fsynced deterministic data, then emitted checksum-valid serial heartbeats.

### Initial negative: single eligible host

With the disposable VM constrained to native host0, the existing PLACE path
refused the request with `only 1 healthy hosts, minimum is 3`. It did not deploy
the guest. This was fail-closed but conflated destination eligibility and complete
cluster health. After the correction, an equivalent hard pin still fails survivor
eligibility; it does not become an approved HA workload merely because the health
inventory is complete.

Only this test VM was held and its constraint changed to `CLUSTER_ID = 0`, keeping
all three existing hosts eligible. The original cluster policy, minimum of three,
host/rack failure tolerances, headroom and all other VM constraints were unchanged.

### Actual scheduler initial-placement PASS

The service account released the VM from HOLD into PENDING. The native controller,
configured `one_sched -p one_drs -o one_drs`, selected DR2/host1 and datastore116,
created/executed its placement action and started the guest. No direct `one.vm.deploy`
or `one.vm.migrate` call was made by this test. Native history shows PLAN_ID=-1,
ACTION_ID=0 and internal UID/GID=-1, consistent with scheduler-generated dispatch;
it is not falsely attributed to an authenticated user's deploy request.

Independent libvirt UUID enumeration across DR1–DR3 showed exactly one running
instance on DR2. The guest was READY with boot counter1 and checksum
`5271a1941cbcf81a8090844178842924e66017757abd05bf6b2e037de085474a`.
This closes a native scheduler-placement lab slice that earlier manual migration
runs had not exercised. It is not deployed AI-coordinator execution.

### Rescheduling reproduced a different blocker

One dedicated-service-account `resched` request was accepted. The subsequent
native scheduler action failed:

    resilience admission failed: only 2 healthy hosts, minimum is 3

All three original cluster hosts were still MONITORED. Native matching excludes
the current host from rescheduling destinations. The original C++ serializer used
`sr.match.match_host` both for those destinations and for the entire HOST_POOL
supplied to resilience admission. Thus a destination filter falsely removed a
healthy cluster member from the inventory.

The test guest remained running at its original host/history generation with
intact data. Its reschedule flag was explicitly cleared under the service identity.
No manual-migration fallback, reduced healthy-host minimum, HA exemption, scheduler
replacement or original-host disable was used to manufacture success. The accepted
resched API request is NOT counted as a completed move.

The live global `LIVE_RESCHEDS=0` was also preserved. Even after this context fix,
that existing setting does not imply live/zero-interruption rescheduling. It needs
separate owner qualification before a live-maintenance guarantee can be made.

## Source correction

`SchedulerHostContext.h` selects complete cluster-health context from the same
native cached scheduler pool, bounded to clusters that actually contain matched
destinations. It adds no live API reread, synthetic host or unrelated cluster.
`SchedulerManagerDriver::scheduler_message()` serializes that context while
leaving original per-VM REQUIREMENTS and match-making results unchanged.

The ILP solver remains restricted to the original allowed destination IDs. Missing
native inventory/identity fails closed and the caller does not send a partial
scheduler message. A genuinely unhealthy or missing third host still fails the
three-healthy-host policy. Hard host pins, local-only storage, survivor capacity,
failure domains and the original disruption controls remain checked.

This is not a bypass of the distinct VM11 recovery rejection, nor a replacement
for physical fencing. The original OPTIMIZE workload-storage/placement problems
are separate from the newly reproduced PLACE/reschedule context problem.

## Verification actually executed

-10 explicit C++ context cases PASS.
-4,032 exhaustive cached-pool/destination-subset cases PASS, including exact
 unchanged candidate sets and rejection of missing/malformed identities.
-41 native Python tests PASS, including seven added cases for filtered-pool
 reproduction, complete-context admission, actual host loss, hard pins, local
 storage, serializer contract and real CBC solver destination restriction.
-The full modified `SchedulerManagerDriver.cc` translation unit compiled to an
 object file with the native headers. This is NOT a full oned link/RPM build.
-Initial address-sanitizer-linked test build was unavailable because the installed
 toolchain referenced missing `/usr/lib64/libasan.so.6.0.0`. The test was compiled
 with warnings-as-errors and libstdc++ assertions instead. No sanitizer PASS claimed.

The tests use controlled native model fixtures, not a live deployment of the new
core. An initial standalone syntax compilation omitted the normal GITVERSION
build macro; the subsequent object build supplied it and passed. No production
source or policy defect is inferred from that build-command correction.

## Cleanup and preservation completed

VM40 reached native DONE and its exact domain UUID was absent on all three
hypervisors. Datastore116, template7, temporary object ACLs, all three bind mounts
and the unique NFS subtree were removed. The service account and its original
scoped permissions remain available.

All25 original VM identities, owners, states, LCM states, hosts, datastores and
latest history sequences were unchanged. The original cluster0 HA template was
unchanged. DR4 enrollment was not retried, repackaged or executed by this run.

## Native rollout boundary — important packaging finding

The existing controller is a three-server native HA authority, not a disposable
standalone process. Comparing596 tracked native C/C++ source/header files against
the retained installed-RPM build tree found two packaging/source deltas:
`include/NebulaService.h` and `src/template/Template.cc`.

The raw source header reports code7.5.80 and DB7.6.0, while the installed7.4.1
build pins DB7.4.0. Replacing `/usr/bin/oned` using an unqualified raw source build
would therefore be an unsafe way to test this narrow scheduler fix. No controller
binary, service, database identity or schema was changed or restarted.

Next release-owner step is to apply this narrow correction through the original
7.4.1 packaging with preserved version/schema and exact original security patches,
then canary/roll back the native HA cohort and repeat the real reschedule test.
Source success is not a substitute for that effectful runtime acceptance.

## Still pending

- Exact DR4 disabled/isolated enrollment remains unexecuted in its earlier review
  panel. The broad manager grant was already recorded; no new account is needed.
- The new native reschedule source correction needs original-package integration
  and actual runtime acceptance.
- Original recovery eligibility: eleven retained inactive VMs must remain inactive;
  among fourteen active VMs, two have non-shared SYSTEM storage and eleven have
  placement constraints. No constraints or storage ownership were rewritten.
- Independent physical-parent/BMC fencing, true power-loss/network-partition
  recovery, deployed AI-approved native execution and guest/application checks
  remain open. Production signing and soak are separate later gates.

The existing15-minute read-only watchdog remains enabled. Its inspected sample
shows four healthy durable agents and three monitored native hosts; it is not
an effectful HA executor. Master-context main and other modules remain unchanged.

## Evidence

`live/results.json`: positive actual native initial placement and bounded
reschedule observation. `live/reschedule-failure.json`: exact failure and full
native monitored-host inventory. `live/cleanup-preservation.json`: exact cleanup
and original workload preservation. `cpp-context-tests.log`,
`all-native-python-tests.log`, `core-object-build.log`: source/build verification.
`original-rpm-source-deltas.json`: packaging boundary. `SHA256SUMS`: evidence index.

Native documentation consulted:
https://docs.opennebula.io/7.4/product/cloud_system_administration/scheduler/drs/
https://docs.opennebula.io/7.4/product/operation_references/opennebula_services_configuration/oned/
