#!/bin/bash -e

# LayerSentry OneDRS production source contract.
# Keep this before the repository-wide RuboCop smoke step so OneDRS-specific
# evidence remains visible even when unrelated Ruby lint debt exists.

python3 src/schedm_mad/remotes/one_drs/tests/test_production_source_contract.py
python3 -m compileall -q src/schedm_mad/remotes/one_drs
