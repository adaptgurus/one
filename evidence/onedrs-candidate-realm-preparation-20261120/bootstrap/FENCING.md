# Proposed owned-realm native bootstrap and fencing boundary

Status: staged design for parent review. No native package installation, native start, fencing action, recovery, witness account, sudo rule, new outer listener, or new soak has been performed by this staging.

## Authority and exclusions

The sole fenceable set is the five UUIDs in realm-allowlist.json, whose SHA256 is 5911487abf74555c790aad971c288b5a741e41caa651a1b0c8d7e425955e0c24. The authorizer must match name, UUID, MAC, network UUID and bridge, disk path under the owned realm, and live QEMU PID plus process start ticks. A supplied host name or UUID alone is insufficient. Native host IDs 0–4 are expectations until exact native allocation/readback binds them to these UUIDs; a mismatch stops the bootstrap.

The storage VM bf807b1a-a24c-4287-8ef7-145e6af8689c is explicitly not fenceable. The outer host, old 192.168.246 realm, original DR/DC services, existing outer NFS service/exports, other guests and other network/route definitions are excluded. No virsh command may enumerate targets and then act on the enumeration. The immutable exact allowlist is the only target selector.

At most two member fence events may be unresolved at once. That preserves three of the five voters. A global root-owned authority lock serializes arm, power operation, proof, claim, reconciliation, revocation and restart. Separate callbacks cannot race these operations.

This is a virtual power fence of a disposable nested controller/compute VM. It demonstrates a software failure domain and shared-storage recovery. It does not establish physical BMC, rack, power, network or storage independence.

## Concrete native bootstrap

native-bootstrap.json records the exact proposed settings and port matrix. All candidate source/RPM/runtime digests are deliberately null until the parent freezes the combined release.

Local MariaDB databases remain independent with wsrep disabled. The initial oneadmin secret already exists only in protected staging and on the fresh nodes. Start rc01 alone in native solo mode, capture its actual generated .one authority and consistent native database privately, then register/transition it to native server0. Enroll inactive followers sequentially from that authority, with exact returned server IDs and no automatic membership-write replay. A timeout is reconciled by readback before further mutation.

Raft settings remain unchanged from the established realm:

- LIMIT_PURGE 100000; LOG_RETENTION 250000; LOG_PURGE_TIMEOUT 60.
- ELECTION_TIMEOUT_MS 5000; BROADCAST_TIMEOUT_MS 500; XMLRPC_TIMEOUT_MS 1000.

The floating API/monitoring address is 192.168.247.10/24 on eth0. The exact candidate native raft/vip.sh leader/follower hooks own that VIP. XML-RPC listens on 0.0.0.0 so the VIP can be served; the new guest firewall permits native TCP2633 only from the five exact member addresses. Remote gRPC is not exposed; its listener remains loopback. Qualification access uses pinned SSH forwarding when possible. Native monitoring targets the VIP, with fresh supported RSA3072 public/private keys and UDP4124 restricted to the five members.

The reviewed native gRPC implementation uses InsecureServerCredentials and InsecureChannelCredentials. Native XML-RPC/Raft in this isolated fixture is HTTP. The fresh RSA monitoring key and fence signer are not transport TLS certificates. The separately qualified original DR operator mTLS path remains a distinct proof.

Before admitting workloads, verify all five actual /proc executable digests, native version/capabilities, exact native hosts, local SQL isolation, full .one authority consistency without printing it, current leader/term, moving-watermark convergence, and exactly one VIP owner matching that leader. All five nodes must be healthy KVM compute members. No FireEdge, Sunstone, OneFlow or OneGate is needed for this fixture.

## Storage retained through the fault

The three native data leaves are already NFSv4.2 hard/TCP mounts of the separate storage VM, with nosuid/nodev/noexec. Actual oneadmin writes and 75 shared reads passed. Root clients cannot write; the five exact clients alone can reach TCP2049. The root-owned fences export is read-only and contains no private keys.

The same native system datastore and guest disk objects remain available to survivors. Recovery never copies, deletes, overwrites or changes ownership of those disks to manufacture success. Canary disk payload/identity checks must precede the fault and match after recovery. The storage VM stays outside the injected fault set.

## Single writer, durable events and once-only power operations

The proposed outer-host root-only authority uses an owned 0700 state directory and 0600 journal, separate from exports. Every transition is append-only and fsynced before acknowledging it; atomic state files include the preceding record hash. A single flock spans each transition and its libvirt readback.

The public state machine is:

1. ARMED: an explicit parent-approved case binds a cryptographic event nonce, exact allowlist SHA, native host mapping, failed-node boot ID, live QEMU PID/start ticks, candidate identity and configured policy/template SHA. Snapshot age must be <=30 seconds. Native canaries and all nested domain UUIDs on the target are separately allowlisted; foreign nested guests prevent arming.
2. POWER_OFF_INTENT: persist intent before one exact libvirt destroy-by-UUID operation. The CLI may not retry automatically.
3. FENCED: only after libvirt says shut off, the recorded QEMU process no longer exists with the same start ticks, no managed-save resume/autostart path exists, and the full five-member inventory still identifies only the selected stopped nodes. If transport times out or identity becomes uncertain, record UNCERTAIN; no proof and no replay. A separate read-only reconciliation may establish the actual result without issuing another power action.
4. CLAIMED: one native host-error hook obtains one durable claim. A second claim is refused, including after witness restart, unless an explicit reviewed reconciliation opens a new attempt. A crashed or uncertain hook therefore blocks rather than silently repeats native recovery.
5. RECOVERY_RECONCILED: read back each affected native VM's exact ID/UUID, current target/history and terminal state, plus one surviving live nested instance and original disk payload. Verify both failed sources remain stopped. Native RPC acknowledgement alone does not close an event.
6. REVOKED: publish a signed revocation, retire the active receipt and prove revocation from all surviving consumers. No source restart is allowed while a claim is unresolved, while any native affected action remains uncertain, or before a final fresh power-off check.
7. RESTARTED: only after the explicit case restoration gate, revocation convergence, expired verification leases, and confirmed absence of nested autostart/managed-save resurrection, start the exact same source UUID once. Capture new process/guest boot incarnation. No catch-all finally block or automatic rollback may restart a fenced member.

A failure leaves the stopped source stopped and the durable event open for inspection. It never deletes evidence or turns an inconclusive result into PASS.

## Signed receipts and online claims

The fence signing private key is newly staged under bootstrap-private, root0600, never copied to the storage VM or any export. Only its public key/pin is distributed. A signing-key epoch and its public-key hash are included in every message; trust rotation requires explicit pin installation and revocation of the old epoch.

The signed canonical JSON receipt contains exactly:

- schema, realm, allowlist_sha256, signer_epoch and signing_key_sha256;
- event_nonce, native_host_id, native_host_name, member_ip, outer_domain_uuid;
- source_boot_id, source_qemu_pid and source_qemu_start_ticks;
- candidate_core_sha256 and native_policy_template_sha256;
- state=FENCED, confirmed_off_at, receipt_not_after;
- power_action_journal_hash and authority_sequence.

Canonical serialization is UTF-8 JSON with sorted keys, compact separators, no floats, duplicate keys or unknown fields. Ed25519 signs the exact canonical bytes; the envelope contains the object plus base64 signature. Paths are never taken from the receipt. Fences are published atomically by root into the storage backing directory and exported read-only. Missing, malformed, stale, future-dated, wrong-key, wrong-realm, wrong-native-host, wrong-incarnation and wrong-allowlist messages fail closed.

A cached NFS receipt alone is not enough to authorize recovery. The native fencer additionally requests a fresh online witness claim over strictly pinned SSH to the outer host. Each controller has its own newly staged witness key. A future dedicated locked-password account has a root-owned home/authorized_keys and per-key from=exact member /32, restrict and a fixed forced command selecting the server ID. No PTY, forwarding, shell, arbitrary command, power action or general sudo is granted. The root helper accepts bounded JSON on stdin and only the fixed claim/status interface.

The claim includes a fresh random 64hex challenge, event nonce, requesting server ID and exact native HOST XML hash. The authority independently rechecks the allowlist, current durable event and power-off state under its lock, then persists the once-only claim before signing a response. The response binds the challenge, claim ID, full event identity, current sequence and an expiry <=45 seconds. The native fencer requires its own challenge and exact current native error-state identity; it never accepts a caller-supplied success flag. A repeated nonce, previously claimed event, expired reply, authority outage or uncertain response is a refusal.

A claim is a durable hold: no restart may occur until recovery reconciliation closes it. Expiry limits acceptance of a response; expiry does not release the source power hold. This removes the race where a valid old receipt could outlive an operator restart. If the witness response is lost after claim persistence, status is read-only and the uncertain recovery is reconciled explicitly; no automatic new claim or native mutation occurs.

The public revocation binds the same event, a strictly greater authority sequence, prior receipt hash and reason. Both witness and fencer reject revoked events. Source restart also waits for all alive consumers to observe revocation and all <=45-second verification leases to expire. If a consumer is unavailable or its state cannot be established, keep the source stopped until the case is explicitly reconciled.

## Native recovery integration

Use the exact packaged native Host error hook and ft/host_error.rb --migrate with fencing enabled. Never pass --no-fencing. The only infrastructure adaptation is the separate fence_host.sh verifier/witness adapter. Native OpenNebula remains placement and VM lifecycle authority; this design adds no parallel placement database or scheduler.

A pause of zero may be used only for this explicit externally fenced test case, because the source is already demonstrably powered off and held. The normal native monitoring intervals remain unchanged. Exact hook-resource template syntax, packaged hook hashes and callback behavior must be read back from the final candidate before enabling it. Initially the hook stays disabled while all negative proof cases run.

The final fencer must require native HOST state ERROR (3), as defined by the final candidate Host.h; disabled or legacy transitional states are not accepted with the exact configured host ID/name/realm/UUID mapping and a matching current event. It returns success only after signature, freshness and online claim checks. It writes no native VM action itself. The packaged hook then requests ordinary native rescheduling; current native admission and VMGroup safeguards still apply.

There is no automatic replay of a failed/uncertain hook, approval, native operation or power action. Operator reconciliation can make a new explicitly bound attempt after proving that the earlier one did not dispatch or has fully terminated.

## K=2 and measured outcomes

Keep the configured host failure tolerance at K=2 throughout one- and two-fence cases. Record policy/template hashes before and after every phase. After two successful fences, exactly three voters/compute nodes survive; the intended report is DEGRADED with consumed reserve, not a policy silently reduced to K=0 or a new healthy N+2 assertion. Recovery must use the candidate's measured reserve semantics and current native inputs.

Restoration of five nodes does not automatically establish reserve readiness. Require current healthy host monitoring, reconciled native placement, fresh eligible-host/domain inputs, retained policy K=2, successful canary readiness, and explicit reserve readback before recording restored capacity. Failure-domain labels in this fixture describe logical owned nodes only.

## Required qualification before injection

The protocol implementation must prove:

- wrong/foreign UUID, third simultaneous fence, storage UUID, PID reuse, changed disk/network/allowlist and foreign nested guest all refuse before power intent;
- invalid signature, unknown/duplicate fields, wrong key epoch, wrong challenge, future/expired proof, mismatched host/incarnation, revoked receipt and untrusted SSH key all refuse;
- concurrent claim attempts have exactly one winner; claim survives authority restart; lost reply and state-write failure cannot replay or return success;
- power timeout records UNCERTAIN and does not issue a second destroy; read-only reconciliation can report actual state;
- stale NFS cache cannot bypass the online claim/revocation and held-source checks;
- source restart is refused with an open claim, incomplete native recovery, active guest on a failed source, missing revocation acknowledgement or unexpired lease;
- parent-supplied positive software-fence case proves stopped source, signed fresh claim, native recovery, exact single guest instance, preserved payload, unchanged K=2 and DEGRADED reserve consumption;
- native and outer inventories, old R13 service/share access and >15GiB free-space guard hold before and after the case.

These tests are not complete merely because this proposal or keys exist. Actual source tests must be labeled simulated; only the subsequent live owned-realm fault case can qualify native recovery.
