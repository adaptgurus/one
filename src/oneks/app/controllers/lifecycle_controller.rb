# frozen_string_literal: true

module OneKS
  # Additive lifecycle/status routes for LayerSentry. These routes do not
  # create a second controller: mutations are delegated to the existing
  # OneKS LCM and CAPI/CAPRKE2 resources.
  module LifecycleController
    def self.registered(app)
      app.helpers do
        def lifecycle_cluster(id)
          cluster = OneKS::Cluster.new_from_id(@client, id)
          return cluster if OpenNebula.is_error?(cluster)
          return OpenNebula::Error.new(
            'Control plane group not found', OpenNebula::Error::ENO_EXISTS
          ) unless cluster.control_plane

          cluster
        end

        def lifecycle_worker_group(cluster, group_id)
          ref = Array(cluster.node_groups).find { |entry| entry[:id].to_i == group_id.to_i }
          return OpenNebula::Error.new(
            "Worker group #{group_id} not found", OpenNebula::Error::ENO_EXISTS
          ) unless ref

          OneKS::NodeGroup.new_from_id(@client, ref[:id])
        end
      end

      app.get '/clusters/:id/runtime-status' do
        cluster = OneKS::Cluster.new_from_id(@client, params[:id], :raw => true)
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        snapshot = OneKS::LifecycleStatus.snapshot(cluster)
        return internal_error(
          snapshot.message, one_error_to_http(snapshot.errno)
        ) if OpenNebula.is_error?(snapshot)

        status 200
        body process_response(snapshot)
      rescue StandardError => e
        general_error(e)
      end

      app.post '/clusters/:id/control-plane/scale' do
        payload = check_body(request)
        target = payload[:target]
        unless target.is_a?(Integer) && target >= 1
          return internal_error(
            'Field target must be an integer greater than or equal to 1',
            ODS::ResponseHelper::VALIDATION_EC
          )
        end

        cluster = lifecycle_cluster(params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        rc = cluster.scale_group(cluster.control_plane[:id], target, :actor => @username)
        return internal_error(
          rc.message, one_error_to_http(rc.errno)
        ) if OpenNebula.is_error?(rc)

        status 202
        body process_response({
          :cluster_id => cluster.id,
          :control_plane_group_id => cluster.control_plane[:id],
          :target => target,
          :state => 'SCALING'
        })
      rescue ODS::RequestHelper::InvalidRequestError => e
        internal_error(e.message, ODS::ResponseHelper::VALIDATION_EC)
      rescue StandardError => e
        general_error(e)
      end

      # Stage 1 of a Kubernetes version upgrade. The target version is persisted
      # on the cluster and only the RKE2ControlPlane is reconciled. LayerSentry
      # waits for Ready/etcd/version convergence before upgrading workers.
      app.post '/clusters/:id/control-plane/upgrade' do
        payload = check_body(request)
        target = payload[:kubernetes_version].to_s

        cluster = lifecycle_cluster(params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        family = ControlPlane.family_by_name(cluster.control_plane[:family])
        return internal_error(
          "Control plane family #{cluster.control_plane[:family]} not found",
          one_error_to_http(OpenNebula::Error::ENO_EXISTS)
        ) if family.nil?
        unless family[:supported_k8s_versions].include?(target)
          return internal_error(
            "Kubernetes version #{target} not valid. Valid versions: " \
            "#{family[:supported_k8s_versions].join(', ')}",
            ODS::ResponseHelper::VALIDATION_EC
          )
        end

        unless cluster.kubernetes_version == target
          cluster.kubernetes_version = target
          rc = cluster.update
          return internal_error(
            rc.message, one_error_to_http(rc.errno)
          ) if OpenNebula.is_error?(rc)
        end

        rc = cluster.upgrade_group(cluster.control_plane[:id], :actor => @username)
        return internal_error(
          rc.message, one_error_to_http(rc.errno)
        ) if OpenNebula.is_error?(rc)

        status 202
        body process_response({
          :cluster_id => cluster.id,
          :target_version => target,
          :stage => 'CONTROL_PLANE'
        })
      rescue ODS::RequestHelper::InvalidRequestError => e
        internal_error(e.message, ODS::ResponseHelper::VALIDATION_EC)
      rescue StandardError => e
        general_error(e)
      end

      # Stage 2 is invoked per worker group after the control plane has fully
      # converged. MachineDeployment rollingUpdate keeps maxUnavailable=0.
      app.post '/clusters/:id/nodegroups/:nodegroup_id/upgrade' do
        cluster = lifecycle_cluster(params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        group = lifecycle_worker_group(cluster, params[:nodegroup_id])
        return internal_error(
          group.message, one_error_to_http(group.errno)
        ) if OpenNebula.is_error?(group)

        rc = cluster.upgrade_group(group.id, :actor => @username)
        return internal_error(
          rc.message, one_error_to_http(rc.errno)
        ) if OpenNebula.is_error?(rc)

        status 202
        body process_response({
          :cluster_id => cluster.id,
          :nodegroup_id => group.id,
          :target_version => cluster.kubernetes_version,
          :stage => 'WORKERS'
        })
      rescue StandardError => e
        general_error(e)
      end

      app.post '/clusters/:id/nodegroups/:nodegroup_id/resize' do
        payload = check_body(request)
        cluster = lifecycle_cluster(params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        group = lifecycle_worker_group(cluster, params[:nodegroup_id])
        return internal_error(
          group.message, one_error_to_http(group.errno)
        ) if OpenNebula.is_error?(group)

        rc = group.resize_shape(payload)
        return internal_error(
          rc.message, one_error_to_http(rc.errno)
        ) if OpenNebula.is_error?(rc)

        status 202
        body process_response({
          :cluster_id => cluster.id,
          :nodegroup_id => group.id,
          :shape => group.user_inputs_values.slice(:cpu, :vcpu, :memory, :disk_size),
          :shape_revision => group.body[:shape_revision],
          :state => 'ROLLING_REPLACEMENT'
        })
      rescue ODS::RequestHelper::InvalidRequestError => e
        internal_error(e.message, ODS::ResponseHelper::VALIDATION_EC)
      rescue StandardError => e
        general_error(e)
      end

      app.post '/clusters/:id/nodegroups/:nodegroup_id/autoscaling' do
        payload = check_body(request)
        enabled = payload[:enabled]
        unless enabled == true || enabled == false
          return internal_error(
            'Field enabled must be a boolean', ODS::ResponseHelper::VALIDATION_EC
          )
        end

        min = payload[:min]
        max = payload[:max]
        unless min.is_a?(Integer) && max.is_a?(Integer)
          return internal_error(
            'Fields min and max must be integers', ODS::ResponseHelper::VALIDATION_EC
          )
        end

        cluster = lifecycle_cluster(params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)

        group = lifecycle_worker_group(cluster, params[:nodegroup_id])
        return internal_error(
          group.message, one_error_to_http(group.errno)
        ) if OpenNebula.is_error?(group)

        rc = group.configure_autoscaling(:enabled => enabled, :min => min, :max => max)
        return internal_error(
          rc.message, one_error_to_http(rc.errno)
        ) if OpenNebula.is_error?(rc)

        status 202
        body process_response({
          :cluster_id => cluster.id,
          :nodegroup_id => group.id,
          :autoscaling => group.body[:autoscaling]
        })
      rescue ODS::RequestHelper::InvalidRequestError => e
        internal_error(e.message, ODS::ResponseHelper::VALIDATION_EC)
      rescue StandardError => e
        general_error(e)
      end
    end
  end
end
