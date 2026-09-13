# frozen_string_literal: true

module OneKS

    # Tighten autoscaling runtime truth: annotations only make a worker group
    # autoscaler-configured. It is operationally enabled only when a real
    # Cluster Autoscaler controller is observed Ready in the workload cluster.
    module LifecycleStatusAutoscaler

        def snapshot(cluster)
            result = super
            return result if OpenNebula.is_error?(result)

            controller = result[:autoscaler_controller] || {}
            groups = result.dig(:workers, :groups) || []
            groups.each do |group|
                runtime = group[:autoscaling_runtime] || { :enabled => false }
                next unless runtime[:enabled]

                group[:autoscaling_runtime] = effective_autoscaling_runtime(
                    runtime, controller
                )
            end

            result
        end

        def effective_autoscaling_runtime(runtime, controller)
            result = runtime.dup
            result[:configured] = runtime[:enabled] == true
            result[:controller_observed] = controller[:observed] == true
            result[:controller_ready] = controller[:ready] == true
            result[:controller_error] = controller[:error] if controller[:error]
            result[:enabled] = result[:configured] && result[:controller_ready]
            result
        end

    end

    LifecycleStatus.singleton_class.prepend(LifecycleStatusAutoscaler)

end
