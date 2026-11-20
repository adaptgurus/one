# Native scheduler payload custody

The earlier package recipe copied a fixed subset of runtime files. At frozen source fc08f507a3fb3b27e69896f9a4aad16a9e173d39, the R14 payload differs in 14 runtime/schema files, including two absent new modules. It is a superseded package, not a final-candidate installation failure.

`tools/onedrs_qualification/native_runtime_manifest.py` reads every scheduler runtime module, both entrypoints, the default scheduler configuration, and every XSD from an exact Git commit. It stages a new source overlay or verifies an unpacked package. Only the two explicitly recorded Python 3.12 shebang transformations are allowed. Tests and build-time download tools are excluded; an unknown runtime path is rejected rather than silently omitted.

The actual 89-file source overlay passes. The old R14 payload correctly fails with its complete difference list retained. Fifteen focused tests pass in normal and optimized Python modes, including missing new modules, stale files/schemas, content drift, symlinks, unknown entrypoints, and reading the frozen Git object despite later worktree edits.

The overlay contains source bytes, not RPM installation metadata. The final package builder must retain existing file ownership, modes, config(noreplace), and vendor lifecycle rules, add metadata for new files, include the independently verified Python dependency/CBC payload, and run this verifier against the final unpacked RPM using the final combined commit. Never copy this overlay over a running installation.

This proves source payload completeness only. It does not establish a signed package, dependency installation, native controller operation, migration, reserve admission, or production readiness.
