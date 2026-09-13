# frozen_string_literal: true
require 'minitest/autorun'
require 'ostruct'
require 'yaml'
SERVER_CONF = {
  appliance_auto_import: false,
  kubectl_path: '/fixture/kubectl',
  kubeconfig_path: '/fixture/kubeconfig',
  k8s_timeout: 15,
  cluster_autoscaler: {
    chart: 'cluster-autoscaler',
    chart_repo: 'https://kubernetes.github.io/autoscaler',
    chart_version: '9.59.0',
    image_repository: 'registry.k8s.io/autoscaling/cluster-autoscaler',
    image_tags: {'1.36' => 'v1.36.1'}
  }
}.freeze
ONEKS_SPEC_DIR = File.expand_path('../specs', __dir__) unless defined?(ONEKS_SPEC_DIR)

# Isolate the lifecycle methods from the document store and event transport.
module ODS
  class Document; end
  class Schema
    def self.params; end
    def self.rule(*); end
  end
  module StateMachine
    def self.included(base)
      base.define_singleton_method(:state_machine) {|*| }
    end
  end
end
module OpenNebula
  class Error < StandardError
    EACTION = 1
    def initialize(message, *)
      super(message)
    end
  end
  def self.is_error?(value)
    value.is_a?(Error)
  end
  class VirtualMachine
    def self.new_with_id(*)
      raise 'Unexpected VM lookup'
    end
  end
  class VirtualRouterPool
    def self.new(*)
      raise 'Unexpected router lookup'
    end
  end
  class VirtualRouter; end
end
module OneKS
  module Log
    def self.info(*); end
  end
end
require_relative '../lib/helpers/k8s_helper'
require_relative '../lib/helpers/k8s_day2_helper'
require_relative '../app/models/k8s_dependency'
require_relative '../app/models/k8s_group'
require_relative '../app/models/groups/controlplane'
require_relative '../app/models/groups/nodegroup'
require_relative '../app/models/groups/nodegroup_day2'
require_relative '../app/models/dependencies/seed_vm'
require_relative '../app/models/dependencies/cluster_router'

class BootstrapRecoveryTest < Minitest::Test
  class VM
    attr_accessor :fields, :name, :owner_id, :result
    def initialize
      @name = 'group-uuid-seed'; @owner_id = 7
      @fields = {'UID'=>'7', 'STATE'=>'3', 'LCM_STATE'=>'3',
                 'USER_TEMPLATE/ONEAPP_ONEKS_CLUSTER_NAME'=>'cluster-uuid',
                 'USER_TEMPLATE/ONEKS_STATE'=>'PROVISIONING_CP'}
    end
    def info; result; end
    def [](key); fields[key]; end
  end
  def setup
    @seed = OneKS::SeedVM.new(opts: {appliance_id: 'fixture'})
    @seed.id = 33
    @router = OneKS::ClusterRouter.new
    @group = OneKS::K8sGroup.allocate
    values = {client: :fixture_client, owner_id: 7, uuid: 'group-uuid',
              parent_cluster: OpenStruct.new(uuid: 'cluster-uuid'),
              dependencies: [@seed, @router], vms: [36]}
    values.each {|key, value| @group.define_singleton_method(key) { value } }
    @vm = VM.new
  end
  def with_vm(&block)
    OpenNebula::VirtualMachine.stub(:new_with_id, @vm, &block)
  end

  def test_cluster_autoscaler_manifest_is_pinned_and_cluster_scoped
    manifest = OneKS::K8s.cluster_autoscaler_manifest('cluster-uuid', 'v1.36.4')
    refute OpenNebula.is_error?(manifest), manifest.to_s

    chart = YAML.safe_load(manifest)
    assert_equal 'HelmChart', chart['kind']
    assert_equal '9.59.0', chart.dig('spec', 'version')
    values = YAML.safe_load(chart.dig('spec', 'valuesContent'))
    assert_equal 'clusterapi', values['cloudProvider']
    assert_equal 'incluster-incluster', values['clusterAPIMode']
    assert_equal 'cluster-uuid', values.dig('autoDiscovery', 'clusterName')
    assert_equal 'v1.36.1', values.dig('image', 'tag')
    assert_equal 1, values['replicaCount']
  end

  def test_cluster_autoscaler_manifest_rejects_unpinned_minor
    error = OneKS::K8s.cluster_autoscaler_manifest('cluster-uuid', 'v1.37.0')
    assert_instance_of OpenNebula::Error, error
    assert_match(/No pinned Cluster Autoscaler release/, error.message)
  end

  def test_control_plane_scale_limit_rejects_above_seven_before_mutation
    control_plane = OneKS::ControlPlane.allocate
    control_plane.define_singleton_method(:parent_cluster) { OpenStruct.new }

    error = control_plane.scale(8)
    assert_instance_of OpenNebula::Error, error
    assert_match(/between 1 and 7/, error.message)
    assert_equal 7, OneKS::ControlPlane::MAX_REPLICAS
  end

  def test_worker_autoscaling_limit_rejects_above_seven_before_mutation
    node_group = OneKS::NodeGroup.allocate

    error = node_group.configure_autoscaling(enabled: true, min: 1, max: 8)
    assert_instance_of OpenNebula::Error, error
    assert_match(/max <= 7/, error.message)
    assert_equal 7, OneKS::NodeGroup::MAX_AUTOSCALING_REPLICAS
  end

  def test_timeout_recovery_preserves_seed_and_existing_control_plane
    @seed.define_singleton_method(:recover) {|*| flunk 'seed must not be destroyed' }
    @router.define_singleton_method(:recover) {|*| flunk 'router must not be destroyed' }
    @seed.ready = @router.ready = true
    with_vm do
      assert_equal true, @group.recover_dependencies
      assert_equal true, @seed.create(@group)
    end
    assert_equal 33, @seed.id
    assert_equal [36], @group.vms
    refute @seed.ready?
    refute @router.ready?
  end
  def test_completed_seed_is_reused_until_native_observer_consumes_readiness
    @vm.fields['USER_TEMPLATE/ONEKS_STATE'] = 'RUNNING'
    with_vm { assert_equal true, @seed.create(@group) }
  end
  def test_foreign_or_unknown_seed_fails_closed_before_cleanup
    @vm.fields['UID'] = '99'
    with_vm { assert_instance_of OpenNebula::Error, @group.recover_dependencies }
    @vm.fields['UID'] = '7'; @vm.name = 'foreign-seed'
    with_vm { assert_instance_of OpenNebula::Error, @seed.create(@group) }
    @vm.name = 'group-uuid-seed'; @vm.result = OpenNebula::Error.new('read failed')
    with_vm { assert_instance_of OpenNebula::Error, @group.recover_dependencies }
    assert_equal [36], @group.vms
  end
  def test_failed_seed_cannot_be_silently_reused_or_duplicated
    @vm.fields['USER_TEMPLATE/ONEKS_STATE'] = 'PIVOTING_FAILURE'
    with_vm do
      refute @seed.resumable_bootstrap?(@group)
      assert_instance_of OpenNebula::Error, @seed.create(@group)
    end
  end
  def test_uncertain_seed_states_never_enter_destructive_dependency_recovery
    calls = []
    [@seed, @router].each do |dep|
      dep.define_singleton_method(:recover) do |*|
        calls << self
        OpenNebula::Error.new('Destructive recovery must not be invoked')
      end
    end
    [['3', '3', 'PIVOTING_FAILURE'], ['3', '3', 'UNKNOWN'],
     ['8', '0', 'PROVISIONING_CP']].each do |state, lcm, oneks|
      @vm.fields.merge!('STATE'=>state, 'LCM_STATE'=>lcm,
                        'USER_TEMPLATE/ONEKS_STATE'=>oneks)
      with_vm { assert_instance_of OpenNebula::Error, @group.recover_dependencies }
      assert_empty calls
      assert_equal 33, @seed.id
      assert_equal [36], @group.vms
    end
  end
  def test_missing_seed_identity_with_existing_nodes_requires_reconciliation
    @seed.id = nil
    calls = []
    @seed.define_singleton_method(:recover) do |*|
      calls << :seed
      OpenNebula::Error.new('Destructive recovery must not be invoked')
    end
    assert_instance_of OpenNebula::Error, @group.recover_dependencies
    assert_empty calls
    assert_equal [36], @group.vms
  end
  def with_routers(routers)
    pool = routers
    pool.define_singleton_method(:info) { nil }
    OpenNebula::VirtualRouterPool.stub(:new, pool) { yield }
  end
  def test_router_allocated_after_timeout_is_adopted_without_waiting_for_old_event
    router = OpenStruct.new(name: 'cluster-uuid-cp', owner_id: 7, id: 2)
    with_routers([router]) { assert_equal 2, @router.wait_create(@group, nil) }
    assert_equal 2, @router.id
  end
  def test_foreign_ambiguous_and_changed_router_identity_are_rejected
    router = OpenStruct.new(name: 'cluster-uuid-cp', owner_id: 99, id: 2)
    with_routers([router]) { assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil) }
    router.owner_id = 7
    with_routers([router, router.dup]) { assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil) }
    @router.id = 8
    with_routers([router]) { assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil) }
  end
end
