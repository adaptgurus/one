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

#include "PlanManager.h"
#include "Nebula.h"
#include "NebulaLog.h"
#include "RaftManager.h"
#include "SchedulerManager.h"
#include "VirtualMachinePool.h"
#include "Request.h"
#include "RequestAttributes.h"
#include "ClusterPool.h"
#include "PlanPool.h"
#include "Plan.h"
#include "VirtualMachineAPI.h"
#include "LifeCycleManager.h"
#include "HostPool.h"

using namespace std;

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

PlanManager::PlanManager(time_t timer,
                         int    _max_actions_per_host,
                         int    _max_actions_per_cluster,
                         int    _live_resched,
                         int    _cold_migrate_mode,
                         int    _timeout,
                         int    _drs_interval)
    : timer_thread(timer, [this]() {timer_action();})
    , max_actions_per_host(_max_actions_per_host)
    , max_actions_per_cluster(_max_actions_per_cluster)
    , live_resched(_live_resched == 1)
    , cold_migrate_mode(_cold_migrate_mode)
    , action_timeout(_timeout)
    , drs_interval(_drs_interval)
    , drs_last(time(0))
{
    NebulaLog::info("PLM", "Staring Plan Manager...");

    auto& nd = Nebula::instance();

    cluster_pool = nd.get_clpool();
    plan_pool    = nd.get_planpool();
    vm_pool      = nd.get_vmpool();

    if (_max_actions_per_host <= 0)
    {
        max_actions_per_host = 1;
    }

    if (_max_actions_per_cluster <= 0)
    {
        max_actions_per_cluster = 1;
    }

    if (cold_migrate_mode < 0 || cold_migrate_mode >2)
    {
        cold_migrate_mode = 0;
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void PlanManager::finalize()
{
    NebulaLog::info("PLM", "Stopping Plan Manager...");

    timer_thread.stop();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void PlanManager::add_plan(const string& xml)
{
    NebulaLog::ddebug("PLM", [&](std::ostream& log)
    {
        log << "Adding new plan:" << xml;
    });

    Plan plan;

    if (plan.from_xml(xml) != 0)
    {
        NebulaLog::error("PLM", "Error parsing plan XML:" + xml);
        return;
    }

    if (plan.actions().empty())
    {
        NebulaLog::debug("PLM", "Plan has no actions, skipping...");
        return;
    }

    {
        // Cluster -> plan is the common order used by checked execution and deletion.
        // Hold both through policy validation and persistence of a computed plan.
        auto cluster = plan.cid() >= 0 ? cluster_pool->get(plan.cid()) : nullptr;
        if (plan.cid() >= 0 && !cluster)
        {
            NebulaLog::error("PLM", "Optimization plan for non-existent cluster " + to_string(plan.cid()));
            return;
        }
        if (cluster && !plan.template_sha256().empty() &&
            plan.template_sha256() != cluster->template_sha256())
        {
            NebulaLog::error("PLM", "Discarding optimization plan computed against a stale cluster template");
            return;
        }
        auto cplan = plan_pool->get(plan.cid());
        if (!cplan)
        {
            NebulaLog::error("PLM", "Plan not found, unable to update plan for cluster " + to_string(plan.cid()));
            return;
        }
        if (cplan->state() == PlanState::APPLYING)
        {
            NebulaLog::info("PLM", "Cannot add plan. A plan is already in progress.");
            return;
        }
        if (cplan->from_xml(xml) != 0 || !cplan->renew_generation())
        {
            NebulaLog::error("PLM", "Unable to initialize generated plan identity");
            return;
        }
        cplan->state(plan.cid() == -1 || cluster->automation() == Cluster::DrsAutomation::FULL
                     ? PlanState::APPLYING : PlanState::READY);
        if (plan_pool->update(cplan.get()) != 0)
        {
            NebulaLog::error("PLM", "Unable to persist new plan");
            return;
        }
    }

    // Clear previous scheduling messages for all VM actions
    for (const auto& action : plan.actions())
    {
        if (auto vm = vm_pool->get(action.vm_id()))
        {
            string sched_message;

            vm->get_user_template_attribute("SCHED_MESSAGE", sched_message);

            if (sched_message.empty())
            {
                continue;
            }

            vm->set_template_error_message("SCHED_MESSAGE", "");

            vm_pool->update(vm.get());
        }
    }

    execute_plans();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
static int start_check_plan(Plan& p, std::string& error)
{
    switch(p.state())
    {
        case PlanState::NONE:
            error = "Plan is not ready";
            return -1;
        case PlanState::APPLYING:
            error = "Plan is already applying";
            return -1;
        case PlanState::DONE:
            error = "Plan is already done";
            return -1;
        case PlanState::ERROR:
            error = "Plan is in error state";
            return -1;
        default:
            break;
    }

    p.state(PlanState::APPLYING);

    return 0;
}

/* -------------------------------------------------------------------------- */

int PlanManager::start_plan(int cid, std::string& error)
{
    if (auto plan = plan_pool->get(cid))
    {
        if (start_check_plan(*plan, error) == -1)
        {
            return -1;
        }

        plan_pool->update(plan.get());
    }
    else
    {
        error = "Plan not found";
        return -1;
    }

    execute_plans();

    return 0;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

int PlanManager::start_plan_checked(int cid, const std::string& expected_plan_sha256,
                                    const std::string& expected_template_sha256,
                                    std::string& error)
{
    {
        // Match PlanDelete's lock order. The cluster stays locked through the
        // durable READY -> APPLYING transition, so policy and plan checks are atomic.
        auto cluster = cluster_pool->get(cid);
        if (!cluster)
        {
            error = "Cluster not found";
            return -1;
        }
        if (cluster->template_sha256() != expected_template_sha256)
        {
            error = "Cluster template changed; refresh and approve the current policy";
            return -1;
        }
        if (cluster->automation() != Cluster::DrsAutomation::MANUAL)
        {
            error = "Checked plan execution requires manual automation";
            return -1;
        }
        auto plan = plan_pool->get(cid);
        if (!plan)
        {
            error = "Plan not found";
            return -1;
        }
        if (plan->template_sha256() != expected_template_sha256)
        {
            error = "Plan was not computed against the approved cluster template";
            return -1;
        }
        if (plan->validate_checked(expected_plan_sha256, error) != 0) return -1;
        std::set<int> vm_ids;
        for (const auto& action : plan->actions())
        {
            if (!vm_ids.insert(action.vm_id()).second)
            {
                error = "Checked migration plan contains repeated VM actions";
                return -1;
            }
            // Read-only preflight avoids taking VM locks under the cluster lock.
            // The API repeats this check under its VM lock before any mutation.
            auto vm = vm_pool->get_ro(action.vm_id());
            auto host = Nebula::instance().get_hpool()->get_ro(action.host_id());
            if (!vm || !host || host->get_cluster_id() != cid ||
                host->get_state() != Host::MONITORED)
            {
                error = "Checked migration plan VM/target host is unavailable in the approved cluster";
                return -1;
            }
            if (!vm->checked_migration_supported(action.host_id(), cid, action.ds_id(), error))
            {
                return -1;
            }
        }
        if (plan->start_checked(expected_plan_sha256, error) != 0) return -1;
        if (plan_pool->update(plan.get()) != 0)
        {
            error = "Unable to persist approved plan execution";
            return -1;
        }
    }
    execute_plans();
    return 0;
}

void PlanManager::timer_action()
{
    auto& nd = Nebula::instance();
    RaftManager * raftm = nd.get_raftm();

    if (!ready.load() || !raftm || (!raftm->is_leader() && !raftm->is_solo()))
    {
        return;
    }

    NebulaLog::info("PLM", "Starting Plan Manager timer action...");

    execute_plans();

    // Periodically run DRS (Cluster optimization) for all clusters
    if (drs_interval > 0 && time(0) - drs_last >= drs_interval)
    {
        drs_last = time(0);

        vector<int> clusters;
        cluster_pool->list(clusters);

        for (auto cid : clusters)
        {
            if (auto cluster = cluster_pool->get_ro(cid))
            {
                if (cluster->automation() == Cluster::DrsAutomation::MANUAL)
                {
                    continue;
                }

                if (auto plan = plan_pool->get_ro(cid))
                {
                    if (plan->state() == PlanState::APPLYING)
                    {
                        continue;
                    }

                    nd.get_sm()->trigger_optimize(cid);
                }
            }
        }
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

bool PlanManager::start_action(Plan& plan, PlanAction& action)
{
    const int plan_id = plan.cid();
    const string& aname = action.operation();
    VMActions::Action vm_action = VMActions::NONE_ACTION;
    VMActions::action_from_str(aname, vm_action);

    Request::ErrorCode rc = Request::SUCCESS;

    RequestAttributes ra(AuthRequest::ADMIN,
                         UserPool::ONEADMIN_ID,
                         GroupPool::ONEADMIN_ID,
                         PoolObjectSQL::VM);

    ra.set_auth_op(vm_action);
    if (plan.checked_execution())
    {
        ra.checked_plan_id = plan_id;
        ra.checked_action_id = action.id();
        ra.checked_plan_generation = plan.generation();
        ra.checked_plan_term = Nebula::instance().get_raftm()->get_term();
    }

    if (plan.checked_execution())
    {
        // Once native VM admission can begin, the plan action must already be
        // durable. A crash must not turn an accepted action back into READY.
        action.timestamp(time(nullptr));
        action.state(PlanState::APPLYING);
        if (plan_pool->update(&plan) != 0)
        {
            action.state(PlanState::ERROR);
            NebulaLog::error("PLM", "Cannot persist checked action admission");
            return false;
        }
    }

    Request request("internal action");
    VirtualMachineAPI api(request);

    if (vm_action == VMActions::DEPLOY_ACTION)
    {
        ostringstream extra;

        auto nics = action.nics();

        for (auto nic : nics)
        {
            extra << "NIC=[NIC_ID=\"" << nic.first
                  << "\", NETWORK_MODE=\"auto\" , NETWORK_ID=\"" << nic.second
                  << "\"]";
        }

        rc = api.deploy(action.vm_id(),
                        action.host_id(),
                        true,
                        action.ds_id(),
                        extra.str(),
                        ra);
    }
    else if (vm_action == VMActions::MIGRATE_ACTION)
    {
        rc = api.migrate(action.vm_id(),
                         action.host_id(),
                         live_resched,
                         plan.checked_execution(),
                         action.ds_id(),
                         cold_migrate_mode,
                         ra);
    }
    else
    {
        rc = api.action(action.vm_id(), aname, ra);
    }

    action.timestamp(time(nullptr));

    if (rc != Request::SUCCESS)
    {
        action.state(PlanState::ERROR);

        auto error_msg = Request::failure_message(rc, ra, aname, ra.resp_obj);

        NebulaLog::info("PLM", error_msg);

        if (auto vm = vm_pool->get(action.vm_id()))
        {
            vm->set_template_error_message(error_msg);

            vm_pool->update(vm.get());
        }

        return false;
    }

    if (!plan.checked_execution())
    if (auto vm = vm_pool->get(action.vm_id()))
    {
        vm->plan_id(plan_id);
        vm->action_id(action.id());

        vm_pool->update_history(vm.get());
    }

    action.state(PlanState::APPLYING);

    return true;
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void PlanManager::action_finished(int plan_id, int action_id, PlanState state,
                                  const std::string& generation)
{
    auto plan = plan_pool->get(plan_id);

    if (!plan)
    {
        return;
    }

    if ((plan->checked_execution() && generation.empty()) ||
        (!generation.empty() && plan->generation() != generation))
    {
        NebulaLog::info("PLM", "Ignoring completion for a superseded checked plan generation");
        return;
    }

    bool trigger_placement = false;

    if (plan->action_finished(action_id, state))
    {
        plan->check_completed();

        if (plan_id == -1 && plan->state() != PlanState::APPLYING)
        {
            trigger_placement = true;
        }

        plan_pool->update(plan.get());
    }

    if (trigger_placement)
    {
        Nebula::instance().get_sm()->place_finished();
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void PlanManager::execute_plan(Plan& plan)
{
    if (plan.state() != PlanState::APPLYING)
    {
        NebulaLog::info("PLM", "Plan " + to_string(plan.cid()) + " is not applying");
        return;
    }

    plan.timeout_actions(action_timeout);

    // Update counter, num of running actions per host, per cluster
    map<int, int> host_actions;
    int           cluster_actions = 0;

    plan.count_actions(cluster_actions, host_actions);

    // Execute plan actions
    while (auto action = plan.get_next_action())
    {
        if (host_actions[action->host_id()] >= max_actions_per_host
            || cluster_actions >= max_actions_per_cluster)
        {
            break;
        }

        if (start_action(plan, *action))
        {
            host_actions[action->host_id()]++;
            cluster_actions++;
        }
    }

    plan.check_completed();
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void PlanManager::execute_plans()
{
    if (!ready.load()) return;
    std::lock_guard<std::mutex> execution_lock(execution_mutex);
    auto& nd = Nebula::instance();
    auto raftm = nd.get_raftm();
    if (!raftm || (!raftm->is_leader() && !raftm->is_solo())) return;

    const auto term = raftm->get_term();
    const bool new_epoch = recovered_term != term;
    // First dispatch in every leader epoch cancels requests that never reached a
    // driver. Later passes retry storage failures or a stalled admission queue.
    if (!nd.get_lcm()->recover_checked_migrations(new_epoch, term)) return;
    recovered_term = term;
    auto plans = plan_pool->get_active_plans();

    NebulaLog::info("PLM", "Found " + to_string(plans.size()) + " active plans");

    for (auto plan_id : plans)
    {
        auto plan = plan_pool->get(plan_id);

        execute_plan(*plan);

        plan_pool->update(plan.get());
    }
}
