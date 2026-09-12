# P1 native OneKS profile

`src/oneks/specs/{controlplanes,nodegroups}/layersentry-poc` is an operator-selected
POC profile for OpenNebula 7.4.1. Install it in the native OneKS specification
location (`$ONE_LOCATION/var/oneks` or `/var/lib/one/oneks`). The existing general
profiles remain unchanged.

The profile uses an explicit Rocky image ID and local system datastore ID,
CAPONE's existing native VRouter replica count of two, both TCP listeners, and a
native VM group with role `endpoints` and `POLICY=ANTI_AFFINED`. It registers RKE2
nodes through the control-plane endpoint. Provider IDs are derived from each
VM's own OpenNebula context. It does not install the external OpenNebula CCM.

Operator inputs: `node_image_id`, `router_image_id`, `router_vmgroup_id`,
`system_datastore_id`; workers also require `count`. The single control plane
uses 6 vCPUs / 8 GiB; each small worker uses 2 vCPUs / 4 GiB. The seed image must
have `ONEKS_APPLIANCE_ID=layersentry-p1-seed-v7` and a matching native VM template.
Use a 6-vCPU / 8-GiB seed in this nested POC. Set `appliance_auto_import: false`
when supplying this manually qualified image.

Set seed context `ONEAPP_ONEKS_READY_TIMEOUT_SECONDS=3600` for this nested lab.
Set `ONEAPP_ONEKS_LEADER_ELECTION_GRACE=YES` to tolerate the observed nested API latency
while retaining provider leader election.
Singleton control planes omit automatic MachineHealthCheck deletion: removing
their only etcd member cannot preserve the cluster. Multi-node control planes
and workers retain health checks with a 60-minute initial startup allowance.
Node bootstrap preloads the hash-verified core and Canal images for the exact
RKE2 release before starting RKE2.

Native OneKS requires TPROXY services 5030 and 2633, and OpenNebula monitoring
requires port 4124 over both TCP and UDP. The scoped administrator
helper `enable-oneks-poc-endpoints.sh` enables those frontend ports for
10.10.10.22/32 and 10.10.10.23/32 while preserving firewalld. It does not recreate
bridges, datastores, host registrations or POC-LAN. Save the existing networking
configuration before adding the documented TPROXY entries and use `onehost sync`
to propagate them.

On the dedicated POC OneKS service, set `kubectl_path` to
`/usr/local/libexec/oneks/kubectl`. The control-plane profile creates a root-owned
wrapper that executes only the installed RKE2 kubectl. Use a bounded `k8s_timeout: 120`
for native command completion on this nested lab. Rocky SELinux stays
enforcing; the wrapper uses the supported `virt_qemu_ga_unconfined_exec_t`
transition with `virt_qemu_ga_run_unconfined` enabled. RKE2 runtime labels are
preserved. This is needed because the confined guest agent cannot traverse and
execute the container runtime path directly. See
https://bugzilla.redhat.com/show_bug.cgi?id=2093355.

Run `ruby -rload_opennebula_paths src/oneks/test/layersentry_profile_test.rb` with
the OpenNebula Ruby dependencies. Successful rendering/admission is SOURCE
validation; only actual RKE2 nodes, networking, endpoint failure and reconciliation
tests can establish LIVE_VERIFIED. Two compute hosts do not prove production HA.

The nested POC profile sets `runtimeRequestTimeout: 30m` through the supported RKE2 kubelet configuration drop-in. Both the default two-minute and a ten-minute container creation deadline cancelled Canal layer extraction on this lab; memory and disk remained healthy. The selected thirty-minute bound allowed the observed twenty-two-minute Canal extraction to complete. This is a POC startup allowance, not a replacement for capacity sizing. See https://docs.rke2.io/install/configuration.

For this Canal profile the seed template sets `ONEAPP_ONEKS_CNI_DAEMONSET=rke2-canal`. OneKS waits for both workload Node Ready and that CNI DaemonSet rollout before installing provider webhooks. Other native profiles retain the empty selector default.

The minimal POC omits packaged ingress, metrics and CSI snapshot add-ons. Canal and CoreDNS stay enabled. Canal uses bounded startup/liveness grace through the supported HelmChartConfig values; health checks remain enabled. The core airgap archive sorts before Canal to reduce concurrent image extraction during bootstrap.

RKE2 airgap import caching (`images/.cache.json`) is enabled before first start so unchanged, verified archives are not re-imported on node reboot. Do not prune required cached images without forcing a documented re-import. This reduces repeated import work; it does not guarantee the worker recovery deadline.

The profile normalizes verified archive mtimes to whole seconds before first import.
The upstream cache serializes `metav1.Time` at second precision but compares with
`file.ModTime().After(...)`; fractional mtimes caused a full unchanged re-import
on the measured reboot. Archive content and hashes are unchanged. See
https://github.com/k3s-io/k3s/blob/master/pkg/agent/containerd/watcher.go.

For the dedicated slow POC service, use `expire_delta: 14400` so native signed
operation tokens outlive the bounded bootstrap/recovery window. The default
one-hour token expired inside the seed observer while native CAPI work continued.
This is a lab setting, not a production token-lifetime recommendation; production
long-running operations need credential renewal rather than indefinite tokens.

The POC control-plane profile retains leader election and uses a 60-second lease,
40-second renewal deadline and 10-second retry for the scheduler and both native
controller managers. All three lost their default lease under measured nested
CPU contention while provider images initialized. This is scoped POC grace, with
slower leader failover; it does not certify production availability. The supported
RKE2 component arguments are documented at https://docs.rke2.io/reference/server_config.

The measured hard-poweroff worker test retained the same VM and Kubernetes Node
identity, but automatic recovery exceeded fourteen minutes while supervisor
certificate requests hit the native ten-second client deadline. Recovery required
bounded operator maintenance: preserve the Machine with the documented temporary
skip-remediation annotation, briefly prioritize the RKE2 server process, and restart
the stalled agent once. All temporary controller/priority/annotation changes were
restored. This is evidence of operator-assisted rejoin, not unattended repair or
compromised-node recovery. Additional hardware and a fresh automatic recovery test
are required before claiming an automatic recovery SLA. Never rejoin a known
compromised node without separate quarantine and credential assessment.
