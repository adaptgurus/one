# frozen_string_literal: true

require 'digest'
require 'json'

module OneKS

    # Day-2 operations layered onto the native OneKS NodeGroup lifecycle.
    class NodeGroup

        SHAPE_KEYS = [:cpu, :vcpu, :memory, :disk_size].freeze
        MAX_AUTOSCALING_REPLICAS = 7

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

            SHAPE_KEYS.each {|key| user_inputs_values[key] = shape[key] }
            rc = update
            return rc if OpenNebula.is_error?(rc)

            cluster = parent_cluster
            return cluster if OpenNebula.is_error?(cluster)

            rc = update_group_template(cluster)
            return rc if OpenNebula.is_error?(rc)

            revision = Digest::SHA256.hexdigest(
                JSON.generate(SHAPE_KEYS.to_h {|key| [key, shape[key]] })
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
            enabled = enabled == true
            min = Integer(min)
            max = Integer(max)
            if min.negative? || max < min || max > MAX_AUTOSCALING_REPLICAS
                return OpenNebula::Error.new(
                    'Autoscaling requires 0 <= min <= max <= 7', OpenNebula::Error::EACTION
                )
            end

            cluster = parent_cluster
            return cluster if OpenNebula.is_error?(cluster)

            leader = cluster.leader
            return leader if OpenNebula.is_error?(leader)

            if enabled
                rc = K8s.ensure_cluster_autoscaler(
                    cluster.client, leader, cluster.uuid, cluster.kubernetes_version
                )
                return rc if OpenNebula.is_error?(rc)
            end

            rc = K8s.configure_nodegroup_autoscaling(
                cluster.client,
                leader,
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


        def configure_disk_autoscaling(requested)
            policy = WorkerDiskManager.normalize(requested)
            return policy if OpenNebula.is_error?(policy)

            current_root_gib = (Integer(user_inputs_values[:disk_size]) / 1024.0).ceil
            if policy[:root_max_gib] < current_root_gib
                return OpenNebula::Error.new(
                    'Root disk autoscaling maximum cannot be below the current root size',
                    OpenNebula::Error::EACTION
                )
            end

            return true if @body[:disk_autoscaling] == policy

            @body[:disk_autoscaling] = policy
            rc = update
            return rc if OpenNebula.is_error?(rc)

            cluster = parent_cluster
            return cluster if OpenNebula.is_error?(cluster)

            rc = update_group_template(cluster)
            return rc if OpenNebula.is_error?(rc)

            spec = render
            return spec if OpenNebula.is_error?(spec)

            rc = K8s.apply(cluster.client, cluster.leader, spec)
            return rc if OpenNebula.is_error?(rc)

            revision = Digest::SHA256.hexdigest(JSON.generate(policy))[0, 16]
            rc = K8s.rollout_nodegroup_storage(
                cluster.client, cluster.leader, uuid, revision
            )
            return rc if OpenNebula.is_error?(rc)

            @body[:storage_revision] = revision
            update
        rescue StandardError => e
            OpenNebula::Error.new(
                "Worker disk autoscaling configuration failed: #{e.message}",
                OpenNebula::Error::EACTION
            )
        end

        def reconcile_disk_autoscaling(now: Time.now.to_i)
            policy = @body[:disk_autoscaling]
            return { :action => 'disabled' } unless policy && policy[:enabled]

            cluster = parent_cluster
            return cluster if OpenNebula.is_error?(cluster)

            history = @body[:disk_resize_history] ||= {}
            Array(vms).sort.each do |vm_id|
                status = WorkerDiskManager.vm_status(cluster.client, vm_id, policy)
                return status if OpenNebula.is_error?(status)

                Array(status[:disks]).each do |disk|
                    next unless disk[:present]
                    next unless disk[:used_percent].to_i > policy[:threshold_percent]
                    next unless disk[:guest_caught_up]
                    next if disk[:current_size_mib].to_i >= disk[:max_size_mib].to_i

                    key = "#{vm_id}:#{disk[:disk_id]}"
                    last = Integer(history[key] || 0)
                    next if last.positive? && now - last < policy[:cooldown_seconds]

                    increment_mib = policy[:increment_gib] * 1024
                    target = [disk[:current_size_mib] + increment_mib,
                              disk[:max_size_mib]].min
                    rc = WorkerDiskManager.resize(
                        cluster.client, vm_id, disk[:disk_id], target
                    )
                    return rc if OpenNebula.is_error?(rc)

                    history[key] = now
                    update_disk_baseline(policy, disk[:name], target)
                    @body[:disk_autoscaling] = policy
                    @body[:disk_resize_history] = history
                    rc = update
                    return rc if OpenNebula.is_error?(rc)

                    rc = update_group_template(cluster)
                    return rc if OpenNebula.is_error?(rc)

                    return {
                        :action => 'resized',
                        :vm_id => vm_id.to_i,
                        :disk_id => disk[:disk_id],
                        :name => disk[:name],
                        :from_mib => disk[:current_size_mib],
                        :to_mib => target,
                        :used_percent => disk[:used_percent]
                    }
                end
            end

            { :action => 'none' }
        rescue ArgumentError, TypeError => e
            OpenNebula::Error.new(
                "Worker disk autoscaling reconciliation failed: #{e.message}",
                OpenNebula::Error::EACTION
            )
        end

        private

        def normalize_shape(requested)
            requested = requested.transform_keys(&:to_sym)
            missing = SHAPE_KEYS.reject {|key| requested.key?(key) }
            unless missing.empty?
                return OpenNebula::Error.new(
                    "Missing worker shape fields: #{missing.join(', ')}",
                    OpenNebula::Error::EACTION
                )
            end

            shape = SHAPE_KEYS.to_h {|key| [key, Integer(requested[key])] }
            if shape.values.any? {|value| value <= 0 }
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


        def update_disk_baseline(policy, name, target_mib)
            target_gib = (Integer(target_mib) / 1024.0).ceil
            if name == 'root'
                user_inputs_values[:disk_size] = [Integer(user_inputs_values[:disk_size]),
                                                  Integer(target_mib)].max
                return
            end

            disk = Array(policy[:data_disks]).find {|entry| entry[:name] == name }
            return unless disk

            disk[:initial_gib] = [Integer(disk[:initial_gib]), target_gib].max
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
