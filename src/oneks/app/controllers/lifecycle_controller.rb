# frozen_string_literal: true

module OneKS
  # Additive lifecycle/status routes for LayerSentry. These routes do not
  # create a second controller: mutations are delegated to the existing
  # OneKS LCM and CAPI/CAPRKE2 resources.
  module LifecycleController
    def self.registered(app)
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
        body = check_body(request)
        target = body[:target]
        unless target.is_a?(Integer) && target >= 1
          return internal_error(
            'Field target must be an integer greater than or equal to 1',
            ODS::ResponseHelper::VALIDATION_EC
          )
        end

        cluster = OneKS::Cluster.new_from_id(@client, params[:id])
        return internal_error(
          cluster.message, one_error_to_http(cluster.errno)
        ) if OpenNebula.is_error?(cluster)
        return internal_error(
          'Control plane group not found', ODS::ResponseHelper::OPERATION_EC
        ) unless cluster.control_plane

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
    end
  end
end
