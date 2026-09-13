# frozen_string_literal: true

require 'active_support/core_ext/string/indent'
require 'erb'
require 'minitest/autorun'
require 'yaml'
require_relative '../lib/helpers/k8s_day2_helper'
require_relative '../app/services/lifecycle_status'
require_relative '../app/services/lifecycle_status_autoscaler'

# Regression coverage for the LayerSentry RKE2 Day-2 profile and status mapper.
class Day2LifecycleTest < Minitest::Test

    ROOT = File.expand_path('../specs', __dir__)

    def test_day2_annotation_constants_are_module_visible
        assert_equal 'layersentry.io/shape-revision', OneKS::K8s::SHAPE_REVISION
        assert_equal 'layersentry.io/storage-revision', OneKS::K8s::STORAGE_REVISION
    end

    def render(type, inputs = {})
        cluster = {
            :id => 900,
            :uuid => 'day2-test',
            :kubernetes_version => 'v1.36.4',
            :deployment => {
                :sched_requirements => 'CLUSTER_ID = 0',
                :networks => {
                    :public => { :name => 'public' },
                    :private => { :name => 'private' }
                }
            }
        }
        group = {
            :id => 901,
            :uuid => 'day2-workers',
            :type => 'CONTROLPLANE',
            :router_template_name => 'day2-router',
            :group_template_name => 'day2-node',
            :user_inputs_values => {
                :count => 1,
                :cpu => 2,
                :vcpu => 2,
                :memory => 4096,
                :disk_size => 16_384,
                :node_image_id => 7,
                :router_image_id => 8,
                :router_vmgroup_id => 9,
                :system_datastore_id => 4
            }.merge(inputs)
        }
        one_auth = 'test:fixture-only'
        one_xmlrpc = 'http://169.254.16.9:2633/RPC2'
        dir = File.join(ROOT, type, 'layersentry-poc')
        templates = Dir[File.join(dir, 'templates', '*.erb')].to_h do |path|
            [File.basename(path, '.erb').to_sym, ERB.new(File.read(path)).result(binding)]
        end
        documents = YAML.load_stream(
            ERB.new(File.read(File.join(dir, 'spec.erb'))).result(binding)
        )
        [documents.to_h {|doc| [doc.fetch('kind'), doc] }, templates]
    end

    def test_control_plane_flavour_accepts_explicit_replica_count
        conf = YAML.load_file(
            File.join(ROOT, 'controlplanes', 'layersentry-poc', 'controlplane.conf')
        )
        flavour = conf.fetch('flavours').fetch('standalone')
        assert_equal true, flavour.fetch('override_defaults')
        assert_equal 1, flavour.fetch('defaults').fetch('count')
        count = conf.fetch('user_inputs').find {|input| input.fetch('name') == 'count' }
        assert_equal 1, count.dig('match', 'values', 'min')
        assert_equal 7, count.dig('match', 'values', 'max')

        workers = YAML.load_file(
            File.join(ROOT, 'nodegroups', 'layersentry-poc', 'nodegroup.conf')
        )
        worker_count = workers.fetch('user_inputs').find do |input|
            input.fetch('name') == 'count'
        end
        assert_equal 0, worker_count.dig('match', 'values', 'min')
        assert_equal 7, worker_count.dig('match', 'values', 'max')
    end

    def test_control_plane_remediation_starts_only_after_three_members
        docs, = render('controlplanes', :count => 2)
        refute docs.key?('MachineHealthCheck'),
               'transient two-member etcd must not be auto-remediated'

        docs, = render('controlplanes', :count => 3)
        assert_equal 3, docs.fetch('RKE2ControlPlane').dig('spec', 'replicas')
        mhc = docs.fetch('MachineHealthCheck').fetch('spec')
        assert_equal 1, mhc.fetch('maxUnhealthy')
        assert_equal '60m', mhc.fetch('nodeStartupTimeout')
    end

    def test_worker_rollout_is_zero_unavailable_and_remediation_is_bounded
        docs, = render('nodegroups', :count => 3)
        strategy = docs.fetch('MachineDeployment').dig('spec', 'strategy')
        assert_equal 'RollingUpdate', strategy.fetch('type')
        assert_equal 1, strategy.dig('rollingUpdate', 'maxSurge')
        assert_equal 0, strategy.dig('rollingUpdate', 'maxUnavailable')
        assert_equal 1, docs.fetch('MachineHealthCheck').dig('spec', 'maxUnhealthy')
    end

    def test_runtime_node_mapping_uses_opennebula_provider_id_and_ready_condition
        node = {
            'metadata' => {
                'name' => 'worker-1',
                'labels' => { 'node-role.kubernetes.io/worker' => '' }
            },
            'spec' => { 'providerID' => 'one://44' },
            'status' => {
                'conditions' => [
                    {
                        'type' => 'Ready',
                        'status' => 'True',
                        'reason' => 'KubeletReady',
                        'lastTransitionTime' => '2026-09-13T01:18:28Z'
                    }
                ],
                'nodeInfo' => { 'kubeletVersion' => 'v1.36.4+rke2r1' }
            }
        }

        row = OneKS::LifecycleStatus.node_status(node)
        assert_equal 44, row[:vm_id]
        assert_equal true, row[:ready]
        assert_equal 'v1.36.4+rke2r1', row[:kubelet_version]
    end

    def test_non_opennebula_provider_id_is_not_attributed_to_a_vm
        node = { 'spec' => { 'providerID' => 'aws:///i-123' } }
        assert_nil OneKS::LifecycleStatus.node_status(node)
    end

    def test_autoscaling_annotations_do_not_imply_operational_autoscaling
        runtime = { :enabled => true, :min => 1, :max => 5 }
        controller = { :observed => false, :ready => false }

        effective = OneKS::LifecycleStatus.effective_autoscaling_runtime(
            runtime, controller
        )
        assert_equal true, effective[:configured]
        assert_equal false, effective[:enabled]
        assert_equal false, effective[:controller_ready]
    end

    def test_autoscaling_is_enabled_only_with_ready_controller
        runtime = { :enabled => true, :min => 1, :max => 5 }
        controller = { :observed => true, :ready => true }

        effective = OneKS::LifecycleStatus.effective_autoscaling_runtime(
            runtime, controller
        )
        assert_equal true, effective[:configured]
        assert_equal true, effective[:enabled]
        assert_equal true, effective[:controller_ready]
        assert_equal 1, effective[:min]
        assert_equal 5, effective[:max]
    end

    def test_bootstrap_status_accepts_raw_persisted_dependency_hash
        cp = Struct.new(:dependencies).new(
            [
                {
                    :name => 'SeedVM', :ready => true,
                    :opts => {
                        :last_state => 'RUNNING',
                        :last_heartbeat_at => 1_789_306_304
                    }
                }
            ]
        )
        status = OneKS::LifecycleStatus.bootstrap_status(cp)
        assert_equal 'RUNNING', status.fetch(:state)
        assert_equal 1_789_306_304, status.fetch(:last_heartbeat_at)
        assert_equal false, status.fetch(:timed_out)
    end

end
