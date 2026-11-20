#!/usr/bin/env ruby
# Local Ruby protocol regression only. No native service, SSH, or VM operation.
require 'json'
require 'timeout'
require 'tempfile'
require 'stringio'

root = File.expand_path('../..', __dir__)
$LOAD_PATH.unshift(File.join(root, 'src/mad/ruby'))
require 'ActionManager'
require 'DriverExecHelper'
require 'OpenNebulaDriver'

checks = []
assert = lambda do |name, condition|
  raise name unless condition
  checks << name
end

class CorrelationHarness < ActionManager
  include DriverExecHelper
  attr_reader :ready, :complete, :release

  def initialize
    super(2, true)
    @send_mutex = Mutex.new
    @ready, @complete, @release = Queue.new, Queue.new, Queue.new
    register_action(:MIGRATE, method(:migration))
  end

  def migration(id, label)
    @ready << label
    @release.pop if label == 'A'
    send_message(:LOG, 'I', id, label)
    send_message(:MIGRATE, 'SUCCESS', id, label)
    @complete << label
  end
end

context = lambda do |token, id = '53'|
  { :header => "ONE_DRS_REQUEST=#{token}".freeze,
    :action => :MIGRATE, :id => id.freeze }.freeze
end

output = Tempfile.new('onedrs-driver-context')
original_stdout = STDOUT.dup
listener = nil
begin
  STDOUT.reopen(output)
  harness = CorrelationHarness.new
  listener = Thread.new { harness.start_listener }
  Timeout.timeout(10) do
    harness.trigger_action_with_context(:MIGRATE, 53, context.call('a' * 64), '53', 'A')
    assert.call('old_request_started', harness.ready.pop == 'A')
    harness.trigger_action_with_context(:MIGRATE, 53, context.call('b' * 64), '53', 'B')
    assert.call('new_request_started_same_vm', harness.ready.pop == 'B')
    assert.call('new_request_completes_before_old', harness.complete.pop == 'B')
    harness.release << true
    assert.call('old_request_completes_after_new', harness.complete.pop == 'A')
    harness.trigger_action(:MIGRATE, 53, '53', 'legacy')
    assert.call('legacy_request_completed', harness.complete.pop == 'legacy')
    harness.trigger_action(:FINALIZE, -1)
    listener.join
  end
  STDOUT.flush
  output.rewind
  lines = output.read.lines.map(&:strip)
  assert.call('old_reply_keeps_original_identity',
              lines.include?("MIGRATE SUCCESS 53 ONE_DRS_REQUEST=#{'a' * 64} A"))
  assert.call('new_reply_keeps_new_identity',
              lines.include?("MIGRATE SUCCESS 53 ONE_DRS_REQUEST=#{'b' * 64} B"))
  assert.call('untagged_request_does_not_inherit_context', lines.include?('MIGRATE SUCCESS 53 legacy'))
  assert.call('logs_are_not_response_acknowledgements',
              lines.grep(/^LOG /) == ['LOG I 53 B', 'LOG I 53 A', 'LOG I 53 legacy'])

  Thread.current[:one_drs_request] = context.call('c' * 64)
  begin
    harness.send(:invoke_action, {
      :one_drs_request => context.call('d' * 64), :args => [],
      :method => proc { raise ArgumentError, 'expected fixture exception' }
    })
  rescue ArgumentError => error
    assert.call('worker_exception_is_preserved', error.message == 'expected fixture exception')
  end
  assert.call('worker_context_is_restored_on_exception',
              Thread.current[:one_drs_request][:header] == "ONE_DRS_REQUEST=#{'c' * 64}")
  Thread.current[:one_drs_request] = nil
ensure
  listener.kill if listener&.alive?
  Thread.current[:one_drs_request] = nil
  STDOUT.reopen(original_stdout)
  original_stdout.close
  output.close!
end

# Exercise the real input loop without launching its action workers.
driver = OpenNebulaDriver.allocate
driver.instance_variable_set(:@captured, [])
driver.instance_variable_set(:@refused, [])
def driver.trigger_action_with_context(*args)
  @captured << args
end
def driver.log(*args)
  @refused << args
end
def driver.exit!(_code)
  raise EOFError
end
original_stdin = STDIN
begin
  Object.send(:remove_const, :STDIN)
  Object.const_set(:STDIN, StringIO.new([
    "MIGRATE 53 ONE_DRS_REQUEST=#{'a' * 64} payloadA",
    'MIGRATE 53 legacyPayload',
    'MIGRATE 53 ONE_DRS_REQUEST=short payload',
    "MIGRATE 53 ONE_DRS_REQUEST=#{'A' * 64} payload"
  ].join("\n") + "\n"))
  begin
    driver.send(:loop)
  rescue EOFError
    # End of the in-memory fixture; no process exit or command execution.
  end
ensure
  Object.send(:remove_const, :STDIN)
  Object.const_set(:STDIN, original_stdin)
end
captured = driver.instance_variable_get(:@captured)
assert.call('input_loop_queues_only_valid_or_legacy_actions', captured.size == 2)
assert.call('input_loop_strips_identity_before_action_arguments', captured[0][3..-1] == ['53', 'payloadA'])
assert.call('input_loop_binds_immutable_action_context',
            captured[0][2].frozen? && captured[0][2][:header] == "ONE_DRS_REQUEST=#{'a' * 64}")
assert.call('input_loop_keeps_legacy_arguments', captured[1][2].nil? && captured[1][3..-1] == ['53', 'legacyPayload'])
assert.call('input_loop_refuses_malformed_identities', driver.instance_variable_get(:@refused).size == 2)
puts JSON.pretty_generate({ :scope => 'LOCAL_RUBY_PROTOCOL_ONLY', :status => 'PASS',
                            :checks => checks, :count => checks.size })
