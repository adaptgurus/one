# frozen_string_literal: true

require_relative 'disk_reconciliation_test'

# Fault coverage for publishing replacement-worker disk baselines before completion.
class DiskResizeFinalizationTest < Minitest::Test

    # Records durable snapshots and injects individual metadata/template failures.
    class PublicationHarness < DiskReconciliationTest::NodeGroupHarness

        attr_accessor :template_error, :fail_update_at
        attr_reader :template_calls, :update_calls

        def initialize(body)
            super
            @template_calls = []
            @update_calls = 0
        end

        def update
            @update_calls += 1
            if @update_calls == @fail_update_at
                return OpenNebula::Error.new('metadata persistence unavailable')
            end

            super
        end

        def update_group_template(_cluster)
            @template_calls << Marshal.load(Marshal.dump(@persisted.last))
            @template_error || true
        end

    end

    def setup
        OneKS::WorkerDiskManager.resize_calls = []
        OneKS::WorkerDiskManager.grow_calls = []
        OneKS::WorkerDiskManager.resize_result = true
        @policy = {
            :enabled => true, :threshold_percent => 70, :increment_gib => 30,
            :cooldown_seconds => 300, :root_max_gib => 120,
            :data_disks => [{
                :name => 'data-a', :initial_gib => 30, :max_gib => 120,
                :filesystem => 'xfs', :target => 'vdb',
                :mount => '/var/lib/layersentry/disks/data-a'
            }]
        }
        @inflight = {
            :key => '501:1', :vm_id => 501, :disk_id => 1, :name => 'data-a',
            :from_mib => 30 * 1024, :to_mib => 60 * 1024,
            :used_percent => 80, :started_at => 1_000
        }
        @disk = {
            :name => 'data-a', :disk_id => 1, :present => true,
            :mount => '/var/lib/layersentry/disks/data-a', :used_percent => 50,
            :current_size_mib => 60 * 1024, :guest_capacity_mib => 60 * 1024,
            :guest_caught_up => true, :max_size_mib => 120 * 1024
        }
        OneKS::WorkerDiskManager.status = { :disks => [@disk] }
        @group = PublicationHarness.new(
            :disk_autoscaling => @policy,
            :disk_resize_inflight => @inflight,
            :disk_resize_history => {}
        )
    end

    def test_template_failure_retains_durable_pending_operation
        @group.template_error = OpenNebula::Error.new('template publication unavailable')
        result = @group.reconcile_disk_autoscaling(:now => 1_130)

        assert OpenNebula.is_error?(result)
        assert_equal @inflight, @group.body[:disk_resize_inflight]
        assert_equal @inflight, @group.persisted.last[:disk_resize_inflight]
        assert_empty @group.body[:disk_resize_history]
        assert_equal 60, @group.persisted.last.dig(:disk_autoscaling, :data_disks, 0,
                                                  :initial_gib)
        assert_no_disk_mutation
    end

    def test_restart_retries_template_without_another_resize
        @group.template_error = OpenNebula::Error.new('template publication unavailable')
        @group.reconcile_disk_autoscaling(:now => 1_130)
        restarted = PublicationHarness.new(@group.persisted.last)
        result = restarted.reconcile_disk_autoscaling(:now => 1_131)

        assert_equal 1, restarted.template_calls.length
        assert_equal 'resized', result[:action]
        refute restarted.persisted.last.key?(:disk_resize_inflight)
        assert_equal 1_131, restarted.persisted.last.dig(:disk_resize_history, '501:1')
        assert_no_disk_mutation
    end

    def test_template_sees_durable_baseline_with_operation_still_pending
        result = @group.reconcile_disk_autoscaling(:now => 1_130)
        snapshot = @group.template_calls.fetch(0)

        assert_equal 'resized', result[:action]
        assert_equal @inflight, snapshot[:disk_resize_inflight]
        assert_equal 60, snapshot.dig(:disk_autoscaling, :data_disks, 0, :initial_gib)
        assert_empty snapshot[:disk_resize_history]
        assert_no_disk_mutation
    end

    def test_completion_persistence_failure_keeps_same_instance_retryable
        @group.fail_update_at = 2
        result = @group.reconcile_disk_autoscaling(:now => 1_130)

        assert OpenNebula.is_error?(result)
        assert_equal @inflight, @group.body[:disk_resize_inflight]
        assert_equal @inflight, @group.persisted.last[:disk_resize_inflight]
        assert_empty @group.body[:disk_resize_history]
        assert_no_disk_mutation

        @group.fail_update_at = nil
        result = @group.reconcile_disk_autoscaling(:now => 1_131)
        assert_equal 'resized', result[:action]
        assert_equal 2, @group.template_calls.length
        refute @group.body.key?(:disk_resize_inflight)
        assert_no_disk_mutation
    end

    def test_reassigned_native_disk_id_does_not_receive_retry
        OneKS::WorkerDiskManager.status = {
            :disks => [@disk.merge(:name => 'data-b', :current_size_mib => 30 * 1024,
                                  :mount => '/var/lib/layersentry/disks/data-b')]
        }
        result = @group.reconcile_disk_autoscaling(:now => 1_130)

        assert OpenNebula.is_error?(result)
        assert_equal @inflight, @group.body[:disk_resize_inflight]
        assert_empty @group.template_calls
        assert_no_disk_mutation
    end

    def test_mismatched_persisted_operation_key_fails_closed
        @group.body[:disk_resize_inflight][:key] = '501:2'
        result = @group.reconcile_disk_autoscaling(:now => 1_130)

        assert OpenNebula.is_error?(result)
        assert_equal '501:2', @group.body.dig(:disk_resize_inflight, :key)
        assert_empty @group.template_calls
        assert_no_disk_mutation
    end

    private

    def assert_no_disk_mutation
        assert_empty OneKS::WorkerDiskManager.resize_calls
        assert_empty OneKS::WorkerDiskManager.grow_calls
    end

end
