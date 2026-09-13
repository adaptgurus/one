# frozen_string_literal: true

require 'shellwords'

module OneKS

    # Reconciles worker-local VM disks. Application PVCs are deliberately out of
    # scope: they remain independently owned by CSI/storage backends.
    module WorkerDiskManager

        DEFAULT_THRESHOLD = 70
        DEFAULT_INCREMENT_GIB = 30
        DEFAULT_COOLDOWN_SECONDS = 300
        DEFAULT_ROOT_MAX_GIB = 1024
        MAX_DATA_DISKS = 8
        DATA_TARGETS = %w[vdb vdc vdd vde vdf vdg vdh vdi].freeze
        NAME_PATTERN = /\A[a-z][a-z0-9-]{0,30}\z/
        FILESYSTEMS = %w[xfs ext4].freeze
        MOUNT_BASE = '/var/lib/layersentry/disks'

        class << self

            def normalize(policy)
                policy = policy.transform_keys(&:to_sym)
                enabled = policy[:enabled] == true
                threshold = Integer(policy.fetch(:threshold_percent, DEFAULT_THRESHOLD))
                increment = Integer(policy.fetch(:increment_gib, DEFAULT_INCREMENT_GIB))
                cooldown = Integer(policy.fetch(:cooldown_seconds, DEFAULT_COOLDOWN_SECONDS))
                root_max = Integer(policy.fetch(:root_max_gib, DEFAULT_ROOT_MAX_GIB))
                disks = Array(policy[:data_disks])

                raise ArgumentError, 'disk threshold must be 1..95 percent' unless (1..95).cover?(threshold)
                raise ArgumentError, 'disk increment must be 1..1024 GiB' unless (1..1024).cover?(increment)
                raise ArgumentError, 'disk cooldown must be 30..86400 seconds' unless (30..86_400).cover?(cooldown)
                raise ArgumentError, 'root maximum must be at least 4 GiB' if root_max < 4
                raise ArgumentError, "at most #{MAX_DATA_DISKS} managed data disks are supported" if disks.length > MAX_DATA_DISKS

                seen = {}
                normalized_disks = disks.each_with_index.map do |raw, index|
                    disk = raw.transform_keys(&:to_sym)
                    name = disk[:name].to_s
                    raise ArgumentError, "invalid managed disk name #{name.inspect}" unless NAME_PATTERN.match?(name)
                    raise ArgumentError, "duplicate managed disk name #{name}" if seen[name]

                    seen[name] = true
                    initial = Integer(disk.fetch(:initial_gib, DEFAULT_INCREMENT_GIB))
                    maximum = Integer(disk.fetch(:max_gib, [initial, DEFAULT_ROOT_MAX_GIB].max))
                    filesystem = disk.fetch(:filesystem, 'xfs').to_s
                    raise ArgumentError, 'managed disk initial size must be >= 1 GiB' if initial < 1
                    raise ArgumentError, 'managed disk maximum must be >= initial size' if maximum < initial
                    raise ArgumentError, "unsupported managed disk filesystem #{filesystem}" unless FILESYSTEMS.include?(filesystem)

                    {
                        :name => name,
                        :initial_gib => initial,
                        :max_gib => maximum,
                        :filesystem => filesystem,
                        :target => DATA_TARGETS.fetch(index),
                        :mount => File.join(MOUNT_BASE, name)
                    }
                end

                {
                    :enabled => enabled,
                    :threshold_percent => threshold,
                    :increment_gib => increment,
                    :cooldown_seconds => cooldown,
                    :root_max_gib => root_max,
                    :data_disks => normalized_disks
                }
            rescue KeyError, ArgumentError, TypeError => e
                OpenNebula::Error.new(
                    "Invalid worker disk autoscaling policy: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            def vm_status(client, vm_id, policy)
                vm = OneHelper::VirtualMachine.get(client, vm_id)
                return vm if OpenNebula.is_error?(vm)

                raw_disks = vm.to_hash.dig('VM', 'TEMPLATE', 'DISK')
                template_disks = raw_disks.is_a?(Array) ? raw_disks : [raw_disks].compact
                mounts = managed_mounts(policy)
                usage = guest_usage(client, vm_id, mounts.map {|entry| entry[:mount] })
                return usage if OpenNebula.is_error?(usage)

                rows = mounts.map do |managed|
                    disk = locate_disk(template_disks, managed)
                    stat = usage[managed[:mount]] || {}
                    current_mib = disk && Integer(disk['SIZE'] || 0)
                    capacity_mib = stat[:capacity_kib] && (stat[:capacity_kib] / 1024.0)
                    {
                        :name => managed[:name],
                        :mount => managed[:mount],
                        :disk_id => disk && Integer(disk['DISK_ID']),
                        :target => disk && disk['TARGET'],
                        :current_size_mib => current_mib,
                        :guest_capacity_mib => capacity_mib && capacity_mib.round,
                        :used_percent => stat[:used_percent],
                        :max_size_mib => managed[:max_gib] * 1024,
                        :guest_caught_up => caught_up?(capacity_mib, current_mib),
                        :present => !disk.nil? && !stat.empty?
                    }
                end

                { :vm_id => vm_id.to_i, :disks => rows }
            rescue StandardError => e
                OpenNebula::Error.new(
                    "Worker disk status failed for VM #{vm_id}: #{e.message}",
                    OpenNebula::Error::EACTION
                )
            end

            def resize(client, vm_id, disk_id, new_size_mib)
                vm = OneHelper::VirtualMachine.get(client, vm_id)
                return vm if OpenNebula.is_error?(vm)

                rc = vm.disk_resize(Integer(disk_id), Integer(new_size_mib))
                return rc if OpenNebula.is_error?(rc)

                true
            rescue ArgumentError, TypeError => e
                OpenNebula::Error.new(
                    "Invalid disk resize request: #{e.message}", OpenNebula::Error::EACTION
                )
            end

            def managed_mounts(policy)
                [{ :name => 'root', :mount => '/', :disk_id => 0,
                   :max_gib => policy[:root_max_gib] }] + Array(policy[:data_disks])
            end

            def locate_disk(disks, managed)
                return disks.find {|disk| disk['DISK_ID'].to_i.zero? } if managed[:name] == 'root'

                disks.find do |disk|
                    disk['LAYERSENTRY_DISK'].to_s == managed[:name] ||
                        disk['TARGET'].to_s == managed[:target]
                end
            end

            def guest_usage(client, vm_id, mounts)
                command = "LC_ALL=C df -Pk #{mounts.map {|mount| Shellwords.escape(mount) }.join(' ')}"
                rc = OneHelper::VirtualMachine.exec(client, vm_id, command, :timeout => 30)
                return rc if OpenNebula.is_error?(rc)

                rc[:stdout].to_s.lines.drop(1).each_with_object({}) do |line, result|
                    fields = line.strip.split
                    next if fields.length < 6

                    mount = fields[-1]
                    result[mount] = {
                        :capacity_kib => Integer(fields[1]),
                        :used_kib => Integer(fields[2]),
                        :used_percent => Integer(fields[4].delete('%'))
                    }
                rescue ArgumentError
                    next
                end
            end

            def caught_up?(capacity_mib, current_mib)
                return false if capacity_mib.nil? || current_mib.nil? || current_mib <= 0

                capacity_mib >= current_mib * 0.85
            end

        end

    end

end
