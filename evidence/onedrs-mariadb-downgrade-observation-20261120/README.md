# Native MariaDB downgrade inspection — observation qualification

The exporter and shared guard were exercised against the actual DR1 R8 database on 20 November 2026. The final run exported 55 VM rows, four plan rows, and 379 histories in one local read-only repeatable-read transaction. All three tables were verified as InnoDB. The shared guard accepted the stable old-format state in that snapshot. Six focused tests cover credential parsing, literal quoting, exact UTF-8/newline preservation, incomplete exports, count mismatches, transaction boundaries, and nontransactional engines.

This is a read-only observation qualification, **not permission or evidence to downgrade a running controller**. The production rollback caller must first freeze the relevant placement and plan writers, synchronize native replication, stop the controller, capture a fresh snapshot, and apply the state guard before starting an older binary. A previous live snapshot is not a writer lock.

## Exact procedure

Run `tools/onedrs_qualification/native_mysql_snapshot.py --config /etc/one/oned.conf --output <private-root-owned-directory>/snapshot.json` locally as root. Then run `tools/onedrs_qualification/native_downgrade_guard.py --snapshot <same-path>`. The snapshot contains native workload XML and must remain mode 0600 outside Git. Only sanitized guard and transaction reports belong in release evidence.

The exporter restricts the endpoint to the local database. It uses one ephemeral mode-0600 client option file under a private mode-0700 directory, exclusive `--defaults-file` loading, a fixed client environment, and no shell SQL interpolation. This prevents ambient client settings from adding another endpoint or a pre-transaction command. Credentials and raw database diagnostics are not logged. Exact native XML is transferred as HEX inside the local CLI stream. Transaction completion and row counts must match before a snapshot is written exclusively.

The first actual read-only export used `--defaults-extra-file`; review identified its ambient-option risk. That original private observation is retained. The final source uses exclusive options and passed a second actual DR1 transaction. No controller or database service was restarted; the native daemon PID was unchanged during that final observation.

## Database topology observation

DR1 reported MariaDB 10.5.29, local server ID 1. Its Galera status was Disconnected/size zero/ready OFF. This does not establish a failed controller cluster: the native service uses its own Raft replication path. Do not treat these controllers as a verified shared Galera database or invent a Galera failover claim. Galera status in the receipt is observed at transaction boundaries and is not part of the tables' MVCC snapshot.

`result.json` binds the final exporter digest, guard commit, snapshot digest, native PID, and scope. `live-dr1-export-r2.json` contains only transaction provenance and row counts; `live-dr1-guard-r2.json` contains only the shared guard's sanitized decision. Raw snapshots and database credentials are deliberately absent from this directory. Final release-state inspection must be repeated at the stopped-controller phase on the exact candidate.
