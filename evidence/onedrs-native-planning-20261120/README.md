# Checked native Generate and Reject

## Contract

- `one.cluster.optimizechecked(session, cluster_id, expected_template_sha256, expected_plan_sha256, request_nonce)`
- `one.cluster.planrejectchecked(session, cluster_id, expected_plan_sha256, expected_template_sha256, request_nonce)`

Both methods require normal native cluster ADMIN authorization and current manual policy. Plan and policy comparisons and the durable request transition run under cluster then plan locks. Generate accepts an empty base-plan digest only when no plan is publicly visible. Reject requires the exact READY generation through its native plan digest. Request nonces are bounded lowercase 64-hex correlation values; they are not identities or authority.

`PLAN/REQUEST` records NONCE, ACTION, STATE, TEMPLATE_SHA256, BASE_PLAN_SHA256, PLAN_GENERATION, ERROR, INSTANCE and STARTED_AT. The last two fields are native restart/timeout custody. Generate states are GENERATING, READY, NOOP and ERROR; Reject records REJECTED and retains the rejected generation. Native plan enum values remain unchanged. NOOP and ERROR use plan NONE and no actions; REJECTED also retains its original plan generation.

The durable request is committed before optimizer input is queued. The exact native request nonce and policy accompany the cached scheduler input and are echoed by the optimizer. Missing, late, superseded or mismatched-policy responses cannot replace the checked request. Checked generation never executes its recommendations. All checked policy/plan mutations are refused while GENERATING; legacy Optimize/Execute cannot bypass a checked recommendation lifecycle.

On native process/leader-instance restart or a 600-second response timeout, pending generation records ERROR. It is not replayed. An optimizer failure returns an explicit correlated error, not an empty successful plan. A new reviewed request is required. Old R8 must not be used to resume a generating request.

## Qualification

The exact preserved vendor OpenNebula 7.4.1 build passed with existing distribution hardening and gRPC. All86 real XML-RPC contracts passed in a fresh private mount/network/PID namespace with three disposable native VMs and inert drivers. No driver payload was executed, no original service was changed, and this is not hypervisor migration or fleet deployment evidence. A second run captured the actual GENERATING, READY, NOOP and REJECTED XML fixtures in this directory.

Contracts cover durable-before-dispatch, busy mutation refusal, exact rejection/readback, delayed replies, missing nonce, policy drift, request/result DB failures, restart/no replay, timeout, concurrent Generate, Apply-vs-Reject CAS, scoped authorization, malformed nonce, native empty-cluster NOOP and group recommendation review while group Apply remains unsupported. The Python suite passed115 tests both normally and with -O.

This commit is a scoped delta atop eligibility commit10dda22e38bd929fb32c9a0905c303b017c24b3c. The authoritative native integration must retain the separate ordinary enforced-admission, generic callback generation, protocol resource-binding and VMGroup qualification work. No rollout is authorized by this evidence alone.
