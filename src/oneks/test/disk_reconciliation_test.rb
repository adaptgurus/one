# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../lib/helpers/worker_disk_manager'

# Minimal OpenNebula error stub used by the isolated reconciliation tests.
module OpenNebula

    # Supports the production policy validator without a live OpenNebula client.
    class Error

        EACTION = 1

        attr_reader :message

        def initialize(message = nil, _errno = nil)
            @message = message
        end

    end

    def self.is_error?(value)
        value.is_a?(Error)
    end

end

module OneKS

    # Test double that records worker disk reconciliation side effects.
    module WorkerDiskManager

        class << self

            attr_accessor :status, :resize_calls, :resize_result, :grow_calls

            def vm_status(_client, vm_id, _policy)
                status.merge(:vm_id => vm_id)
            end

            def resize(_client, vm_id, disk_id, target)
                self.resize_calls ||= []
                resize_calls << [vm_id, disk_id, target]
                resize_result
            end

            def grow(_client, vm_id, mount)
                self.grow_calls ||= []
                grow_calls << [vm_id, mount]
                true
            end

        end

    end

end

require_relative '../app/models/groups/nodegroup_day2'

# Regression coverage for persisted absolute disk targets and multiple disks.
class DiskReconciliationTest < Minitest::Test

    # Isolated node-group harness; it deliberately avoids live OpenNebula state.
    class NodeGroupHarness < OneKS::NodeGroup

        attr_reader :body, :persisted

        # The production initializer requires live OneKS resources; this harness
        # initializes only the fields exercised by these unit tests.
        # rubocop:disable-next Lint/MissingSuper
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

    def test_default_disk_policy_is_strictly_above_seventy_and_grows_thirty_gib
        policy = {
            :enabled => true, :threshold_percent => 70, :increment_gib => 30,
            :cooldown_seconds => 300, :root_max_gib => 120, :data_disks => []
        }

        group = NodeGroupHarness.new(:disk_autoscaling => policy)
        OneKS::WorkerDiskManager.resize_calls = []
        OneKS::WorkerDiskManager.resize_result = true
        OneKS::WorkerDiskManager.status = { :disks => [runtime_disk('root', 0, 70)] }
        result = group.reconcile_disk_autoscaling(:now => 1_000)
        assert_equal 'none', result.fetch(:action)
        assert_empty OneKS::WorkerDiskManager.resize_calls

        OneKS::WorkerDiskManager.status = { :disks => [runtime_disk('root', 0, 71)] }
        result = group.reconcile_disk_autoscaling(:now => 1_001)
        assert_equal 'resize-submitted', result.fetch(:action)
        assert_equal 60 * 1024, OneKS::WorkerDiskManager.resize_calls.last[2]
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
        OneKS::WorkerDiskManager.grow_calls = []
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
                                  :guest_caught_up => false),
                       runtime_disk('data-b', 2, 10)]
        }
        result = restarted.reconcile_disk_autoscaling(:now => 1_130)
        assert_equal 'guest-grow-submitted', result.fetch(:action)
        assert_equal [[501, '/var/lib/layersentry/disks/data-a']],
                     OneKS::WorkerDiskManager.grow_calls

        OneKS::WorkerDiskManager.status = {
            :disks => [disk.merge(:current_size_mib => 60 * 1024,
                                  :guest_capacity_mib => 60 * 1024),
                       runtime_disk('data-b', 2, 10)]
        }
        result = restarted.reconcile_disk_autoscaling(:now => 1_131)
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

    def test_unowned_target_is_not_adopted
        disks = [{ 'DISK_ID' => '1', 'TARGET' => 'vdb' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_foreign_label_is_not_adopted
        disks = [{ 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'customer-volume', 'TARGET' => 'vdb' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_wrong_guest_target_is_not_adopted
        disks = [{ 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdc' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_duplicate_owner_labels_are_ambiguous
        disks = [{ 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' },
                 { 'DISK_ID' => '2', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdc' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_missing_data_disk_id_is_rejected
        disks = [{ 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_data_disk_cannot_alias_boot_disk
        disks = [{ 'DISK_ID' => '0', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_duplicate_native_disk_ids_are_ambiguous
        disks = [{ 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' },
                 { 'DISK_ID' => '1', 'TARGET' => 'vdc' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_duplicate_guest_targets_are_ambiguous
        disks = [{ 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' },
                 { 'DISK_ID' => '2', 'TARGET' => 'vdb' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(disks, managed_disk('data-a', 'vdb'))
    end

    def test_unique_owned_data_disk_is_selected
        disk = { 'DISK_ID' => '1', 'LAYERSENTRY_DISK' => 'data-a', 'TARGET' => 'vdb' }
        assert_same disk, OneKS::WorkerDiskManager.locate_disk(
            [disk], managed_disk('data-a', 'vdb')
        )
    end

    def test_boot_disk_requires_unique_explicit_id
        policy = { :name => 'root', :mount => '/', :disk_id => 0 }
        invalid = [{}, { 'DISK_ID' => '' }, { 'DISK_ID' => 'invalid' }]
        assert_nil OneKS::WorkerDiskManager.locate_disk(invalid, policy)
        root = { 'DISK_ID' => '0', 'TARGET' => 'vda' }
        assert_nil OneKS::WorkerDiskManager.locate_disk([root, root.dup], policy)
        assert_same root, OneKS::WorkerDiskManager.locate_disk([root], policy)
        assert_nil OneKS::WorkerDiskManager.locate_disk([root], managed_disk('root', 'vdb'))
    end

    def test_root_is_reserved_for_the_boot_disk
        result = OneKS::WorkerDiskManager.normalize(:enabled => true,
                                                    :data_disks => [{ :name => 'root' }])
        assert OpenNebula.is_error?(result)
        assert_match(/reserved/, result.message)
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
            :mount => "/var/lib/layersentry/disks/#{name}",
            :used_percent => used_percent, :current_size_mib => 30 * 1024,
            :guest_capacity_mib => 30 * 1024, :guest_caught_up => true,
            :max_size_mib => 120 * 1024
        }
    end

end
