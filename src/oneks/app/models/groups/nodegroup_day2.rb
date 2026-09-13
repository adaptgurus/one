# frozen_string_literal: true

require 'digest'
require 'json'

module OneKS
  class NodeGroup
    SHAPE_KEYS = %i[cpu vcpu memory disk_size].freeze

    # Resize workers by updating the group-owned OpenNebula VM template and then
    # changing MachineDeployment template metadata. CAPI performs the rolling
    # replacement; existing worker VMs are not hot-resized in place.
    def resize_shape(requested)
      shape = normalize_shape(requested)
      return shape if OpenNebula.is_error?(shape)

      current_disk = Integer(user_inputs_values[:disk_size])
      if shape[:disk_size] < current_disk
        return OpenNebula::Error.new(
          'Worker root disk shrink is not supported', OpenNebula::Error::EACTION
        )
      end

      SHAPE_KEYS.each { |key| user_inputs_values[key] = shape[key] }
      rc = update
      return rc if OpenNebula.is_error?(rc)

      cluster = parent_cluster
      return cluster if OpenNebula.is_error?(cluster)

      rc = update_group_template(cluster)
      return rc if OpenNebula.is_error?(rc)

      revision = Digest::SHA256.hexdigest(
        JSON.generate(SHAPE_KEYS.to_h { |key| [key, shape[key]] })
      )[0, 16]

      rc = K8s.rollout_nodegroup_shape(
        cluster.client, cluster.leader, uuid, revision
      )
      return rc if OpenNebula.is_error?(rc)

      @body[:shape_revision] = revision
      update
    rescue StandardError => e
      OpenNebula::Error.new(
        "Worker resize failed: #{e.message}", OpenNebula::Error::EACTION
      )
    end

    def configure_autoscaling(enabled:, min:, max:)
      enabled = !!enabled
      min = Integer(min)
      max = Integer(max)
      if min.negative? || max < min
        return OpenNebula::Error.new(
          'Autoscaling requires 0 <= min <= max', OpenNebula::Error::EACTION
        )
      end

      cluster = parent_cluster
      return cluster if OpenNebula.is_error?(cluster)

      rc = K8s.configure_nodegroup_autoscaling(
        cluster.client,
        cluster.leader,
        uuid,
        :enabled => enabled,
        :min => min,
        :max => max,
        :cpu => user_inputs_values[:vcpu],
        :memory => user_inputs_values[:memory]
      )
      return rc if OpenNebula.is_error?(rc)

      @body[:autoscaling] = {
        :enabled => enabled,
        :min => min,
        :max => max
      }
      update
    rescue ArgumentError, TypeError
      OpenNebula::Error.new(
        'Autoscaling bounds must be integers', OpenNebula::Error::EACTION
      )
    rescue StandardError => e
      OpenNebula::Error.new(
        "Autoscaling configuration failed: #{e.message}",
        OpenNebula::Error::EACTION
      )
    end

    private

    def normalize_shape(requested)
      requested = requested.transform_keys(&:to_sym)
      missing = SHAPE_KEYS.reject { |key| requested.key?(key) }
      unless missing.empty?
        return OpenNebula::Error.new(
          "Missing worker shape fields: #{missing.join(', ')}",
          OpenNebula::Error::EACTION
        )
      end

      shape = SHAPE_KEYS.to_h { |key| [key, Integer(requested[key])] }
      if shape.values.any? { |value| value <= 0 }
        return OpenNebula::Error.new(
          'Worker shape values must be greater than zero',
          OpenNebula::Error::EACTION
        )
      end
      if shape[:memory] < 1024 || shape[:disk_size] < 4096
        return OpenNebula::Error.new(
          'Worker memory must be >=1024 MiB and disk >=4096 MiB',
          OpenNebula::Error::EACTION
        )
      end

      shape
    rescue ArgumentError, TypeError
      OpenNebula::Error.new(
        'Worker shape values must be integers', OpenNebula::Error::EACTION
      )
    end

    def update_group_template(cluster)
      one_auth = ODS::AuthController.user_auth(@client)
      return one_auth if OpenNebula.is_error?(one_auth)

      deployment = cluster.deployment_info
      return deployment if OpenNebula.is_error?(deployment)

      cluster_values = cluster.plain_body.merge(
        :uuid => cluster.uuid,
        :deployment => deployment
      )
      group_values = plain_body.merge(
        :group_image_name => base_shared_name('node'),
        :group_template_name => base_group_name('node')
      )
      values = {
        :cluster => cluster_values,
        :group => group_values,
        :one_auth => one_auth
      }

      templates_map = self.class.family_templates(family)
      templates_map.each_value do |content|
        rendered = ERB.new(content, :trim_mode => '-').result_with_hash(values)
        template = OneHelper::Template.find(@client, base_group_name('node'))
        return template if OpenNebula.is_error?(template)
        return OpenNebula::Error.new(
          "Worker VM template #{base_group_name('node')} not found",
          OpenNebula::Error::EACTION
        ) if template.nil?

        rc = OneHelper::Template.update(@client, template.id, rendered)
        return rc if OpenNebula.is_error?(rc)
      end

      true
    end
  end
end
