# -------------------------------------------------------------------------- #
# Copyright 2002-2026, OpenNebula Project, OpenNebula Systems                #
#                                                                            #
# Licensed under the Apache License, Version 2.0 (the "License"); you may    #
# not use this file except in compliance with the License. You may obtain    #
# a copy of the License at                                                   #
#                                                                            #
# http://www.apache.org/licenses/LICENSE-2.0                                 #
#                                                                            #
# Unless required by applicable law or agreed to in writing, software        #
# distributed under the License is distributed on an "AS IS" BASIS,          #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.   #
# See the License for the specific language governing permissions and        #
# limitations under the License.                                             #
#--------------------------------------------------------------------------- #

# Kubernetes Cluster LCM Service
module OneKS

    # Cluster LCM Service
    class ClusterLCM

        attr_reader :em, :group_pool

        COMP = 'LCM'

        include Singleton

        def configure(cloud_auth, opts = {})
            @cloud_auth   = cloud_auth
            @conf         = SERVER_CONF.merge(opts)
            @cluster_pool = OneKS::ClusterDocumentPool.new(:auth => cloud_auth)
            @group_pool   = OneKS::K8sGroupDocumentPool.new(:auth => cloud_auth)

            # Event manager handles internal LCM events
            # WatchDog handles cluster events (allocate document, vms)
            @em = OneKS::EventManager.new(@cloud_auth)
            @wd = OneKS::ClusterWD.new(@cloud_auth, @em)
            @tm = ODS::ThreadManager.instance

            # Fill in cluster pool and start LCM threads
            @cluster_pool.info_all
            @group_pool.info_all

            @tm.start(:event_manager) { @em.start(@cluster_pool, @group_pool) }
            @tm.start(:watchdog) { @wd.start(@cluster_pool, @group_pool) }
            @tm.start(:lcm) { catch_up }
            @tm.start(:disk_autoscaling) { disk_autoscaling_loop }
        end

        private

        # Iterate through the groups for catching up with the state of each group
        # used when the LCM starts
        def catch_up
            Log.info(COMP, 'Catching up...')

            @group_pool.each do |group|
                Log.info(COMP, "Catching up #{group.type} #{group.id} in #{group.state}")

                action = {
                    :BOOTSTRAPPING => :group_bootstrap_action,
                    :PROVISIONING  => :group_provision_action,
                    :WARNING       => :group_running_action
                }[group.state]
                next unless action

                Log.info(COMP, "Resuming #{group.type} #{group.id} with #{action}")
                @em.trigger_action(:name => action, :args => [group.id, nil])
            end
        end

        # Automatically reconcile enabled worker disk policies across every
        # OneKS cluster. A fresh document pool is used on each pass so the
        # controller never acts on stale group state after restarts/scales.
        def disk_autoscaling_loop
            interval = Integer(@conf.fetch(:disk_autoscaling_interval, 60))
            interval = 60 unless interval.between?(10, 3600)

            until @tm.stop?
                interruptible_sleep(interval)
                break if @tm.stop?

                pool = OneKS::K8sGroupDocumentPool.new(:auth => @cloud_auth)
                rc = pool.info_all
                if OpenNebula.is_error?(rc)
                    Log.warn(COMP, "Disk autoscaling pool refresh failed: #{rc.message}")
                    next
                end

                pool.each do |group|
                    next unless group.is_a?(OneKS::NodeGroup)
                    next unless [:RUNNING, :WARNING].include?(group.state)

                    policy = group.body[:disk_autoscaling]
                    next unless policy && policy[:enabled] == true
                    next if group.vms.empty?

                    result = group.reconcile_disk_autoscaling
                    if OpenNebula.is_error?(result)
                        Log.warn(
                            COMP,
                            "Disk autoscaling reconcile failed for group #{group.id}: " \
                            "#{result.message}",
                            group.cluster_id
                        )
                    elsif result.is_a?(Hash) && result[:action] != 'none'
                        Log.info(
                            COMP,
                            "Disk autoscaling group #{group.id}: #{result[:action]}",
                            group.cluster_id
                        )
                    end
                rescue StandardError => e
                    Log.warn(
                        COMP,
                        "Disk autoscaling group #{group.id} crashed: " \
                        "#{e.class}: #{e.message}",
                        group.cluster_id
                    )
                end
            end
        rescue StandardError => e
            Log.warn(COMP, "Disk autoscaling loop stopped: #{e.class}: #{e.message}")
        end

        def interruptible_sleep(seconds)
            seconds.times do
                break if @tm.stop?

                sleep(1)
            end
        end

    end

end
