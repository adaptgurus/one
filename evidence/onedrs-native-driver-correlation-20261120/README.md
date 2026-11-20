# Native driver request correlation qualification

Status: **focused native protocol PASS; production release HOLD**. This slice closes the retained same-VM post-dispatch reply counterexample. It does not qualify the combined reserve/VMGroup feature profile or any physical hypervisor/failure domain. Original DR1–DR4 remain on their existing package.

## Change and scope

Native History persists a random request identity, daemon instance, operation, dispatch state and pending marker before writing a critical VMM/TM command. The matched Ruby worker carries that identity with its own queued action and returns it only on the corresponding terminal reply. Protocol validation precedes mutable VM fields; the identity is also copied into the LCM queue and consumed under the same VM lock as the terminal transition. New history copies start with no pending ticket. Untagged, stale, wrong-operation, wrong-state and duplicate replies cannot advance a current action. A malformed successful deployment acknowledgement is rejected before its ticket or deployment ID changes.

All six explicit recovery variants and native delete/retry entry points refuse to supersede a current outstanding driver request. After a daemon restart, explicit operator recovery can retire the previous instance's ticket because its old pipe cannot acknowledge a new request. This is not a hypervisor-quiescence or fencing proof: operators must reconcile the actual operation before forced recovery. A lost reply remains unresolved; there is no automatic replay.

The protocol changes apply to native lifecycle VMM commands and lifecycle TM transfers. Background disk transfers and post-delete cleanup retain vendor behavior and cannot acknowledge a protected lifecycle transition. No separate placement database or scheduler owner is introduced.

## Actual verification

- Vendor7.4.1 compilation of both oned and onemonitord passed with the recorded distro hardening, MySQL, SQLite, gRPC and systemd settings. R19 inherits the qualified R17 cache and its explicit source-custody receipt; each build records its own exact commit, native delta and file hashes.
- The focused actual native run passed35 checks in distinct mount/network/PID namespaces with loopback-only networking and inert MADs. It executed no driver payload, hypervisor operation, crash or SQL failure injection. The tested binary is identified in summary.json.
- Recovery0–5 was refused while action A was outstanding. A then ended through its real failure response, and action B on the same VM received a new generation and request identity. Late A success/failure replies left B applying; B's own reply completed it. Duplicate replies preserved history and host accounting. Native prolog/deploy used distinct identities, and malformed deployment success preserved the pending request until a valid acknowledgement arrived.
- The actual Ruby action manager passed16 standalone protocol checks, including reverse completion order of two requests with the same VM ID, immutable action context, malformed prefix refusal, and exception cleanup.
- The downgrade guard and runtime payload manifest passed47 source checks normally and47 with Python optimization. The downgrade guard blocks an outstanding ticket even when the VM enum appears stable; the payload manifest requires the exact matched Ruby sources.

## Retained fixture failures

The first Ruby fixture called a private loop method through a public receiver and was corrected to invoke the existing method with send. Native private runs1 and2 each passed33 checks before their final observer used an incorrect global log path. Read-only diagnosis located the actual ONE_LOCATION/var/oned.log, confirmed the malformed acknowledgement was rejected and the request stayed pending, and the corrected fresh run3 passed35 checks. No native source change was made to obtain these observer retries. All failures and the diagnosis are retained.

## Packaging and remaining gates

The installed vendor ownership check identifies ActionManager.rb in opennebula-libs, while OpenNebulaDriver.rb and DriverExecHelper.rb belong to opennebula. The final release therefore needs matched server and libraries RPMs, a verified complete payload and normal dependency-checked installation. This source-only qualification does not install either package.

The private build still advertises the prior v3 feature scope. Combined v4 reserve leases, VMGroup prefix checks, protected operator paths, real guest migration/recovery/fencing, exact-package rollback and a new candidate soak remain separate gates. Older R13 soak time is not credited.
