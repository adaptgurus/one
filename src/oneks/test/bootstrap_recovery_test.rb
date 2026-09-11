# frozen_string_literal: true

require 'minitest/autorun'
require 'ostruct'

SERVER_CONF = { :appliance_auto_import => false }.freeze

# Isolate the lifecycle methods from the document store and event transport.
module ODS

    # Minimal document placeholder for lifecycle unit tests.
    class Document

    end

    # Minimal schema placeholder for lifecycle unit tests.
    class Schema

        def self.params; end

        def self.rule(*); end

    end

    # Minimal state-machine placeholder for lifecycle unit tests.
    module StateMachine

        def self.included(base)
            base.define_singleton_method(:state_machine) {|*| }
        end

    end

end

# Minimal OpenNebula API surface required by recovery unit tests.
module OpenNebula

    # Test error compatible with the production API contract.
    class Error < StandardError

        EACTION = 1

        def initialize(message, *)
            super(message)
        end

    end

    def self.is_error?(value)
        value.is_a?(Error)
    end

    # Test virtual-machine lookup shim.
    class VirtualMachine

        def self.new_with_id(*)
            raise 'Unexpected VM lookup'
        end

    end

    # Test virtual-router-pool lookup shim.
    class VirtualRouterPool

        def self.new(*)
            raise 'Unexpected router lookup'
        end

    end

    # Test virtual-router placeholder.
    class VirtualRouter

    end

end

# Minimal OneKS logging surface required by recovery unit tests.
module OneKS

    # Test logger placeholder.
    module Log

        def self.info(*); end

    end

end

require_relative '../app/models/k8s_dependency'
require_relative '../app/models/k8s_group'
require_relative '../app/models/dependencies/seed_vm'
require_relative '../app/models/dependencies/cluster_router'

# Recovery behavior tests for native OneKS seed and router reconciliation.
class BootstrapRecoveryTest < Minitest::Test

    # Minimal VM fixture used by the recovery tests.
    class VM

        attr_accessor :fields, :name, :owner_id, :result

        def initialize
            @name = 'group-uuid-seed'
            @owner_id = 7
            @fields = {
                'UID' => '7',
                'STATE' => '3',
                'LCM_STATE' => '3',
                'USER_TEMPLATE/ONEAPP_ONEKS_CLUSTER_NAME' => 'cluster-uuid',
                'USER_TEMPLATE/ONEKS_STATE' => 'PROVISIONING_CP'
            }
        end

        def info
            result
        end

        def [](key)
            fields[key]
        end

    end

    def setup
        @seed = OneKS::SeedVM.new(:opts => { :appliance_id => 'fixture' })
        @seed.id = 33
        @router = OneKS::ClusterRouter.new
        @group = OneKS::K8sGroup.allocate
        values = {
            :client => :fixture_client,
            :owner_id => 7,
            :uuid => 'group-uuid',
            :parent_cluster => OpenStruct.new(:uuid => 'cluster-uuid'),
            :dependencies => [@seed, @router],
            :vms => [36]
        }
        values.each do |key, value|
            @group.define_singleton_method(key) { value }
        end
        @vm = VM.new
    end

    def with_vm(&block)
        OpenNebula::VirtualMachine.stub(:new_with_id, @vm, &block)
    end

    def test_timeout_recovery_preserves_seed_and_existing_control_plane
        @seed.define_singleton_method(:recover) do |*|
            flunk 'seed must not be destroyed'
        end
        @router.define_singleton_method(:recover) do |*|
            flunk 'router must not be destroyed'
        end
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
        with_vm do
            assert_instance_of OpenNebula::Error, @group.recover_dependencies
        end

        @vm.fields['UID'] = '7'
        @vm.name = 'foreign-seed'
        with_vm do
            assert_instance_of OpenNebula::Error, @seed.create(@group)
        end

        @vm.name = 'group-uuid-seed'
        @vm.result = OpenNebula::Error.new('read failed')
        with_vm do
            assert_instance_of OpenNebula::Error, @group.recover_dependencies
        end

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

        states = [
            ['3', '3', 'PIVOTING_FAILURE'],
            ['3', '3', 'UNKNOWN'],
            ['8', '0', 'PROVISIONING_CP']
        ]
        states.each do |state, lcm, oneks|
            @vm.fields.merge!(
                'STATE' => state,
                'LCM_STATE' => lcm,
                'USER_TEMPLATE/ONEKS_STATE' => oneks
            )
            with_vm do
                assert_instance_of OpenNebula::Error, @group.recover_dependencies
            end
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

    def with_routers(routers, &block)
        pool = routers
        pool.define_singleton_method(:info) { nil }
        OpenNebula::VirtualRouterPool.stub(:new, pool, &block)
    end

    def test_router_allocated_after_timeout_is_adopted_without_waiting_for_old_event
        router = OpenStruct.new(:name => 'cluster-uuid-cp', :owner_id => 7, :id => 2)
        with_routers([router]) do
            assert_equal 2, @router.wait_create(@group, nil)
        end
        assert_equal 2, @router.id
    end

    def test_foreign_ambiguous_and_changed_router_identity_are_rejected
        router = OpenStruct.new(:name => 'cluster-uuid-cp', :owner_id => 99, :id => 2)
        with_routers([router]) do
            assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil)
        end

        router.owner_id = 7
        with_routers([router, router.dup]) do
            assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil)
        end

        @router.id = 8
        with_routers([router]) do
            assert_instance_of OpenNebula::Error, @router.wait_create(@group, nil)
        end
    end

end
