# Synthetic owner-adapter fixtures only; no VM or host is mutated.
require 'minitest/autorun'
require_relative 'host_network_migration'

class HostNetworkMigrationTest < Minitest::Test
    class Domain
        include VirtualMachineManagerKVM::HostNetworkMigration
        attr_accessor :prepared, :socket, :helper_failure
        attr_reader :calls
        def initialize
            @domain = 'one-100'
            @calls = []
            @prepared = {'role'=>'live_migration','site'=>'dc','host_uuid'=>'0b5e029f-7b48-413a-b817-7654aae7e350','generation'=>'lab-20261005','source_address'=>'10.200.20.72','interface'=>'ls-migration','target_host'=>'dc3','target_address'=>'10.200.20.73','migration_uri'=>'tcp://10.200.20.73','listen_address'=>'10.200.20.73','state'=>'HOST_ROLE_PREPARED_NOT_MIGRATION_OR_SOCKET_PROOF'}
        end
        def [](key)
            '15c87e00-f1fa-4c00-aa01-000000000001'
        end
        def native_migration_pid
            1234
        end
        def host_role_helper(*args)
            @calls << args
            raise StandardError, 'fixture missing protected role' if @helper_failure
            return @prepared if args.first == 'migration-prepare'
            p = {'role'=>'live_migration','site'=>@prepared['site'],'host_uuid'=>@prepared['host_uuid'],'generation'=>@prepared['generation'],'interface'=>@prepared['interface'],'vm_uuid'=>self['uuid'],'process_id'=>1234,'local'=>'10.200.20.72:49152','remote'=>'10.200.20.73:49153','state'=>'NATIVE_QEMU_MIGRATION_SOCKET_READBACK_NOT_COMPLETION','observed_at'=>Time.now.utc.iso8601(9)}
            p.merge(@socket || {})
        end
    end
    def test_flags_bind_prepared_host_transport
        d = Domain.new
        assert_equal '--migrateuri tcp://10.200.20.73 --listen-address 10.200.20.73', d.protected_migration_options('dc3','--persistent','--compressed')
        assert_equal [['migration-prepare','dc3']], d.calls
    end
    def test_overrides_fail_before_admission_or_effect
        %w[--migrateuri=tcp://172.17.60.73 --listen-address=172.17.60.73 --disks-uri=tcp://172.17.60.73 --tunnelled --p2p --xml=/tmp/foreign].each do |flag|
            d = Domain.new
            assert_raises(StandardError) { d.protected_migration_options('dc3',flag,'') }
            assert_empty d.calls
        end
    end
    def test_missing_wrong_stale_owner_response_rejected
        [{'role'=>'management'}, {'target_host'=>'dc4'}, {'migration_uri'=>'tcp://172.17.60.73'}, {'listen_address'=>'172.17.60.73'}, {'state'=>'VERIFIED'}, {'generation'=>''}, {'extra'=>'foreign'}].each do |change|
            d = Domain.new; d.prepared.merge!(change)
            assert_raises(StandardError) { d.protected_migration_options('dc3','','') }
        end
        d = Domain.new; d.helper_failure = true
        assert_raises(StandardError) { d.protected_migration_options('dc3','','') }
    end
    def test_valid_socket_still_does_not_claim_completion
        d = Domain.new; d.protected_migration_options('dc3','','')
        native = [0,'native result','']
        _out, _err = capture_io { assert_same native, d.observe_protected_migration('dc3') { native } }
        assert_equal 'NATIVE_SOCKET_READBACK_NOT_MIGRATION_COMPLETION', d.migration_host_network_evidence['scope']
    end
    def test_missing_foreign_stale_socket_never_triggers_target_cleanup
        [{'role'=>'backup_replication'}, {'vm_uuid'=>'15c87e00-f1fa-4c00-aa01-000000000002'}, {'process_id'=>999}, {'generation'=>'stale'}, {'interface'=>'br-mgmt'}, {'local'=>'172.17.60.72:49152'}, {'remote'=>'172.17.60.73:49153'}, {'observed_at'=>'2026-01-01T00:00:00Z'}].each do |change|
            d = Domain.new; d.socket = change; d.protected_migration_options('dc3','','')
            native = [0,'already migrated','']
            capture_io { assert_same native, d.observe_protected_migration('dc3') { native } }
            assert_nil d.migration_host_network_evidence['socket']
            assert_equal 'SOCKET_UNVERIFIED_DO_NOT_QUALIFY_OR_REPLAY', d.migration_host_network_evidence['scope']
        end
    end
end
