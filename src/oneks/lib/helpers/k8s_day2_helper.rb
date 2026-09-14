# frozen_string_literal: true

require 'json'
require 'shellwords'

module OneKS

    # Day-2 Kubernetes mutations delegated to existing CAPI/CAPRKE2 resources.
    module K8s

        CLUSTER_AUTOSCALER_DEFAULTS = {
            :chart => 'cluster-autoscaler',
            :chart_repo => 'https://kubernetes.github.io/autoscaler',
            :chart_version => '9.59.0',
            :image_repository => 'registry.k8s.io/autoscaling/cluster-autoscaler',
            :image_tags => { '1.36' => 'v1.36.1' }
        }.freeze

        AUTOSCALER_MIN = 'cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size'
        AUTOSCALER_MAX = 'cluster.x-k8s.io/cluster-api-autoscaler-node-group-max-size'
        AUTOSCALER_CPU = 'capacity.cluster-autoscaler.kubernetes.io/cpu'
        AUTOSCALER_MEMORY = 'capacity.cluster-autoscaler.kubernetes.io/memory'
        SHAPE_REVISION = 'layersentry.io/shape-revision'
        STORAGE_REVISION = 'layersentry.io/storage-revision'

        class << self

            # Keep control-plane remediation policy synchronized with replica count.
            # CAPRKE2 remains the control-plane owner; automatic remediation is only
            # enabled once the etcd control plane has at least three members.
            def reconcile_control_plane_health(client, leader, spec, cluster_uuid, target)
                return OpenNebula::Error.new(
                    'Invalid control-plane health reconciliation arguments',
                    OpenNebula::Error::EACTION
                ) if leader.nil? || cluster_uuid.to_s.empty?

                target = Integer(target)
                if target >= 3
                    docs = YAML.load_stream(spec)
                    mhc = docs.find {|doc| doc && doc['kind'] == 'MachineHealthCheck' }
                    return OpenNebula::Error.new(
                        'Control-plane MachineHealthCheck missing for HA target',
                        OpenNebula::Error::EACTION
                    ) unless mhc

                    return apply(client, leader, mhc.to_yaml)
                end

                name = "#{cluster_uuid}-cp-mhc"
                command = [
                    KUBECTL_PATH, '--kubeconfig', KUBECONFIG_PATH,
                    'delete', 'machinehealthcheck', name, '--ignore-not-found=true'
                ].map {|arg| Shellwords.escape(arg.to_s) }.join(' ')
                rc = OneHelper::VirtualMachine.exec(
                    client, leader, command, :timeout => K8S_TIMEOUT
                )
                return rc if OpenNebula.is_error?(rc)

                true
            rescue ArgumentError, TypeError
                OpenNebula::Error.new(
                    'Control-plane target must be an integer', OpenNebula::Error::EACTION
                )
            rescue StandardError => e
                OpenNebula::Error.new(
                    "Control-plane health reconciliation failed: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            # A deterministic template annotation forces MachineDeployment to perform
            # a normal CAPI rolling replacement after its OpenNebula VM template is
            # updated. The rollout strategy in the profile keeps maxUnavailable=0.
            def rollout_nodegroup_shape(client, leader, group_uuid, revision)
                patch_machine_deployment(
                    client,
                    leader,
                    group_uuid,
                    {
                        'spec' => {
                            'template' => {
                                'metadata' => {
                                    'annotations' => { SHAPE_REVISION => revision.to_s }
                                }
                            }
                        }
                    }
                )
            end

            def rollout_nodegroup_storage(client, leader, group_uuid, revision)
                patch_machine_deployment(
                    client, leader, group_uuid,
                    {
                        'spec' => {
                            'template' => {
                                'metadata' => {
                                    'annotations' => { STORAGE_REVISION => revision.to_s }
                                }
                            }
                        }
                    }
                )
            end

            # Render the pinned RKE2 HelmChart used for the Cluster API autoscaler.
            # Each workload cluster gets its own controller and discovery selector,
            # keeping multi-cluster scaling decisions isolated by Cluster name.
            def cluster_autoscaler_manifest(cluster_uuid, kubernetes_version)
                uuid = cluster_uuid.to_s
                match = /\Av([0-9]+)\.([0-9]+)\.[0-9]+\z/.match(kubernetes_version.to_s)
                return OpenNebula::Error.new(
                    'Invalid Cluster Autoscaler cluster/version', OpenNebula::Error::EACTION
                ) if uuid.empty? || match.nil?

                override = SERVER_CONF[:cluster_autoscaler]
                override = {} unless override.is_a?(Hash)
                config = CLUSTER_AUTOSCALER_DEFAULTS.merge(override)
                config[:image_tags] = CLUSTER_AUTOSCALER_DEFAULTS[:image_tags].merge(
                    override[:image_tags].is_a?(Hash) ? override[:image_tags] : {}
                )

                minor = "#{match[1]}.#{match[2]}"
                tags = config[:image_tags]
                image_tag = tags[minor] || tags[minor.to_sym]
                required = [:chart, :chart_repo, :chart_version, :image_repository]
                return OpenNebula::Error.new(
                    "No pinned Cluster Autoscaler release for Kubernetes #{minor}",
                    OpenNebula::Error::EACTION
                ) if image_tag.to_s.empty? || required.any? {|key| config[key].to_s.empty? }

                values = {
                    'cloudProvider' => 'clusterapi',
                    'clusterAPIMode' => 'incluster-incluster',
                    'autoDiscovery' => { 'clusterName' => uuid },
                    'image' => {
                        'repository' => config[:image_repository].to_s,
                        'tag' => image_tag.to_s,
                        'pullPolicy' => 'IfNotPresent'
                    },
                    'rbac' => { 'create' => true, 'clusterScoped' => true },
                    'replicaCount' => 1,
                    'affinity' => {
                        'nodeAffinity' => {
                            'requiredDuringSchedulingIgnoredDuringExecution' => {
                                'nodeSelectorTerms' => [{
                                    'matchExpressions' => [{
                                        'key' => 'node-role.kubernetes.io/control-plane',
                                        'operator' => 'Exists'
                                    }]
                                }]
                            }
                        }
                    },
                    'tolerations' => [{
                        'key' => 'node-role.kubernetes.io/control-plane',
                        'operator' => 'Exists',
                        'effect' => 'NoSchedule'
                    }]
                }

                {
                    'apiVersion' => 'helm.cattle.io/v1',
                    'kind' => 'HelmChart',
                    'metadata' => {
                        'name' => 'layersentry-cluster-autoscaler',
                        'namespace' => 'kube-system'
                    },
                    'spec' => {
                        'chart' => config[:chart].to_s,
                        'repo' => config[:chart_repo].to_s,
                        'version' => config[:chart_version].to_s,
                        'targetNamespace' => 'kube-system',
                        'valuesContent' => values.to_yaml
                    }
                }.to_yaml
            rescue StandardError => e
                OpenNebula::Error.new(
                    "Cluster Autoscaler manifest generation failed: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            def ensure_cluster_autoscaler(client, leader, cluster_uuid, kubernetes_version)
                manifest = cluster_autoscaler_manifest(cluster_uuid, kubernetes_version)
                return manifest if OpenNebula.is_error?(manifest)

                apply(client, leader, manifest)
            end

            # Configure a MachineDeployment for the upstream Cluster API provider.
            # The controller itself is installed separately through the native OneKS
            # Helm add-on lifecycle before these bounds are published.
            def configure_nodegroup_autoscaling(client, leader, group_uuid, **options)
                enabled = options.fetch(:enabled)
                min = options.fetch(:min)
                max = options.fetch(:max)
                cpu = options.fetch(:cpu)
                memory = options.fetch(:memory)

                annotations = if enabled
                                  {
                                      AUTOSCALER_MIN => Integer(min).to_s,
                                      AUTOSCALER_MAX => Integer(max).to_s,
                                      AUTOSCALER_CPU => Integer(cpu).to_s,
                                      AUTOSCALER_MEMORY => "#{Integer(memory)}Mi"
                                  }
                              else
                                  {
                                      AUTOSCALER_MIN => nil,
                                      AUTOSCALER_MAX => nil,
                                      AUTOSCALER_CPU => nil,
                                      AUTOSCALER_MEMORY => nil
                                  }
                              end

                patch_machine_deployment(
                    client,
                    leader,
                    group_uuid,
                    { 'metadata' => { 'annotations' => annotations } }
                )
            rescue KeyError, ArgumentError, TypeError
                OpenNebula::Error.new(
                    'Autoscaling bounds/capacity must be integers', OpenNebula::Error::EACTION
                )
            end

            def patch_machine_deployment(client, leader, group_uuid, patch)
                return OpenNebula::Error.new(
                    'Invalid MachineDeployment patch arguments', OpenNebula::Error::EACTION
                ) if leader.nil? || group_uuid.to_s.empty?

                payload = JSON.generate(patch)
                command = [
                    KUBECTL_PATH,
                    '--kubeconfig', KUBECONFIG_PATH,
                    'patch', 'machinedeployment', group_uuid.to_s,
                    '--type=merge', '-p', payload
                ].map {|arg| Shellwords.escape(arg.to_s) }.join(' ')
                rc = OneHelper::VirtualMachine.exec(
                    client, leader, command, :timeout => K8S_TIMEOUT
                )
                return rc if OpenNebula.is_error?(rc)

                true
            rescue StandardError => e
                OpenNebula::Error.new(
                    "MachineDeployment patch failed: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

        end

    end

end
