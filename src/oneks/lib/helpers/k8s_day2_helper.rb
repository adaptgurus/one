# frozen_string_literal: true

require 'json'
require 'shellwords'

module OneKS
  module K8s
    class << self
      AUTOSCALER_MIN = 'cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size'
      AUTOSCALER_MAX = 'cluster.x-k8s.io/cluster-api-autoscaler-node-group-max-size'
      AUTOSCALER_CPU = 'capacity.cluster-autoscaler.kubernetes.io/cpu'
      AUTOSCALER_MEMORY = 'capacity.cluster-autoscaler.kubernetes.io/memory'
      SHAPE_REVISION = 'layersentry.io/shape-revision'

      # Keep control-plane remediation policy synchronized with replica count.
      # CAPRKE2 remains the control-plane owner; this only applies/removes the
      # CAPI MachineHealthCheck rendered by the existing OneKS profile.
      def reconcile_control_plane_health(client, leader, spec, cluster_uuid, target)
        return OpenNebula::Error.new(
          'Invalid control-plane health reconciliation arguments',
          OpenNebula::Error::EACTION
        ) if leader.nil? || cluster_uuid.to_s.empty?

        target = Integer(target)
        if target > 1
          docs = YAML.load_stream(spec)
          mhc = docs.find { |doc| doc && doc['kind'] == 'MachineHealthCheck' }
          return OpenNebula::Error.new(
            'Control-plane MachineHealthCheck missing for multi-replica target',
            OpenNebula::Error::EACTION
          ) unless mhc

          return apply(client, leader, mhc.to_yaml)
        end

        name = "#{cluster_uuid}-cp-mhc"
        command = [
          KUBECTL_PATH, '--kubeconfig', KUBECONFIG_PATH,
          'delete', 'machinehealthcheck', name, '--ignore-not-found=true'
        ].map { |arg| Shellwords.escape(arg.to_s) }.join(' ')
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

      # Configure a MachineDeployment for the upstream Cluster API cloud
      # provider. This only marks the group as autoscaler-managed; deployment of
      # the Cluster Autoscaler itself remains an explicit add-on operation.
      def configure_nodegroup_autoscaling(client, leader, group_uuid, enabled:, min:, max:, cpu:, memory:)
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
      rescue ArgumentError, TypeError
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
        ].map { |arg| Shellwords.escape(arg.to_s) }.join(' ')
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
