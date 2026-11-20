# Original physical-parent discovery

A prior user record supplied the DSS8 FQDN. A bounded DNS check from DC2 resolves that name, the inferred sibling name, and a deliberately nonexistent name to the same address. This negative control prevents treating the DNS answer as an authenticated Proxmox management endpoint. Exact observations are in result.json.

Existing known-host records on DC2 and original DR1-DR3 contain no pin for the returned address or DSS8 FQDN. No host key was accepted, password attempted, parent session opened, or fence action issued. This does not establish that the address is a Proxmox server.

The original DR VM-to-parent/VMID mapping, trusted management identity and usable fencing path remain missing. Logical labels and the disposable nested realm cannot substitute for these physical facts. DC1 and unrelated lab resources were preserved.
