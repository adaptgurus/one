# frozen_string_literal: true

require 'shellwords'

module OneKS
  module K8s
    class << self
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
    end
  end
end
