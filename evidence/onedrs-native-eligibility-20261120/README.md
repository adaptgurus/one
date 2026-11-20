# Native source-bound OneDRS eligibility qualification

The isolated vendor OpenNebula 7.4.1 build passed 68 real XML-RPC contracts in a fresh private mount/network/PID namespace. Three disposable native VMs used inert VM/TM drivers; no driver payload was executed and this evidence does not claim a hypervisor migration or fleet deployment.

The scheduler emits a per-VM/target identity from the same cached input that is serialized to OneDRS. The optimizer may only echo an existing candidate. Checked Apply revalidates the VM shape, current owner authorization, native scheduling requirements, host identity/state and policy, then repeats the check under the target host lock before capacity is reserved. Native history persists the exact identity through admission. Unrelated host monitoring attributes do not expire a recommendation. VMGroup checked migration is explicitly unsupported in this candidate.

The contracts cover accepted native execution/readback, missing/forged/borrowed tokens, changed requirements, changed target labels, VMGroup rejection, exact owner ACL revocation and a deterministic host-label change between the API and final LCM admission. Rejected plans preserve the original VM history/accounting. The late change restores the source, releases any target reservation and sends no migration driver request.

The Python scheduler suite passed 109 tests normally and 109 with Python -O using the pinned CI dependency environment. The vendor build retained the existing distribution hardening and gRPC flags; its complete command, flags and artifact digests are in vendor-build.json.

This patch is based on the stable capacity review snapshot 71e0c17389aaa8b4148c0f5db0ff41e7a536582d. Only this eligibility delta is to be integrated into the authoritative native branch; the snapshot commit is not a release base. The separate ordinary enforced-admission/fault work and complete Generate/Reject lifecycle remain release gates. The original fleet was unchanged.

Runtime source: tools/onedrs_qualification/native_eligibility_contract.py and native_eligibility_mad_fixture.py. The fixture captures exact native scheduler XML before returning controlled actions; it never reconstructs a token from a later read.
