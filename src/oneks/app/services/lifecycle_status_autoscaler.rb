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

                runtime = runtime.dup
                runtime[:configured] = true
                runtime[:controller_observed] = controller[:observed] == true
                runtime[:controller_ready] = controller[:ready] == true
                runtime[:controller_error] = controller[:error] if controller[:error]
                runtime[:enabled] = runtime[:controller_ready]
                group[:autoscaling_runtime] = runtime
            end

            result
        end

    end

    LifecycleStatus.singleton_class.prepend(LifecycleStatusAutoscaler)

end
