# frozen_string_literal: true

require 'json'
require 'shellwords'

module OneKS

    # Read-only Kubernetes runtime truth used by LayerSentry status/reconciliation.
    # OneKS/CAPI/CAPONE remain lifecycle owners; this class only observes them.
    class LifecycleStatus

        COMP = 'LST'
        ETCD_NAMESPACE = 'kube-system'
        ETCD_LABEL = 'component=etcd'
        ETCD_CERT_DIR = '/var/lib/rancher/rke2/server/tls/etcd'
        AUTOSCALER_LABEL = 'app.kubernetes.io/name=cluster-autoscaler'

        class << self

            def snapshot(cluster)
                cp = control_plane(cluster)
                return cp if OpenNebula.is_error?(cp)

                bootstrap = bootstrap_status(cp)
                leader = cluster.leader
                if OpenNebula.is_error?(leader)
                    return partial_snapshot(cluster, cp, bootstrap, leader.message)
                end

                nodes = kubectl_json(cluster, ['get', 'nodes', '-o', 'json'])
                if OpenNebula.is_error?(nodes)
                    return partial_snapshot(cluster, cp, bootstrap, nodes.message)
                end

                node_rows = Array(nodes['items']).filter_map {|node| node_status(node) }
                cp_status = group_status(
                    cluster, cp, node_rows, 'rke2controlplane', cluster.uuid
                )
                return cp_status if OpenNebula.is_error?(cp_status)

                etcd = etcd_membership(cluster)
                if OpenNebula.is_error?(etcd)
                    etcd = { :verified => false, :members => nil, :error => etcd.message }
                end
                cp_status[:etcd] = etcd

                worker_groups = Array(cluster.node_groups).map do |ref|
                    group = NodeGroup.new_from_id(cluster.client, ref[:id], :raw => true)
                    return group if OpenNebula.is_error?(group)

                    status = group_status(
                        cluster, group, node_rows, 'machinedeployment', group.uuid
                    )
                    return status if OpenNebula.is_error?(status)

                    status
                end

                autoscaler = cluster_autoscaler_status(cluster)
                if OpenNebula.is_error?(autoscaler)
                    autoscaler = {
                        :observed => false,
                        :ready => false,
                        :error => autoscaler.message
                    }
                end

                workers = aggregate(worker_groups)

                {
                    :cluster_id => cluster.id,
                    :cluster_name => cluster.name,
                    :kubernetes_version => cluster.kubernetes_version,
                    :control_plane => cp_status,
                    :workers => workers.merge(:groups => worker_groups),
                    :nodes => node_rows,
                    :bootstrap => bootstrap,
                    :autoscaler_controller => autoscaler,
                    :runtime_observable => true
                }
            rescue StandardError => e
                OpenNebula::Error.new(
                    "Unable to inspect Kubernetes runtime state: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            def partial_snapshot(cluster, cp, bootstrap, error)
                worker_groups = Array(cluster.node_groups).map do |ref|
                    group = NodeGroup.new_from_id(cluster.client, ref[:id], :raw => true)
                    return group if OpenNebula.is_error?(group)

                    base_group_status(group)
                end

                {
                    :cluster_id => cluster.id,
                    :cluster_name => cluster.name,
                    :kubernetes_version => cluster.kubernetes_version,
                    :control_plane => base_group_status(cp).merge(
                        :etcd => { :verified => false, :members => nil }
                    ),
                    :workers => aggregate(worker_groups).merge(:groups => worker_groups),
                    :nodes => [],
                    :bootstrap => bootstrap,
                    :autoscaler_controller => {
                        :observed => false,
                        :ready => false,
                        :error => 'Kubernetes runtime unavailable'
                    },
                    :runtime_observable => false,
                    :runtime_error => error
                }
            end

            def base_group_status(group)
                result = {
                    :group_id => group.id,
                    :uuid => group.uuid,
                    :desired => Integer(group.user_inputs_values[:count] || 0),
                    :created => Array(group.vms).length,
                    :joined => 0,
                    :ready => 0,
                    :vm_ids => Array(group.vms).map(&:to_i),
                    :node_names => [],
                    :kubernetes_versions => [],
                    :conditions => []
                }
                enrich_group_config(result, group)
            rescue ArgumentError, TypeError
                result = {
                    :group_id => group.id,
                    :uuid => group.uuid,
                    :desired => 0,
                    :created => Array(group.vms).length,
                    :joined => 0,
                    :ready => 0,
                    :vm_ids => Array(group.vms).map(&:to_i),
                    :node_names => [],
                    :kubernetes_versions => [],
                    :conditions => []
                }
                enrich_group_config(result, group)
            end

            def control_plane(cluster)
                return OpenNebula::Error.new(
                    'Control plane group not found', OpenNebula::Error::EACTION
                ) unless cluster.control_plane

                ControlPlane.new_from_id(
                    cluster.client, cluster.control_plane[:id], :raw => true
                )
            end

            def group_status(cluster, group, nodes, kind, resource_name)
                resource = kubectl_json(
                    cluster, ['get', kind, resource_name, '-o', 'json']
                )
                return resource if OpenNebula.is_error?(resource)

                vm_ids = Array(group.vms).map(&:to_i)
                joined_nodes = nodes.select {|node| vm_ids.include?(node[:vm_id]) }
                ready_nodes = joined_nodes.select {|node| node[:ready] }
                status = resource['status'] || {}
                spec = resource['spec'] || {}
                metadata = resource['metadata'] || {}
                annotations = metadata['annotations'] || {}
                provider_updated = status['updatedReplicas'] || status['upToDateReplicas']

                result = {
                    :group_id => group.id,
                    :uuid => group.uuid,
                    :desired => Integer(
                        group.user_inputs_values[:count] || spec['replicas'] || 0
                    ),
                    :provider_desired => integer_or_nil(spec['replicas']),
                    :provider_replicas => integer_or_nil(status['replicas']),
                    :provider_ready => integer_or_nil(status['readyReplicas']),
                    :provider_available => integer_or_nil(status['availableReplicas']),
                    :provider_updated => integer_or_nil(provider_updated),
                    :provider_generation => integer_or_nil(metadata['generation']),
                    :provider_observed_generation => integer_or_nil(
                        status['observedGeneration']
                    ),
                    :created => vm_ids.length,
                    :joined => joined_nodes.length,
                    :ready => ready_nodes.length,
                    :vm_ids => vm_ids,
                    :node_names => joined_nodes.map {|node| node[:name] },
                    :kubernetes_versions => joined_nodes.map do |node|
                        node[:kubelet_version]
                    end.compact.uniq.sort,
                    :shape_revision => spec.dig(
                        'template', 'metadata', 'annotations', K8s::SHAPE_REVISION
                    ),
                    :storage_revision => spec.dig(
                        'template', 'metadata', 'annotations', K8s::STORAGE_REVISION
                    ),
                    :autoscaling_runtime => autoscaling_from_annotations(annotations),
                    :conditions => normalized_conditions(status['conditions'])
                }
                enrich_group_config(result, group)
            end

            def enrich_group_config(result, group)
                return result unless group.is_a?(NodeGroup)

                values = group.user_inputs_values || {}
                result[:shape] = {
                    :cpu => integer_or_nil(values[:cpu]),
                    :vcpu => integer_or_nil(values[:vcpu]),
                    :memory => integer_or_nil(values[:memory]),
                    :disk_size => integer_or_nil(values[:disk_size])
                }
                result[:shape_revision_desired] = group.body[:shape_revision]
                result[:autoscaling] = group.body[:autoscaling] || {
                    :enabled => false
                }
                policy = group.body[:disk_autoscaling] || { :enabled => false }
                result[:disk_autoscaling] = policy
                result[:storage_revision_desired] = group.body[:storage_revision]
                if policy[:enabled]
                    result[:disk_runtime] = {
                        :nodes => Array(group.vms).map do |vm_id|
                            status = WorkerDiskManager.vm_status(group.client, vm_id, policy)
                            if OpenNebula.is_error?(status)
                                { :vm_id => vm_id.to_i, :error => status.message }
                            else
                                status
                            end
                        end
                    }
                end
                result
            end

            def aggregate(groups)
                keys = [
                    :desired,
                    :provider_desired,
                    :provider_replicas,
                    :provider_ready,
                    :provider_available,
                    :provider_updated,
                    :created,
                    :joined,
                    :ready
                ]
                keys.to_h do |key|
                    values = groups.map {|group| group[key] }
                    if key.to_s.start_with?('provider_') && values.any?(&:nil?)
                        [key, nil]
                    else
                        [key, values.compact.sum]
                    end
                end.compact
            end

            def bootstrap_status(cp)
                dep = K8sGroup.find_dep_by_name(cp, 'SeedVM')
                opts = dep&.opts || {}
                state = opts[:last_state] || opts['last_state']
                heartbeat = opts[:last_heartbeat_at] || opts['last_heartbeat_at']
                started = opts[:bootstrap_started_at] || opts['bootstrap_started_at']
                timed_out = opts[:timed_out] || opts['timed_out'] || false
                error = opts[:last_error] || opts['last_error']

                {
                    :state => state || (dep&.ready? ? 'RUNNING' : 'UNKNOWN'),
                    :started_at => started,
                    :last_heartbeat_at => heartbeat,
                    :timed_out => timed_out == true,
                    :error => error
                }
            end

            def node_status(node)
                provider_id = node.dig('spec', 'providerID').to_s
                match = provider_id.match(%r{\Aone://(\d+)\z})
                return unless match

                conditions = Array(node.dig('status', 'conditions'))
                ready = conditions.find {|condition| condition['type'] == 'Ready' }
                labels = node.dig('metadata', 'labels') || {}

                {
                    :vm_id => match[1].to_i,
                    :name => node.dig('metadata', 'name'),
                    :provider_id => provider_id,
                    :ready => ready && ready['status'] == 'True',
                    :ready_reason => ready && ready['reason'],
                    :ready_transition_at => ready && ready['lastTransitionTime'],
                    :kubelet_version => node.dig('status', 'nodeInfo', 'kubeletVersion'),
                    :control_plane => labels.key?('node-role.kubernetes.io/control-plane'),
                    :etcd => labels.key?('node-role.kubernetes.io/etcd')
                }
            end

            def etcd_membership(cluster)
                pods = kubectl_json(
                    cluster,
                    ['get', 'pods', '-n', ETCD_NAMESPACE, '-l', ETCD_LABEL, '-o', 'json']
                )
                return pods if OpenNebula.is_error?(pods)

                pod = Array(pods['items']).find do |item|
                    Array(item.dig('status', 'containerStatuses')).any? do |status|
                        status['name'] == 'etcd' && status['ready'] == true
                    end
                end
                return OpenNebula::Error.new(
                    'No ready RKE2 etcd pod is available for membership verification',
                    OpenNebula::Error::EACTION
                ) unless pod

                pod_name = pod.dig('metadata', 'name').to_s
                args = [
                    'exec', '-n', ETCD_NAMESPACE, pod_name, '-c', 'etcd', '--',
                    'etcdctl', '--endpoints=https://127.0.0.1:2379',
                    "--cacert=#{ETCD_CERT_DIR}/server-ca.crt",
                    "--cert=#{ETCD_CERT_DIR}/server-client.crt",
                    "--key=#{ETCD_CERT_DIR}/server-client.key",
                    'member', 'list', '-w', 'json'
                ]
                result = kubectl_json(cluster, args)
                return result if OpenNebula.is_error?(result)

                members = Array(result['members'])
                {
                    :verified => true,
                    :members => members.length,
                    :names => members.map {|member| member['name'] }.compact.sort,
                    :learner_members => members.count {|member| member['isLearner'] == true }
                }
            end

            def cluster_autoscaler_status(cluster)
                pods = kubectl_json(
                    cluster,
                    ['get', 'pods', '-A', '-l', AUTOSCALER_LABEL, '-o', 'json']
                )
                return pods if OpenNebula.is_error?(pods)

                items = Array(pods['items'])
                ready = items.count do |item|
                    statuses = Array(item.dig('status', 'containerStatuses'))
                    item.dig('status', 'phase') == 'Running' &&
                        !statuses.empty? && statuses.all? {|status| status['ready'] == true }
                end

                {
                    :observed => !items.empty?,
                    :ready => ready.positive?,
                    :pods => items.length,
                    :ready_pods => ready
                }
            end

            def kubectl_json(cluster, args)
                leader = cluster.leader
                return leader if OpenNebula.is_error?(leader)

                command = ([K8s::KUBECTL_PATH, '--kubeconfig', K8s::KUBECONFIG_PATH] + args)
                          .map {|arg| Shellwords.escape(arg.to_s) }.join(' ')
                rc = OneHelper::VirtualMachine.exec(
                    cluster.client,
                    leader,
                    command,
                    :timeout => [K8s::K8S_TIMEOUT.to_i, 30].max
                )
                return rc if OpenNebula.is_error?(rc)

                stdout = rc[:stdout].to_s
                return OpenNebula::Error.new(
                    "Kubernetes command returned empty output: #{args.first(3).join(' ')}",
                    OpenNebula::Error::EACTION
                ) if stdout.strip.empty?

                JSON.parse(stdout)
            rescue JSON::ParserError => e
                OpenNebula::Error.new(
                    "Kubernetes command returned invalid JSON: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            rescue StandardError => e
                OpenNebula::Error.new(
                    "Kubernetes runtime query failed: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            def autoscaling_from_annotations(annotations)
                min = annotations[K8s::AUTOSCALER_MIN]
                max = annotations[K8s::AUTOSCALER_MAX]
                return { :enabled => false } if min.nil? || max.nil?

                {
                    :enabled => true,
                    :min => integer_or_nil(min),
                    :max => integer_or_nil(max)
                }
            end

            def integer_or_nil(value)
                return if value.nil?

                Integer(value)
            rescue ArgumentError, TypeError
                nil
            end

            def normalized_conditions(conditions)
                Array(conditions).map do |condition|
                    {
                        :type => condition['type'],
                        :status => condition['status'],
                        :reason => condition['reason'],
                        :last_transition_at => condition['lastTransitionTime']
                    }.compact
                end
            end

        end

    end

end
