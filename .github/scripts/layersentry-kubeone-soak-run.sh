#!/usr/bin/env bash
set -uo pipefail

evidence_dir=${SOAK_OUTPUT_DIR:?SOAK_OUTPUT_DIR is required}
monitor=/usr/local/libexec/layersentry/kubeone-soak.sh
uploader=/usr/local/libexec/layersentry/kubeone-soak-upload.sh

mkdir -p "${evidence_dir}"
chmod 0700 "${evidence_dir}"

"${monitor}"
monitor_rc=$?

if [[ ! -s ${evidence_dir}/SUMMARY.env ]]; then
  samples=0
  failures=1
  if [[ -s ${evidence_dir}/samples.csv ]]; then
    samples=$(awk 'END {print NR > 0 ? NR-1 : 0}' "${evidence_dir}/samples.csv")
    failures=$(awk -F, 'NR>1 && $11!="PASS" {n++} END {print n > 0 ? n : 1}' "${evidence_dir}/samples.csv")
  fi
  {
    echo "SOAK_DURATION_SECONDS=${SOAK_DURATION_SECONDS:-72000}"
    echo "SOAK_INTERVAL_SECONDS=${SOAK_INTERVAL_SECONDS:-60}"
    echo "SOAK_CLUSTERS=${SOAK_CLUSTERS:-b}"
    echo "SOAK_SAMPLES=${samples}"
    echo "SOAK_FAILURES=${failures}"
    echo 'SOAK_RESULT=FAIL'
    echo "SOAK_MONITOR_EXIT=${monitor_rc}"
  } >"${evidence_dir}/SUMMARY.env"
fi

"${uploader}"
upload_rc=$?
(( monitor_rc == 0 && upload_rc == 0 ))
