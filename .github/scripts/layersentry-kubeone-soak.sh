#!/usr/bin/env bash
set -euo pipefail

duration_seconds=${SOAK_DURATION_SECONDS:-72000}
interval_seconds=${SOAK_INTERVAL_SECONDS:-60}
output_dir=${SOAK_OUTPUT_DIR:?SOAK_OUTPUT_DIR is required}
kubectl_bin=${KUBECTL_BIN:-/usr/local/bin/kubectl}
cluster_b_kubeconfig=${CLUSTER_B_KUBECONFIG:-/var/lib/layersentry/kubeone/lab/cluster-b/kubeconfig}
ssh_key=${KUBEONE_SSH_KEY:-/var/lib/one/.ssh/id_rsa}
ssh_known_hosts=${KUBEONE_SSH_KNOWN_HOSTS:-/var/lib/one/.ssh/known_hosts}
clusters_raw=${SOAK_CLUSTERS:-b}
read -r -a clusters <<<"${clusters_raw}"

[[ ${duration_seconds} =~ ^[0-9]+$ ]] && (( duration_seconds >= 120 ))
[[ ${interval_seconds} =~ ^[0-9]+$ ]] && (( interval_seconds >= 10 ))
[[ ${output_dir} == /var/lib/layersentry/evidence/* ]]
[[ -x ${kubectl_bin} && ${#clusters[@]} -ge 1 ]]
for cluster in "${clusters[@]}"; do
  [[ ${cluster} == a || ${cluster} == b || ${cluster} == c ]]
done
[[ " ${clusters[*]} " != *" b "* ]] || [[ -s ${cluster_b_kubeconfig} ]]
if [[ " ${clusters[*]} " == *" a "* || " ${clusters[*]} " == *" c "* ]]; then
  [[ -s ${ssh_key} && -s ${ssh_known_hosts} ]]
fi
mkdir -p "${output_dir}"
chmod 0700 "${output_dir}"
available_kib=$(df -Pk "${output_dir}" | awk 'NR==2 {print $4}')
(( available_kib >= 1048576 ))

samples=${output_dir}/samples.csv
events=${output_dir}/events.log
summary=${output_dir}/SUMMARY.env
raw_dir=${output_dir}/raw
mkdir -p "${raw_dir}"
printf '%s\n' 'timestamp,elapsed_seconds,cluster,ready_nodes,total_nodes,kube_system_nonready,total_restarts,baseline_restarts,restart_delta,api_ready,result' >"${samples}"
: >"${events}"

ssh_opts=(-i "${ssh_key}" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=${ssh_known_hosts}" -o ConnectTimeout=5)
kube() {
  local cluster=$1
  shift
  case "${cluster}" in
    a) ssh "${ssh_opts[@]}" root@10.50.10.102 -- kubectl --kubeconfig /etc/kubernetes/admin.conf "$@" ;;
    b) "${kubectl_bin}" --kubeconfig "${cluster_b_kubeconfig}" "$@" ;;
    c) ssh "${ssh_opts[@]}" root@10.50.10.121 -- kubectl --kubeconfig /etc/kubernetes/admin.conf "$@" ;;
    *) return 64 ;;
  esac
}

declare -A baseline_restarts
for cluster in "${clusters[@]}"; do
  nodes=$(kube "${cluster}" --request-timeout=20s get nodes --no-headers)
  pods=$(kube "${cluster}" --request-timeout=20s -n kube-system get pods --no-headers)
  [[ -n ${nodes} && -n ${pods} ]]
  baseline_restarts[${cluster}]=$(awk '{sum += $4} END {print sum+0}' <<<"${pods}")
done

start_epoch=$(date +%s)
end_epoch=$((start_epoch + duration_seconds))
samples_total=0
failures_total=0
printf '%s SOAK_START duration_seconds=%s interval_seconds=%s available_kib=%s\n' "$(date -Is)" "${duration_seconds}" "${interval_seconds}" "${available_kib}" >>"${events}"
for cluster in "${clusters[@]}"; do
  printf '%s BASELINE cluster=%s restarts=%s\n' "$(date -Is)" "${cluster}" "${baseline_restarts[${cluster}]}" >>"${events}"
done

on_signal() {
  printf '%s SOAK_ABORTED signal=%s samples=%s failures=%s\n' "$(date -Is)" "$1" "${samples_total}" "${failures_total}" >>"${events}"
  exit 130
}
trap 'on_signal TERM' TERM
trap 'on_signal INT' INT

while :; do
  now_epoch=$(date +%s)
  elapsed=$((now_epoch - start_epoch))
  timestamp=$(date -Is)
  for cluster in "${clusters[@]}"; do
    ready_nodes=0; total_nodes=0; nonready=999; restarts=0; api_ready=0; result=FAIL
    node_output=$(kube "${cluster}" --request-timeout=20s get nodes --no-headers 2>/dev/null || true)
    pod_output=$(kube "${cluster}" --request-timeout=20s -n kube-system get pods --no-headers 2>/dev/null || true)
    readyz=$(kube "${cluster}" --request-timeout=20s get --raw=/readyz 2>/dev/null || true)
    event_output=$(kube "${cluster}" --request-timeout=20s get events -A --sort-by=.lastTimestamp 2>/dev/null || true)
    {
      printf '\n===== %s elapsed=%s =====\n' "${timestamp}" "${elapsed}"
      printf '%s\n' "${node_output}"
    } >>"${raw_dir}/cluster-${cluster}-nodes.log"
    {
      printf '\n===== %s elapsed=%s =====\n' "${timestamp}" "${elapsed}"
      printf '%s\n' "${pod_output}"
    } >>"${raw_dir}/cluster-${cluster}-kube-system-pods.log"
    {
      printf '\n===== %s elapsed=%s =====\n' "${timestamp}" "${elapsed}"
      printf '%s\n' "${readyz}"
    } >>"${raw_dir}/cluster-${cluster}-readyz.log"
    {
      printf '\n===== %s elapsed=%s =====\n' "${timestamp}" "${elapsed}"
      printf '%s\n' "${event_output}"
    } >>"${raw_dir}/cluster-${cluster}-events.log"
    if [[ -n ${node_output} ]]; then
      total_nodes=$(awk 'END {print NR+0}' <<<"${node_output}")
      ready_nodes=$(awk '$2 == "Ready" {n++} END {print n+0}' <<<"${node_output}")
    fi
    if [[ -n ${pod_output} ]]; then
      nonready=$(awk '$3 != "Running" && $3 != "Completed" {n++; next} {split($2,a,"/"); if ($3=="Running" && a[1] != a[2]) n++} END {print n+0}' <<<"${pod_output}")
      restarts=$(awk '{sum += $4} END {print sum+0}' <<<"${pod_output}")
    fi
    [[ ${readyz} == ok ]] && api_ready=1
    delta=$((restarts - baseline_restarts[${cluster}]))
    if (( total_nodes >= 5 && ready_nodes == total_nodes && nonready == 0 && api_ready == 1 && delta == 0 )); then
      result=PASS
    else
      failures_total=$((failures_total + 1))
      printf '%s SAMPLE_FAIL cluster=%s ready=%s/%s kube_system_nonready=%s restart_delta=%s api_ready=%s\n' "${timestamp}" "${cluster}" "${ready_nodes}" "${total_nodes}" "${nonready}" "${delta}" "${api_ready}" >>"${events}"
    fi
    printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' "${timestamp}" "${elapsed}" "${cluster}" "${ready_nodes}" "${total_nodes}" "${nonready}" "${restarts}" "${baseline_restarts[${cluster}]}" "${delta}" "${api_ready}" "${result}" >>"${samples}"
    samples_total=$((samples_total + 1))
  done
  (( now_epoch >= end_epoch )) && break
  sleep_for=${interval_seconds}
  (( now_epoch + sleep_for > end_epoch )) && sleep_for=$((end_epoch - now_epoch))
  (( sleep_for > 0 )) && sleep "${sleep_for}"
done

printf '%s SOAK_COMPLETE samples=%s failures=%s\n' "$(date -Is)" "${samples_total}" "${failures_total}" >>"${events}"
{
  echo "SOAK_DURATION_SECONDS=${duration_seconds}"
  echo "SOAK_INTERVAL_SECONDS=${interval_seconds}"
  echo "SOAK_CLUSTERS=${clusters[*]}"
  echo "SOAK_SAMPLES=${samples_total}"
  echo "SOAK_FAILURES=${failures_total}"
  echo "SOAK_RESULT=$([[ ${failures_total} -eq 0 ]] && echo PASS || echo FAIL)"
} >"${summary}"
(( failures_total == 0 ))
