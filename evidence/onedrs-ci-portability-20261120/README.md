# OneDRS CI portability correction — 20 November 2026

The original safety workflow installed PuLP alone, while the scheduler parser also imports PyYAML and xsdata. Two actual solver test modules also referenced the lab-only CBC executable under `/usr/lib/one/python`, which is absent on a fresh hosted runner.

The correction pins the scheduler dependency closure, resolves CBC through the installed PuLP distribution using `PULP_CBC_CMD`, includes the requirements file in workflow path triggers, and quotes unittest discovery patterns. It does not skip solver tests or change production scheduler behavior.

## Executed validation

- A new Python 3.12 virtual environment containing only the original PuLP dependency failed eight test-module imports with `ModuleNotFoundError: yaml`.
- With all dependencies installed, the original two solver test modules failed ten of sixteen tests when the lab library directory was hidden in a private mount namespace. The error was `PulpSolverError: cannot execute` at the hard-coded CBC path.
- The corrected scheduler suite passed **93/93 normal** and **93/93 optimized**, with **zero skips**, in the same namespace while `/usr/lib/one/python` was unavailable.
- `pip check` passed. All Python imports and the executed CBC solver resolved inside the new virtual environment.
- The host's mount namespace, lab solver, running daemons and virtual machines were unchanged.

`result.json` records dependency versions and SHA-256 hashes for the retained raw logs. Raw evidence is on DC2 under `/root/ls-onedrs-ci-deps-20261120/evidence/`.

This is executed source/CI portability evidence on the lab OS, not a successful GitHub-hosted workflow run or production acceptance. The already-qualified native C++ and rollback code were not changed by this patch.
