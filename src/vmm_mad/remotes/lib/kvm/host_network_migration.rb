# LayerSentry protected host-role admission inside the native migration owner.
# This module does not place VMs or execute a second migration workflow.
require 'json'
require 'ipaddr'
require 'open3'
require 'shellwords'
require 'time'

module VirtualMachineManagerKVM
    module HostNetworkMigration
        HELPER = '/usr/libexec/layersentry-host-network-role'.freeze
        UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/
        IDENTITY = /\A[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}\z/
        attr_reader :migration_host_network_evidence

        def host_role_helper(*args)
            out, _err, rc = Open3.capture3('/usr/bin/sudo', '-n', '--', HELPER, *args)
            raise StandardError, 'Protected native migration role admission failed' unless rc.success?
            raise StandardError, 'Oversized native migration role evidence' if out.bytesize > 65536
            JSON.parse(out)
        end

        def approved_migration_transport(host)
            raise StandardError, 'Invalid protected migration target' unless IDENTITY.match?(host)
            p = host_role_helper('migration-prepare', host)
            required = %w[role site host_uuid generation source_address interface target_host
                          target_address migration_uri listen_address state]
            unless p.is_a?(Hash) && p.keys.sort == required.sort &&
                   p['role'] == 'live_migration' && p['target_host'] == host &&
                   UUID.match?(p['host_uuid'].to_s) && IDENTITY.match?(p['site'].to_s) &&
                   IDENTITY.match?(p['generation'].to_s) &&
                   /\A[a-zA-Z0-9][a-zA-Z0-9_.-]{0,14}\z/.match?(p['interface'].to_s) &&
                   p['state'] == 'HOST_ROLE_PREPARED_NOT_MIGRATION_OR_SOCKET_PROOF'
                raise StandardError, 'Invalid protected native migration role response'
            end
            source = IPAddr.new(p['source_address'])
            target = IPAddr.new(p['target_address'])
            unless source.ipv4? && target.ipv4? && source.private? && target.private? &&
                   source.to_s == p['source_address'] && target.to_s == p['target_address'] &&
                   source != target && p['migration_uri'] == "tcp://#{target}" &&
                   p['listen_address'] == target.to_s
                raise StandardError, 'Invalid approved migration transport address'
            end
            p
        rescue JSON::ParserError, IPAddr::InvalidAddressError, TypeError
            raise StandardError, 'Invalid protected native migration role response'
        end

        def protected_migration_options(host, global, per_vm)
            # Repeated transport overrides could defeat the admitted destination.
            words = Shellwords.split("#{global} #{per_vm}")
            forbidden = %w[--migrateuri --listen-address --disks-uri --desturi --tunnelled
                           --p2p --direct --tls-destination --xml --persistent-xml]
            if words.any? { |w| forbidden.include?(w.split('=', 2).first) || !w.start_with?('--') && w.include?('://') }
                raise StandardError, 'Migration transport override conflicts with protected host role'
            end
            p = approved_migration_transport(host)
            @migration_host_network_evidence = {'prepared' => p, 'scope' => 'PREPARED_NOT_SOCKET_OR_COMPLETION_PROOF'}
            "--migrateuri #{Shellwords.escape(p['migration_uri'])} --listen-address #{Shellwords.escape(p['listen_address'])}"
        rescue ArgumentError
            raise StandardError, 'Invalid native migration options'
        end

        def native_migration_pid
            path = "/run/libvirt/qemu/#{@domain}.pid"
            info = File.lstat(path)
            raise StandardError, 'Unsafe native QEMU pid file' unless info.file? && info.uid == 0 && info.nlink == 1 && info.size <= 64
            Integer(File.read(path).strip, 10)
        end

        def fresh_migration_socket_proof?(proof, started)
            observed = Time.iso8601(proof.fetch('observed_at'))
            observed >= started && observed <= Time.now.utc
        rescue KeyError, ArgumentError, TypeError
            false
        end

        def observe_protected_migration(host)
            uuid = self['/domain/uuid'].to_s.strip
            raise StandardError, 'Exact native VM UUID required for migration observation' unless UUID.match?(uuid)
            raise StandardError, 'Invalid native domain identity' unless /\Aone-[0-9]+\z/.match?(@domain)
            pid = native_migration_pid
            started = Time.now.utc
            raise StandardError, 'Invalid native QEMU process identity' unless pid > 1
            watcher = Thread.new do
                begin
                    host_role_helper('migration-watch', host, uuid, pid.to_s, '120')
                rescue StandardError
                    nil
                end
            end
            result = yield
            proof = watcher.value
            prepared = @migration_host_network_evidence.fetch('prepared')
            unless proof.is_a?(Hash) && proof['role'] == 'live_migration' &&
                   proof['vm_uuid'] == uuid && proof['process_id'] == pid &&
                   proof['host_uuid'] == prepared['host_uuid'] &&
                   proof['site'] == prepared['site'] && proof['generation'] == prepared['generation'] &&
                   proof['interface'] == prepared['interface'] &&
                   proof['local'].to_s.start_with?(prepared['source_address'] + ':') &&
                   proof['remote'].to_s.start_with?(prepared['target_address'] + ':') &&
                   proof['state'] == 'NATIVE_QEMU_MIGRATION_SOCKET_READBACK_NOT_COMPLETION' &&
                   fresh_migration_socket_proof?(proof, started)
                proof = nil
            end
            @migration_host_network_evidence['socket'] = proof
            @migration_host_network_evidence['scope'] = proof ? 'NATIVE_SOCKET_READBACK_NOT_MIGRATION_COMPLETION' : 'SOCKET_UNVERIFIED_DO_NOT_QUALIFY_OR_REPLAY'
            $stderr.puts('LS_HOST_NETWORK_MIGRATION ' + JSON.generate(@migration_host_network_evidence))
            # Preserve the native result. A missing proof after successful migration
            # must never trigger the owner's destructive target cleanup/retry path.
            result
        ensure
            watcher.join if watcher
        end
    end
end
