/* -------------------------------------------------------------------------- */
/* Copyright 2002-2026, OpenNebula Project, OpenNebula Systems                */
/*                                                                            */
/* Licensed under the Apache License, Version 2.0 (the "License"); you may    */
/* not use this file except in compliance with the License. You may obtain    */
/* a copy of the License at                                                   */
/*                                                                            */
/* http://www.apache.org/licenses/LICENSE-2.0                                 */
/*                                                                            */
/* Unless required by applicable law or agreed to in writing, software        */
/* distributed under the License is distributed on an "AS IS" BASIS,          */
/* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.   */
/* See the License for the specific language governing permissions and        */
/* limitations under the License.                                             */
/* -------------------------------------------------------------------------- */

#ifndef PLAN_MANAGER_H_
#define PLAN_MANAGER_H_

#include "Listener.h"
#include "Plan.h"
#include "OneDB.h"

#include <vector>
#include <atomic>
#include <mutex>
#include <limits>

class ClusterPool;
class PlanPool;
class VirtualMachinePool;

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

class PlanManager
{
public:

    PlanManager(time_t  timer,
                int     _max_actions_per_host,
                int     _max_actions_per_cluster,
                int     _live_resched,
                int     _cold_migrate_mode,
                int     _timeout,
                int     _drs_interval);

    void finalize();

    // Called after all manager cross references are initialized.
    void activate() { ready.store(true); }

    void add_plan(const std::string& xml);
    const std::string& request_instance() const { return planning_instance; }
    void finish_generate(int cid, const std::string& nonce, bool noop,
                         const std::string& error);

    /**
     * Start applying plan actions
     *
     * @param cid Cluster ID
     * @return 0 on success, -1 otherwise
     */
    int start_plan(int cid, std::string& error);
    int start_plan_checked(int cid, const std::string& expected_plan_sha256,
                           const std::string& expected_template_sha256,
                           std::string& error);

    void action_success(int plan_id, int action_id, const std::string& generation = "")
    {
        action_finished(plan_id, action_id, PlanState::DONE, generation);
    }

    void action_failure(int plan_id, int action_id, const std::string& generation = "")
    {
        action_finished(plan_id, action_id, PlanState::ERROR, generation);
    }

    void checked_action_failure(int plan_id, int action_id, const std::string& generation)
    {
        action_finished(plan_id, action_id, PlanState::ERROR, generation);
    }

private:
    /**
     * Timer to periodically checks and starts the placement actions.
     */
    std::atomic<bool> ready{false};
    std::mutex execution_mutex;
    std::string planning_instance;
    void recover_generating_requests();
    unsigned int recovered_term = std::numeric_limits<unsigned int>::max();
    Timer timer_thread;

    ClusterPool        *cluster_pool;
    PlanPool           *plan_pool;
    VirtualMachinePool *vm_pool;

    /**
     *  Dispatch Options
     */
    int max_actions_per_host;
    int max_actions_per_cluster;

    bool live_resched;
    int  cold_migrate_mode;

    int  action_timeout;

    int    drs_interval;
    time_t drs_last;

    /**
     * Periodically called method to start the placement actions.
     */
    void timer_action();

    bool start_action(Plan& plan, PlanAction& action);

    void action_finished(int plan_id, int action_id, PlanState state,
                         const std::string& generation = "");

    void execute_plan(Plan& plan);

    void execute_plans();
};

#endif /*PLAN_MANAGER_H*/

