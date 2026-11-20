# Native rollback state gate: API-to-LCM gap

The prior guard accepted a native enforced target history while the VM still reported RUNNING, POWEROFF, or HOLD before final LCM admission. Seven focused regression failures reproduced the hole (24 test methods); the revised guard and backend-independent snapshot loader pass 28 test methods in normal and optimized Python.

The actual native R16 binary e93458d6aeec3eb59e5671e45dfb535338f664efc8b517a7d86b5f834f1ffd8c passed 24 private runtime checks. A SQLite trigger observed the real native API VM-body commit before the LCM event could be enqueued. The captured rows showed live migration 3/3 at SEQ1, powered-off migration 8/0 at SEQ1, and initial deploy 2/0 at SEQ0, each with current STIME0 and no target reservation. All three immutable captures are refused by the same row policy and CLI loader. No native row state was fabricated for these captures. Drivers were inert; this evidence does not claim a hypervisor migration or an original-fleet test.

Canonical current sequence comes from the VM body. Only that row and its canonical predecessor are used; a later unreferenced failed insert does not become an active request. New checked/enforced or generic plan histories block rollback while their predecessor remains open, current STIME is not started, or an ACTIVE operation has not stabilized. Existing pending and APPLYING plan and GENERATING request gates remain.

## MariaDB/Galera interface

`inspect_rows(vm_rows, plan_rows, history_rows)` is backend-independent. Rows have exact shapes `[oid,state,lcm_state,body]`, `[cid,state,body]`, and `[vid,seq,body]`, with integer indices and exact XML strings. All rows must come from one read-only consistent transaction. Duplicates or malformed indices fail closed. `--snapshot` accepts the root export schema `onedrs.native-db-snapshot/v1`, backend mysql/mariadb/sqlite, those three arrays, and transaction metadata with boolean read_only and consistent_snapshot true. The report includes provenance and snapshot SHA, never raw VM/history XML.

Raw native snapshots stay mode0600 in the private runtime; only sanitized reports are tracked. A live read-only database observation is not authorization to downgrade. The final gate runs after placement/plan writers are frozen, replication is synchronized, and the controller is stopped. Terminal request metadata must be retained outside the database before an R8 rewrite can drop it. The MariaDB exporter and its real-backend qualification are a separate root-owned step; these SQLite captures do not claim that step passed.
