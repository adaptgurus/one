# frozen_string_literal: true

module OneKS

    class EventManager

        # Replays a matching in-flight scale intent instead of dropping it. Native
        # replica mutations are declarative/idempotent, so this closes the crash
        # window between persisting desired state and issuing the CAPI mutation.
        def group_scale_action(group_id, target, external_user)
            cluster_id = nil
            group_type = nil
            skipped = false

            rc = @group_pool.get(group_id, external_user) do |group|
                cluster_id = group.cluster_id
                group_type = group.type

                case group.state
                when :SCALING, :SCALING_FAILURE
                    unless target == group.expected_size
                        Log.warn(
                            COMP,
                            "#{group_type} (ID=#{group_id}) has in-flight target " \
                            "#{group.expected_size}; refusing conflicting target #{target}",
                            cluster_id
                        )
                        skipped = true
                        next
                    end

                    Log.info(
                        COMP,
                        "#{group_type} (ID=#{group_id}) replaying idempotent scale target #{target}",
                        cluster_id
                    )
                else
                    if target == group.expected_size
                        Log.info(
                            COMP,
                            "#{group_type} (ID=#{group_id}) already has target #{target}, skipping scale",
                            cluster_id
                        )
                        skipped = true
                        next
                    end
                end

                group.state = :SCALING unless group.state == :SCALING
                scale_rc = group.scale(target)
                next scale_rc if OpenNebula.is_error?(scale_rc)

                group.update
            end

            return if skipped

            if OpenNebula.is_error?(rc)
                Log.error(
                    COMP,
                    "#{group_type} (ID=#{group_id}) scale failed: #{rc.message}",
                    cluster_id
                )
                trigger_action(
                    :name => :group_scale_failure_cb,
                    :args => [group_id, external_user]
                )
                return
            end

            Log.info(
                COMP,
                "#{group_type} (ID=#{group_id}) scaling requested (target=#{target})",
                cluster_id
            )
        rescue StandardError => e
            Log.error(
                COMP,
                "#{__method__}: Callback execution failed " \
                "(GROUP_ID=#{group_id}): #{e.class}: #{e.message}"
            )
        end

    end

end
