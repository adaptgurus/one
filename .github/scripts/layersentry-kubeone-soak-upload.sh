#!/usr/bin/env bash
set -euo pipefail

evidence_dir=${SOAK_OUTPUT_DIR:?SOAK_OUTPUT_DIR is required}
deploy_key=/var/lib/layersentry/credentials/codexagentlogic-soak-deploy
known_hosts=/var/lib/layersentry/credentials/github-known-hosts
repo=git@github.com:adaptgurus/codexagentlogic.git
branch=evidence/kubeone-soak-20h-20260928
target=evidence/smart-installer/20260928/kubeone-20h-soak-live-20260928-01

[[ ${evidence_dir} == /var/lib/layersentry/evidence/* ]]
[[ -s ${evidence_dir}/samples.csv && -s ${evidence_dir}/events.log && -s ${evidence_dir}/SUMMARY.env ]]
source "${evidence_dir}/SUMMARY.env"
[[ ${SOAK_RESULT} == PASS || ${SOAK_RESULT} == FAIL ]]
[[ -s ${deploy_key} && -s ${known_hosts} ]]
if grep -REiq 'BEGIN (RSA|OPENSSH|EC|PRIVATE)|client-key-data|certificate-authority-data|password[[:space:]]*[:=]|token[[:space:]]*[:=]' "${evidence_dir}/samples.csv" "${evidence_dir}/events.log" "${evidence_dir}/SUMMARY.env" "${evidence_dir}/raw"; then
  echo 'refusing to upload possible credential material' >&2
  exit 70
fi

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export GIT_SSH_COMMAND="ssh -i ${deploy_key} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts}"
git clone --depth 1 "${repo}" "${work}/repo"
git -C "${work}/repo" checkout -b "${branch}"
mkdir -p "${work}/repo/${target}"
install -m 0644 "${evidence_dir}/samples.csv" "${work}/repo/${target}/samples.csv"
install -m 0644 "${evidence_dir}/events.log" "${work}/repo/${target}/events.log"
install -m 0644 "${evidence_dir}/SUMMARY.env" "${work}/repo/${target}/SUMMARY.env"
cp -a "${evidence_dir}/raw" "${work}/repo/${target}/raw"
(
  cd "${work}/repo/${target}"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS
)
git -C "${work}/repo" config user.name 'LayerSentry Evidence Bot'
git -C "${work}/repo" config user.email 'layersentry-evidence@adaptgurus.local'
git -C "${work}/repo" add "${target}"
git -C "${work}/repo" commit -m "evidence(kubeone): upload 20-hour soak logs (${SOAK_RESULT})"
git -C "${work}/repo" push origin "HEAD:refs/heads/${branch}"
echo "GITHUB_EVIDENCE_BRANCH=${branch}" >>"${evidence_dir}/SUMMARY.env"
echo "GITHUB_EVIDENCE_PATH=${target}" >>"${evidence_dir}/SUMMARY.env"
