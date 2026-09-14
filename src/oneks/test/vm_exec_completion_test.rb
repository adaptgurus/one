# frozen_string_literal: true

require 'base64'
require 'minitest/autorun'
require 'timeout'

module OpenNebula
  def self.is_error?(_value)
    false
  end

  module DocumentServer
    module OneHelper
    end
  end
end

require_relative '../../ods/lib/helpers/one/vm'

class VMExecCompletionTest < Minitest::Test
  class FakeVM
    attr_reader :info_calls

    def initialize
      @info_calls = 0
    end

    def info(_refresh = false)
      @info_calls += 1
      true
    end

    def to_hash
      {
        'VM' => {
          'TEMPLATE' => {
            'QEMU_GA_EXEC' => {
              'COMMAND' => '/usr/bin/true',
              'STATUS' => 'DONE',
              'RETURN_CODE' => '0',
              'STDOUT' => '',
              'STDERR' => ''
            }
          }
        }
      }
    end

    def lcm_state_str
      @info_calls < 2 ? 'HOTPLUG' : 'RUNNING'
    end
  end

  def test_terminal_guest_command_waits_for_running_lcm_state
    vm = FakeVM.new
    result = OpenNebula::DocumentServer::OneHelper::VirtualMachine.send(
      :wait_exec, vm, '/usr/bin/true', 3
    )

    assert_equal 'DONE', result[:status]
    assert_operator vm.info_calls, :>=, 3
  end
end
