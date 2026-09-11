# frozen_string_literal: true

require 'erb'
require 'yaml'
require 'minitest/autorun'
require 'tmpdir'
require 'open3'
require 'active_support/core_ext/string/indent'

# Verifies the LayerSentry OneKS profile contract and generated native resources.
class LayerSentryProfileTest < Minitest::Test

    ROOT = File.expand_path('../specs', __dir__)

    def render(type, inputs = {})
        cluster = {
            :id => 900,
            :uuid => 'p1-test',
            :kubernetes_version => 'v1.36.4',
            :deployment => {
                :sched_requirements => 'CLUSTER_ID = 0',
                :networks => {
                    :public => { :name => 'public' },
                    :private => { :name => 'private' }
                }
            }
        }
        group = {
            :id => 901,
            :uuid => 'p1-workers',
            :type => 'CONTROLPLANE',
            :router_template_name => 'p1-router',
            :group_template_name => 'p1-node',
            :user_inputs_values => {
                :count => 1,
                :cpu => 2,
                :vcpu => 2,
                :memory => 4096,
                :disk_size => 16_384,
                :node_image_id => 7,
                :router_image_id => 8,
                :router_vmgroup_id => 9,
                :system_datastore_id => 4
            }.merge(inputs)
        }
        one_auth = 'test:fixture-only'
        one_xmlrpc = 'http://169.254.16.9:2633/RPC2'
        dir = File.join(ROOT, type, 'layersentry-poc')
        templates = Dir[File.join(dir, 'templates', '*.erb')].to_h do |path|
            [
                File.basename(path, '.erb').to_sym,
                ERB.new(File.read(path)).result(binding)
            ]
        end
        spec = File.read(File.join(dir, 'spec.erb'))
        documents = YAML.load_stream(ERB.new(spec).result(binding))

        [documents.to_h {|document| [document.fetch('kind'), document] }, templates]
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
        disabled = cp.fetch('preRKE2Commands').find {|command| command.include?('disable: [') }
        refute_includes disabled, 'rke2-coredns'
        refute_includes docs.to_s, 'cloudProviderName'
        refute docs.key?('ClusterResourceSet')
        refute docs.fetch('ONECluster').fetch('spec').key?('images')
        assert_includes templates[:router], 'VMGROUP_ID = "9"'
        assert_includes templates[:router], 'ROLE = "endpoints"'
        assert_includes templates[:controlplane], 'IMAGE_ID = "7"'
        templates.each_value do |template|
            assert_includes template, 'SCHED_DS_REQUIREMENTS = "ID = 4"'
        end
    end

    def test_worker_identity_and_version
        docs, templates = render('nodegroups')
        config = docs.fetch('RKE2ConfigTemplate').dig('spec', 'template', 'spec')
        cmds = config.fetch('preRKE2Commands')
        assert_includes cmds.join, 'provider-id=one://%s'

        deployment = docs.fetch('MachineDeployment').dig('spec', 'template', 'spec')
        assert_equal 'v1.36.4+rke2r1', deployment.fetch('version')
        assert_includes templates[:node], 'VMID = "$VMID"'
        refute_includes docs.to_s, 'cloudProviderName'
    end

    def test_remediation_preserves_the_only_control_plane
        docs, = render('controlplanes', :count => 1)
        message = 'a singleton must not lose its only etcd member to remediation'
        refute docs.key?('MachineHealthCheck'), message

        docs, = render('controlplanes', :count => 3)
        health = docs.fetch('MachineHealthCheck').fetch('spec')
        assert_equal '60m', health.fetch('nodeStartupTimeout')
        assert_equal 1, health.fetch('maxUnhealthy')
        statuses = health.fetch('unhealthyConditions').map do |condition|
            condition.fetch('status')
        end
        assert_equal ['False', 'Unknown'], statuses
    end

    def test_image_and_placement_injection_rejected
        keys = [
            :node_image_id,
            :router_image_id,
            :router_vmgroup_id,
            :system_datastore_id
        ]
        keys.each do |key|
            assert_raises(ArgumentError) do
                render('controlplanes', key => "1\"\nCPU=\"99")
            end
        end
    end

    def test_nested_controller_grace_keeps_leader_election_enabled
        docs, = render('controlplanes')
        commands = docs['RKE2ControlPlane']['spec']['preRKE2Commands']
        command = commands.find {|item| item.include?('95-poc-leader-grace.yaml') }

        Dir.mktmpdir do |dir|
            script = command.gsub('/etc/rancher/rke2/config.yaml.d', dir)
            _, err, status = Open3.capture3('/bin/sh', '-c', script)
            assert status.success?, err

            config = YAML.load_file(File.join(dir, '95-poc-leader-grace.yaml'))
            components = [
                'kube-scheduler-arg',
                'kube-controller-manager-arg',
                'kube-cloud-controller-manager-arg'
            ]
            leader_election = [
                'leader-elect-lease-duration=60s',
                'leader-elect-renew-deadline=40s',
                'leader-elect-retry-period=10s'
            ]
            components.each do |component|
                assert_equal leader_election, config.fetch(component)
            end
            refute_includes config.to_s, 'leader-elect=false'
        end
    end

    def test_nested_runtime_timeout_configuration
        ['controlplanes', 'nodegroups'].each do |type|
            docs, = render(type)
            config = profile_config(type, docs)
            command = config['preRKE2Commands'].find do |item|
                item.include?('runtimeRequestTimeout')
            end

            Dir.mktmpdir do |dir|
                script = command.gsub(
                    '/var/lib/rancher/rke2/agent/etc/kubelet.conf.d', dir
                )
                _, err, status = Open3.capture3('/bin/sh', '-c', script)
                assert status.success?, err

                parsed = YAML.load_file(File.join(dir, '90-layersentry-poc.conf'))
                assert_equal 'KubeletConfiguration', parsed['kind']
                assert_equal '30m', parsed['runtimeRequestTimeout']
            end
        end
    end

    def test_archive_mtime_survives_second_precision_cache_without_content_changes
        ['controlplanes', 'nodegroups'].each do |type|
            docs, = render(type)
            config = profile_config(type, docs)
            command = config['preRKE2Commands'].find do |item|
                item.include?('touch -m -d')
            end

            Dir.mktmpdir do |dir|
                path = File.join(dir, 'fixture.tar.zst')
                File.write(path, 'verified archive fixture')
                stamp = Time.at(1_789_000_000, 250_000)
                File.utime(stamp, stamp, path)
                script = command.gsub('/var/lib/rancher/rke2/agent/images', dir)
                _, err, status = Open3.capture3('/bin/sh', '-c', script)
                assert status.success?, err
                assert_equal 0, File.mtime(path).nsec
                assert_equal stamp.to_i, File.mtime(path).to_i
                assert_equal 'verified archive fixture', File.read(path)
            end
        end
    end

    def test_duplicate_context_vmid_produces_valid_node_configuration
        ['controlplanes', 'nodegroups'].each do |type|
            docs, = render(type)
            config = profile_config(type, docs)
            command = config['preRKE2Commands'].find do |item|
                item.include?('provider-id=one://')
            end

            Dir.mktmpdir do |dir|
                env = File.join(dir, 'one_env')
                File.write(env, "export VMID=\"25\"\nexport VMID=\"25\"\n")
                script = command.gsub('/var/run/one-context/one_env', env)
                script = script.gsub('/etc/rancher/rke2/config.yaml.d', dir)
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

    private

    def profile_config(type, docs)
        return docs['RKE2ControlPlane']['spec'] if type == 'controlplanes'

        docs['RKE2ConfigTemplate'].dig('spec', 'template', 'spec')
    end

end
