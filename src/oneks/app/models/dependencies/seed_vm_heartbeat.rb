# frozen_string_literal: true

module OneKS
  # Persists bootstrap progress observed through OneGate updates. The seed still
  # owns its native CAPI work; this module only records diagnostics/heartbeat
  # timestamps in the existing dependency document.
  module SeedVMHeartbeat
    def create(group)
      @opts[:bootstrap_started_at] ||= Time.now.to_i
      @opts[:last_heartbeat_at] = Time.now.to_i
      @opts[:last_state] ||= 'SEED_CREATING'
      @opts[:timed_out] = false
      @opts.delete(:last_error)
      rc = super
      if OpenNebula.is_error?(rc)
        record_bootstrap_observation(group, @opts[:last_state], :error => rc.message)
      elsif @id
        current = seed_state(group.client)
        if OpenNebula.is_error?(current)
          record_bootstrap_observation(group, 'SEED_CREATED', :error => current.message)
        else
          record_bootstrap_observation(group, current || 'SEED_CREATED')
        end
      end
      rc
    rescue StandardError => e
      record_bootstrap_observation(
        group, @opts[:last_state] || 'SEED_CREATING', :error => e.message
      )
      OpenNebula::Error.new(
        "VM seed creation failed: #{e.message}", OpenNebula::Error::EACTION
      )
    end

    def wait_create(group, stop_flag)
      result = wait_seed_state_with_heartbeat(group, self.class::READY_STATE, stop_flag)
      if OpenNebula.is_error?(result)
        record_bootstrap_observation(
          group,
          @opts[:last_state] || 'UNKNOWN',
          :error => result.message,
          :timed_out => result.message.to_s.include?('timed out')
        )
      end
      result
    rescue StandardError => e
      record_bootstrap_observation(
        group, @opts[:last_state] || 'UNKNOWN', :error => e.message
      )
      OpenNebula::Error.new(
        "Monitoring of seed VM failed: #{e.message}", OpenNebula::Error::EACTION
      )
    end

    private

    def wait_seed_state_with_heartbeat(group, target, stop_flag)
      return OpenNebula::Error.new(
        'Seed VM ID cannot be nil', OpenNebula::Error::EACTION
      ) if @id.nil?

      current = seed_state(group.client)
      return current if OpenNebula.is_error?(current)
      record_bootstrap_observation(group, current || 'UNKNOWN')
      return true if current == target

      if current.to_s.include?('FAILURE')
        return OpenNebula::Error.new(
          "Seed VM #{@id} entered failure state: #{current}",
          OpenNebula::Error::EACTION
        )
      end

      Log.info(
        self.class::COMP,
        "Waiting for Seed VM (ID=#{@id}) to provision the ControlPlane",
        group.cluster_id
      )

      ODS::EventSubscriber.subscribe_for(
        self.class::VM_API_UPDATE,
        :timeout => @creation_timeout,
        :stop_flag => stop_flag
      ) do |xml|
        event_vm_id = xml.at_xpath("//PARAMETER[POSITION='2' and TYPE='IN']/VALUE")&.text
        event_vm_id ||= xml.at_xpath("//PARAMETER[POSITION='2']/VALUE")&.text
        next unless event_vm_id&.match?(/\A\d+\z/)
        next unless event_vm_id.to_i == @id

        current = seed_state(group.client)
        if OpenNebula.is_error?(current)
          return OpenNebula::Error.new(
            "VM #{@id} ONEKS_STATE read failed: #{current.message}",
            OpenNebula::Error::EACTION
          )
        end

        record_bootstrap_observation(group, current || 'UNKNOWN')
        Log.info(self.class::COMP, "Seed VM entered state #{current}", group.cluster_id)

        return true if current == target
        if current.to_s.include?('FAILURE')
          return OpenNebula::Error.new(
            "Seed VM #{@id} entered failure state: #{current}",
            OpenNebula::Error::EACTION
          )
        end
      end
    end

    def record_bootstrap_observation(group, state, error: nil, timed_out: false)
      now = Time.now.to_i
      @opts[:bootstrap_started_at] ||= now
      @opts[:last_heartbeat_at] = now
      @opts[:last_state] = state.to_s
      @opts[:timed_out] = !!timed_out
      if error.nil? || error.to_s.empty?
        @opts.delete(:last_error)
      else
        @opts[:last_error] = error.to_s[0, 512]
      end

      # The dependency object lives inside the group document. Persist every
      # observed OneGate update so API status survives server restart.
      rc = group.update
      Log.warning(
        self.class::COMP,
        "Unable to persist seed heartbeat: #{rc.message}",
        group.cluster_id
      ) if OpenNebula.is_error?(rc)
      rc
    rescue StandardError => e
      Log.warning(
        self.class::COMP,
        "Unable to persist seed heartbeat: #{e.message}",
        group.cluster_id
      )
      nil
    end
  end

  SeedVM.prepend(SeedVMHeartbeat)
end
