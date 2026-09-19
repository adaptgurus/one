# frozen_string_literal: true
require 'erb'
require 'yaml'
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require 'active_support/core_ext/string/indent'

class LayerSentryProfileTest < Minitest::Test
  ROOT = File.expand_path('../specs', __dir__)
  CONFIG = File.expand_path('../etc/oneks-server.conf', __dir__)
  ARTIFACT_CACHE = 'http://10.10.10.140:8080'

  def setup
    @old_artifact_cache = ENV['ONEKS_RKE2_ARTIFACT_BASE_URL']
    ENV['ONEKS_RKE2_ARTIFACT_BASE_URL'] = ARTIFACT_CACHE
  end

  def teardown
    if @old_artifact_cache.nil?
      ENV.delete('ONEKS_RKE2_ARTIFACT_BASE_URL')
    else
      ENV['ONEKS_RKE2_ARTIFACT_BASE_URL'] = @old_artifact_cache
    end
  end

  def test_default_worker_disk_autoscaling_contract
    helper = File.read(File.expand_path('../lib/helpers/worker_disk_manager.rb', __dir__))
    assert_includes helper, 'DEFAULT_THRESHOLD = 70'
    assert_includes helper, 'DEFAULT_INCREMENT_GIB = 30'
    nodegroup = File.read(File.expand_path('../app/models/groups/nodegroup.rb', __dir__))
    assert_includes nodegroup, 'WorkerDiskManager.normalize(:enabled => true)'
  end

  def test_multi_cluster_resource_identity_and_global_disk_reconciler
    group_model = File.read(File.expand_path('../app/models/k8s_group.rb', __dir__))
    router_model = File.read(File.expand_path('../app/models/dependencies/cluster_router.rb', __dir__))
    lcm = File.read(File.expand_path('../app/services/cluster_lcm.rb', __dir__))

    assert_includes group_model, 'SecureRandom.hex(6)'
    assert_includes group_model, '"#{base_name}-group-#{id}-#{suffix}"'
    assert_includes router_model, '"#{cluster.uuid}-cp"'
    assert_includes lcm, 'OneKS::K8sGroupDocumentPool.new(:auth => @cloud_auth)'
    assert_includes lcm, 'pool.each do |group|'
    assert_includes lcm, 'group.reconcile_disk_autoscaling'
  end

  def test_server_uses_selinux_labeled_kubectl_wrapper
    assert_includes File.read(CONFIG), ":kubectl_path: '/usr/local/libexec/oneks/kubectl'"
  end

  def test_replica_contracts
    controlplane = YAML.safe_load(File.read(File.join(ROOT, 'controlplanes', 'layersentry-poc', 'controlplane.conf')))
    nodegroup = YAML.safe_load(File.read(File.join(ROOT, 'nodegroups', 'layersentry-poc', 'nodegroup.conf')))
    cp_count = controlplane.fetch('user_inputs').find { |input| input.fetch('name') == 'count' }
    worker_count = nodegroup.fetch('user_inputs').find { |input| input.fetch('name') == 'count' }
    assert_equal 11, cp_count.dig('match', 'values', 'max')
    assert_equal 60, worker_count.dig('match', 'values', 'max')
  end

  def render(type, inputs = {}, group_overrides = {})
    cluster = { id: 900, uuid: 'p1-test', kubernetes_version: 'v1.36.4',
                deployment: { sched_requirements: 'CLUSTER_ID = 0',
                  networks: { public: {name: 'public'}, private: {name: 'private'} } } }
    group = {id: 901, uuid: 'p1-workers', type: 'CONTROLPLANE',
             router_template_name: 'p1-router', group_template_name: 'p1-node',
             user_inputs_values: { count: 1, cpu: 2, vcpu: 2, memory: 4096, disk_size: 16384,
               node_image_id: 7, router_image_id: 8, router_vmgroup_id: 9,
               system_datastore_id: 4 }.merge(inputs)}
    group.merge!(group_overrides)
    one_auth = 'test:fixture-only'
    one_xmlrpc = 'http://169.254.16.9:2633/RPC2'
    artifact_base_url = ENV.fetch('ONEKS_RKE2_ARTIFACT_BASE_URL')
    dir = File.join(ROOT, type, 'layersentry-poc')
    templates = Dir[File.join(dir, 'templates', '*.erb')].to_h do |path|
      [File.basename(path, '.erb').to_sym, ERB.new(File.read(path)).result(binding)]
    end
    documents = YAML.load_stream(ERB.new(File.read(File.join(dir, 'spec.erb'))).result(binding))
    [documents.to_h { |d| [d.fetch('kind'), d] }, templates]
  end

  def test_artifact_cache_configuration_is_required
    saved = ENV.delete('ONEKS_RKE2_ARTIFACT_BASE_URL')
    assert_raises(KeyError) { render('controlplanes') }
  ensure
    ENV['ONEKS_RKE2_ARTIFACT_BASE_URL'] = saved || ARTIFACT_CACHE
  end

  def test_stable_endpoint_and_two_router_members
    docs, templates = render('controlplanes')
    router = docs.fetch('ONECluster').fetch('spec').fetch('virtualRouter')
    assert_equal 2, router.fetch('replicas')
    assert_equal [6443, 9345], router.fetch('listenerPorts')
    cp = docs.fetch('RKE2ControlPlane').fetch('spec')
    assert_equal true, cp.dig('agentConfig', 'airGapped')
    cp_commands = cp.fetch('preRKE2Commands').join("\n")
    assert_includes cp_commands, '/opt/install.sh'
    assert_includes cp_commands, '7bcbd3167d6947e1d79cdf722acdc740b28021fefb50dd5b974a1980776d4079'
    assert_includes cp_commands, 'curl -fsSL'
    assert_includes cp_commands, "base=\'#{ARTIFACT_CACHE}/v1.36.4%2Brke2r1\'"
    refute_includes cp_commands, 'wget '
    assert_includes cp_commands, 'sha256sum -c -'
    assert_includes cp_commands, '8988a2eff587dd88b8eab86fe719703e9541a1f08d22771a94cbec446a13db86'
    assert_includes cp_commands, '4359b651bfdec8f3bcc01b351b33a55ff21f06b18a767366db6f3800d5750871'
    refute_includes cp_commands, 'get.rke2.io'
    refute_includes cp_commands, 'github.com/rancher/rke2/releases'
    refute_includes cp_commands, 'raw.githubusercontent.com'
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
    assert_equal true, docs.fetch('RKE2ConfigTemplate').dig('spec', 'template', 'spec', 'agentConfig', 'airGapped')
    joined = cmds.join("\n")
    assert_includes joined, '/opt/rke2-artifacts/rke2.linux-amd64.tar.gz'
    assert_includes joined, '/usr/local/libexec/oneks/worker-disk'
    assert_includes joined, '8e12805c4bda79bec2fd20c89f705af3cb2ed11ea8854dc4937fca41b124b57a'
    assert_includes joined, 'curl -fsSL'
    assert_includes joined, "base=\'#{ARTIFACT_CACHE}/v1.36.4%2Brke2r1\'"
    refute_includes joined, 'wget '
    assert_includes joined, 'sha256sum -c -'
    assert_includes joined, '8988a2eff587dd88b8eab86fe719703e9541a1f08d22771a94cbec446a13db86'
    assert_includes joined, '4359b651bfdec8f3bcc01b351b33a55ff21f06b18a767366db6f3800d5750871'
    refute_includes joined, 'get.rke2.io'
    refute_includes joined, 'github.com/rancher/rke2/releases'
    refute_includes joined, 'raw.githubusercontent.com'
    assert_includes cmds.join, 'provider-id=one://%s'
    assert_equal 'v1.36.4+rke2r1', docs.fetch('MachineDeployment').dig('spec', 'template', 'spec', 'version')
    assert_includes templates[:node], 'VMID = "$VMID"'
    assert_includes templates[:node], 'FEATURES = [ GUEST_AGENT = "YES" ]'
    refute_includes docs.to_s, 'cloudProviderName'
  end
  def test_worker_local_disk_layout_is_rendered_in_template_and_bootstrap
    policy = { data_disks: [
      { name: 'data-a', initial_gib: 30, filesystem: 'xfs', target: 'vdb',
        mount: '/var/lib/layersentry/disks/data-a' },
      { name: 'data-b', initial_gib: 30, filesystem: 'xfs', target: 'vdc',
        mount: '/var/lib/layersentry/disks/data-b' }
    ] }
    docs, templates = render('nodegroups', {}, disk_autoscaling: policy)
    assert_includes templates[:node], 'LAYERSENTRY_DISK = "data-a"'
    assert_includes templates[:node], 'LAYERSENTRY_DISK = "data-b"'
    assert_equal 2, templates[:node].scan('FORMAT = "raw"').length
    assert_equal 2, templates[:node].scan('FS = "xfs"').length
    commands = docs.fetch('RKE2ConfigTemplate').dig('spec', 'template', 'spec', 'preRKE2Commands').join
    assert_includes commands, 'device=/dev/vdb'
    assert_includes commands, 'device=/dev/vdc'
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
