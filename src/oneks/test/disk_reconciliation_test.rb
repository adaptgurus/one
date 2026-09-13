# frozen_string_literal: true

require 'minitest/autorun'

module OpenNebula

    class Error

        EACTION = 1

    end

    def self.is_error?(value)
        value.is_a?(Error)
    end

end

module OneKS

    module WorkerDiskManager

        class << self

            attr_accessor :status, :resize_calls, :resize_result

            def vm_status(_client, vm_id, _policy)
                status.merge(:vm_id => vm_id)
            end

            def resize(_client, vm_id, disk_id, target)
                self.resize_calls ||= []
                resize_calls << [vm_id, disk_id, target]
                resize_result
            end

        end

    end

end

require_relative '../app/models/groups/nodegroup_day2'

# Regression coverage for persisted absolute disk targets and multiple disks.
class DiskReconciliationTest < Minitest::Test

    class NodeGroupHarness < OneKS::NodeGroup

        attr_reader :body, :persisted

        def initialize(body)
            @body = Marshal.load(Marshal.dump(body))
            @persisted = []
            @client = Object.new
        end

        def parent_cluster
            Struct.new(:client).new(Object.new)
        end

        def vms
            [501]
        end

        def update
            @persisted << Marshal.load(Marshal.dump(@body))
            true
        end

        def update_group_template(_cluster)
            true
        end

    end

    def test_lost_response_and_restart_replay_fixed_target_without_double_growth
        policy = {
            :enabled => true, :threshold_percent => 70, :increment_gib => 30,
            :cooldown_seconds => 300, :root_max_gib => 120,
            :data_disks => [managed_disk('data-a', 'vdb'),
                            managed_disk('data-b', 'vdc')]
        }
        disk = runtime_disk('data-a', 1, 80)
        OneKS::WorkerDiskManager.status = {
            :disks => [disk, runtime_disk('data-b', 2, 10)]
        }
        OneKS::WorkerDiskManager.resize_calls = []
        OneKS::WorkerDiskManager.resize_result = OpenNebula::Error.new

        group = NodeGroupHarness.new(:disk_autoscaling => policy)
        result = group.reconcile_disk_autoscaling(:now => 1_000)
        assert OpenNebula.is_error?(result)
        assert_equal [[501, 1, 60 * 1024]], OneKS::WorkerDiskManager.resize_calls
        assert_equal 60 * 1024, group.body.dig(:disk_resize_inflight, :to_mib)
        assert_equal 60 * 1024,
                     group.persisted.last.dig(:disk_resize_inflight, :to_mib),
                     'target must be durable before the resize call'

        restarted = NodeGroupHarness.new(group.body)
        result = restarted.reconcile_disk_autoscaling(:now => 1_050)
        assert_equal 'waiting-for-resize', result.fetch(:action)
        assert_equal 1, OneKS::WorkerDiskManager.resize_calls.length

        OneKS::WorkerDiskManager.resize_result = true
        result = restarted.reconcile_disk_autoscaling(:now => 1_121)
        assert_equal 'resize-retried', result.fetch(:action)
        assert_equal [501, 1, 60 * 1024], OneKS::WorkerDiskManager.resize_calls.last,
                     'retry must replay the persisted absolute target'

        OneKS::WorkerDiskManager.status = {
            :disks => [disk.merge(:current_size_mib => 60 * 1024,
                                  :guest_capacity_mib => 60 * 1024),
                       runtime_disk('data-b', 2, 10)]
        }
        result = restarted.reconcile_disk_autoscaling(:now => 1_130)
        assert_equal 'resized', result.fetch(:action)
        refute restarted.body.key?(:disk_resize_inflight)
        assert_equal 60, restarted.body.dig(:disk_autoscaling, :data_disks, 0,
                                            :initial_gib)
        assert_equal 30, restarted.body.dig(:disk_autoscaling, :data_disks, 1,
                                            :initial_gib)

        result = restarted.reconcile_disk_autoscaling(:now => 1_431)
        assert_equal 'resize-submitted', result.fetch(:action)
        assert_equal [501, 1, 90 * 1024], OneKS::WorkerDiskManager.resize_calls.last,
                     'sustained pressure must produce exactly the next +30 GiB target'
    end

    private

    def managed_disk(name, target)
        {
            :name => name, :initial_gib => 30, :max_gib => 120,
            :filesystem => 'xfs', :target => target,
            :mount => "/var/lib/layersentry/disks/#{name}"
        }
    end

    def runtime_disk(name, disk_id, used_percent)
        {
            :name => name, :disk_id => disk_id, :present => true,
            :used_percent => used_percent, :current_size_mib => 30 * 1024,
            :guest_capacity_mib => 30 * 1024, :guest_caught_up => true,
            :max_size_mib => 120 * 1024
        }
    end

end
