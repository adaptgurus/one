# frozen_string_literal: true
require 'erb'
require 'yaml'
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require 'active_support/core_ext/string/indent'

class LayerSentryProfileTest < Minitest::Test
  ROOT = File.expand_path('../specs', __dir__)
  def render(type, inputs = {})
    cluster = { id: 900, uuid: 'p1-test', kubernetes_version: 'v1.36.4',
                deployment: { sched_requirements: 'CLUSTER_ID = 0',
                  networks: { public: {name: 'public'}, private: {name: 'private'} } } }
    group = {id: 901, uuid: 'p1-workers', type: 'CONTROLPLANE',
             router_template_name: 'p1-router', group_template_name: 'p1-node',
             user_inputs_values: { count: 1, cpu: 2, vcpu: 2, memory: 4096, disk_size: 16384,
               node_image_id: 7, router_image_id: 8, router_vmgroup_id: 9,
               system_datastore_id: 4 }.merge(inputs)}
    one_auth = 'test:fixture-only'
    one_xmlrpc = 'http://169.254.16.9:2633/RPC2'
    dir = File.join(ROOT, type, 'layersentry-poc')
    templates = Dir[File.join(dir, 'templates', '*.erb')].to_h do |path|
      [File.basename(path, '.erb').to_sym, ERB.new(File.read(path)).result(binding)]
    end
    documents = YAML.load_stream(ERB.new(File.read(File.join(dir, 'spec.erb'))).result(binding))
    [documents.to_h { |d| [d.fetch('kind'), d] }, templates]
  end
  def test_stable_endpoint_and_two_router_members
    docs, templates = render('controlplanes')
    router = docs.fetch('ONECluster').fetch('spec').fetch('virtualRouter')
    assert_equal 2, router.fetch('replicas')
    assert_equal [6443, 9345], router.fetch('listenerPorts')
    cp = docs.fetch('RKE2ControlPlane').fetch('spec')
    assert_equal 'control-plane-endpoint', cp.fetch('registrationMethod')
    assert_equal 'v1.36.4+rke2r1', cp.fetch('version')
    assert_includes cp.fetch('preRKE2Commands').join, 'provider-id=one://%s'
    assert_includes cp.fetch('preRKE2Commands').join, 'disable: [servicelb,'
    refute_includes cp.fetch('preRKE2Commands').find { |c| c.include?('disable: [') }, 'rke2-coredns'
    refute_includes docs.to_s, 'cloudProviderName'
    refute docs.key?('ClusterResourceSet')
    refute docs.fetch('ONECluster').fetch('spec').key?('images')
    assert_includes templates[:router], 'VMGROUP_ID = "9"'
    assert_includes templates[:router], 'ROLE = "endpoints"'
    assert_includes templates[:controlplane], 'IMAGE_ID = "7"'
    assert_includes templates[:controlplane], 'FEATURES = [ GUEST_AGENT = "YES" ]'
    templates.each_value { |t| assert_includes t, 'SCHED_DS_REQUIREMENTS = "ID = 4"' }
  end
  def test_worker_identity_and_version
    docs, templates = render('nodegroups')
    cmds = docs.fetch('RKE2ConfigTemplate').dig('spec', 'template', 'spec', 'preRKE2Commands')
    assert_includes cmds.join, 'provider-id=one://%s'
    assert_equal 'v1.36.4+rke2r1', docs.fetch('MachineDeployment').dig('spec', 'template', 'spec', 'version')
    assert_includes templates[:node], 'VMID = "$VMID"'
    assert_includes templates[:node], 'FEATURES = [ GUEST_AGENT = "YES" ]'
    refute_includes docs.to_s, 'cloudProviderName'
  end
  def test_remediation_preserves_the_only_control_plane
    docs, = render('controlplanes', count: 1)
    refute docs.key?('MachineHealthCheck'), 'a singleton must not lose its only etcd member to remediation'
    docs, = render('controlplanes', count: 3)
    health = docs.fetch('MachineHealthCheck').fetch('spec')
    assert_equal '60m', health.fetch('nodeStartupTimeout')
    assert_equal 1, health.fetch('maxUnhealthy')
    assert_equal %w[False Unknown], health.fetch('unhealthyConditions').map { |c| c.fetch('status') }
  end
  def test_image_and_placement_injection_rejected
    [:node_image_id, :router_image_id, :router_vmgroup_id, :system_datastore_id].each do |key|
      assert_raises(ArgumentError) { render('controlplanes', key => '1"\nCPU="99') }
    end
  end
  def test_nested_controller_grace_keeps_leader_election_enabled
    docs, = render('controlplanes')
    command = docs['RKE2ControlPlane']['spec']['preRKE2Commands'].find { |c| c.include?('95-poc-leader-grace.yaml') }
    Dir.mktmpdir do |dir|
      _, err, status = Open3.capture3('/bin/sh', '-c', command.gsub('/etc/rancher/rke2/config.yaml.d', dir))
      assert status.success?, err
      config = YAML.load_file(File.join(dir, '95-poc-leader-grace.yaml'))
      %w[kube-scheduler-arg kube-controller-manager-arg kube-cloud-controller-manager-arg].each do |component|
        assert_equal %w[leader-elect-lease-duration=60s leader-elect-renew-deadline=40s leader-elect-retry-period=10s], config.fetch(component)
      end
      refute_includes config.to_s, 'leader-elect=false'
    end
  end
  def test_nested_runtime_timeout_configuration
    %w[controlplanes nodegroups].each do |type|
      docs, = render(type)
      config = type == 'controlplanes' ? docs['RKE2ControlPlane']['spec'] : docs['RKE2ConfigTemplate'].dig('spec', 'template', 'spec')
      command = config['preRKE2Commands'].find { |c| c.include?('runtimeRequestTimeout') }
      Dir.mktmpdir do |dir|
        script = command.gsub('/var/lib/rancher/rke2/agent/etc/kubelet.conf.d', dir)
        _, err, status = Open3.capture3('/bin/sh', '-c', script)
        assert status.success?, err
        parsed = YAML.load_file(File.join(dir, '90-layersentry-poc.conf'))
        assert_equal 'KubeletConfiguration', parsed['kind']
        assert_equal '30m', parsed['runtimeRequestTimeout']
      end
    end
  end
  def test_archive_mtime_survives_second_precision_cache_without_content_changes
    %w[controlplanes nodegroups].each do |type|
      docs, = render(type)
      config = type == 'controlplanes' ? docs['RKE2ControlPlane']['spec'] : docs['RKE2ConfigTemplate'].dig('spec', 'template', 'spec')
      command = config['preRKE2Commands'].find { |c| c.include?('touch -m -d') }
      Dir.mktmpdir do |dir|
        path = File.join(dir, 'fixture.tar.zst')
        File.write(path, 'verified archive fixture')
        stamp = Time.at(1_789_000_000, 250_000)
        File.utime(stamp, stamp, path)
        _, err, status = Open3.capture3('/bin/sh', '-c', command.gsub('/var/lib/rancher/rke2/agent/images', dir))
        assert status.success?, err
        assert_equal 0, File.mtime(path).nsec
        assert_equal stamp.to_i, File.mtime(path).to_i
        assert_equal 'verified archive fixture', File.read(path)
      end
    end
  end
  def test_duplicate_context_vmid_produces_valid_node_configuration
    %w[controlplanes nodegroups].each do |type|
      docs, = render(type)
      config = type == 'controlplanes' ? docs['RKE2ControlPlane']['spec'] : docs['RKE2ConfigTemplate'].dig('spec', 'template', 'spec')
      command = config['preRKE2Commands'].find { |c| c.include?('provider-id=one://') }
      Dir.mktmpdir do |dir|
        env = File.join(dir, 'one_env')
        File.write(env, "export VMID=\"25\"\nexport VMID=\"25\"\n")
        script = command.gsub('/var/run/one-context/one_env', env).gsub('/etc/rancher/rke2/config.yaml.d', dir)
        _, err, status = Open3.capture3('/bin/sh', '-c', script)
        assert status.success?, err
        parsed = YAML.load_file(File.join(dir, '90-opennebula-identity.yaml'))
        assert_equal ['provider-id=one://25'], parsed['kubelet-arg']
        File.write(env, "export VMID=\"25\"\nexport VMID=\"26\"\n")
        _, _, status = Open3.capture3('/bin/sh', '-c', script)
        refute status.success?, 'ambiguous VM identity accepted'
      end
    end
  end
end
