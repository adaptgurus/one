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

#include "LifeCycleManager.h"
#include "TransferManager.h"
#include "DispatchManager.h"
#include "VirtualMachineManager.h"
#include "ClusterPool.h"
#include "HostPool.h"
#include "ImagePool.h"
#include "SecurityGroupPool.h"
#include "VirtualMachinePool.h"
#include "VirtualNetworkPool.h"
#include "Request.h"
#include "PlanManager.h"
#include "RaftManager.h"
#include "OneDRSEligibility.h"

using namespace std;

namespace
{
bool persist_native_plan_action(VirtualMachinePool* pool, VirtualMachine* vm,
        const RequestAttributes::NativePlanAction& context, bool new_history = false)
{
    // Called only inside an accepted native state branch with the VM locked.
    // User requests carry an empty context and must not complete an older plan.
    vm->plan_id(context.plan_id);
    vm->action_id(context.action_id);
    vm->plan_action_generation(context.generation);
    vm->checked_plan_generation("");
    vm->checked_eligibility_sha256("");
    vm->checked_plan_term(0);
    vm->checked_capacity_pending(false);

    const bool owned = !context.generation.empty();
    const int history_rc = new_history ?
        (owned ? pool->upsert_checked_history(vm) : pool->insert_history(vm)) :
        pool->update_history(vm);
    if (history_rc != 0 && owned)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist native plan action history; refusing driver dispatch");
        return false;
    }
    if (pool->update(vm) != 0 && owned)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist native plan action state; refusing driver dispatch");
        return false;
    }
    return true;
}

void reject_native_plan_action(std::unique_ptr<VirtualMachine>& vm,
        const RequestAttributes::NativePlanAction& context)
{
    vm.reset(); // The plan lock is never acquired with the VM lock held.
    if (!context.generation.empty())
        Nebula::instance().get_planm()->action_failure(
            context.plan_id, context.action_id, context.generation);
}
}

void LifeCycleManager::trigger_deploy(int vid, int admission_sequence)
{
    trigger([this, vid, admission_sequence]
    {
        ostringstream       os;

        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (admission_sequence >= 0 && vm->history_sequence() != admission_sequence)
        {
            vm->log("LCM", Log::INFO, "Ignoring a superseded native admission event");
            return;
        }

        if ( vm->get_state() == VirtualMachine::ACTIVE )
        {
            HostShareCapacity sr;

            time_t thetime = time(0);
            int rc;

            VirtualMachine::LcmState vm_state;

            //----------------------------------------------------
            //                 PROLOG STATE
            //----------------------------------------------------

            vm->get_capacity(sr);

            vm_state  = VirtualMachine::PROLOG;

            void (TransferManager::*tm_action)(VirtualMachine *) =
            &TransferManager::trigger_prolog;

            if (vm->hasPreviousHistory())
            {
                if (vm->get_previous_action() == VMActions::STOP_ACTION)
                {
                    vm_state  = VirtualMachine::PROLOG_RESUME;
                    tm_action = &TransferManager::trigger_prolog_resume;
                }
                else if (vm->get_previous_action() == VMActions::UNDEPLOY_ACTION ||
                         vm->get_previous_action() == VMActions::UNDEPLOY_HARD_ACTION)
                {
                    vm_state  = VirtualMachine::PROLOG_UNDEPLOY;
                    tm_action = &TransferManager::trigger_prolog_resume;
                }
            }

            vm->set_state(vm_state);

            std::string capacity_error;
            rc = hpool->add_capacity(vm->get_hid(), sr, vm->capacity_enforced(),
                                     &capacity_error, [&]() { return vmpool->update(vm.get()); });
            if (rc != 0 && vm->capacity_enforced())
            {
                vm->set_template_error_message(capacity_error);
                vm->log("LCM", Log::ERROR, capacity_error);
            }

            vm->set_stime(thetime);

            vm->set_prolog_stime(thetime);

            vm->set_vm_info();

            if (vmpool->update_history(vm.get()) != 0 && vm->capacity_enforced()) return;

            if (vmpool->update(vm.get()) != 0 && vm->capacity_enforced()) return;

            if (rc != 0)
            {
                // Missing host or refused enforced admission: no TM/VMM request.
                trigger_prolog_failure(vid);
            }
            else
            {
                (tm->*tm_action)(vm.get());
            }
        }
        else
        {
            vm->log("LCM", Log::ERROR, "deploy_action, VM in a wrong state.");
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_suspend(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        if (vm->get_state()     == VirtualMachine::ACTIVE &&
            vm->get_lcm_state() == VirtualMachine::RUNNING)
        {
            //----------------------------------------------------
            //                SAVE_SUSPEND STATE
            //----------------------------------------------------

            vm->set_state(VirtualMachine::SAVE_SUSPEND);

            vm->set_resched(false);

            vm->set_action(VMActions::SUSPEND_ACTION, uid, gid, req_id);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            vmm->trigger_save(vid);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "suspend_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_stop(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        if (vm->get_state()     == VirtualMachine::ACTIVE &&
            vm->get_lcm_state() == VirtualMachine::RUNNING)
        {
            //----------------------------------------------------
            //                SAVE_STOP STATE
            //----------------------------------------------------

            vm->set_state(VirtualMachine::SAVE_STOP);

            vm->set_resched(false);

            vm->set_action(VMActions::STOP_ACTION, uid, gid, req_id);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            vmm->trigger_save(vid);
        }
        else if (vm->get_state() == VirtualMachine::SUSPENDED)
        {
            //----------------------------------------------------
            //   Bypass SAVE_STOP
            //----------------------------------------------------
            VirtualMachineTemplate quota_tmpl;

            std::string memory, cpu;

            int quota_uid = vm->get_uid();
            int quota_gid = vm->get_gid();

            vm->get_template_attribute("MEMORY", memory);
            vm->get_template_attribute("CPU", cpu);

            vm->get_quota_template(quota_tmpl, false, true);

            vm->set_state(VirtualMachine::ACTIVE);
            vm->set_state(VirtualMachine::EPILOG_STOP);

            vm->set_action(VMActions::STOP_ACTION, uid, gid, req_id);

            vm->set_epilog_stime(time(0));

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            tm->trigger_epilog_stop(vm.get());

            // Add running quota, it will be removed in DM::stop_success
            vm.reset();
            Quotas::vm_add(quota_uid, quota_gid, &quota_tmpl);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "stop_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

bool LifeCycleManager::has_enforced_capacity(VirtualMachine* vm)
{
    if (!vm->capacity_enforced() || !vm->capacity_admission_state()) return true;
    auto host = hpool->get(vm->get_hid());
    if (host && host->get_vm_ids().count(vm->get_oid()) != 0) return true;
    vm->log("LCM", Log::ERROR, "Enforced target capacity is not reserved; refusing driver success");
    return false;
}

bool LifeCycleManager::prepare_enforced_prolog_transfer(VirtualMachine* vm)
{
    if ((!vm->capacity_enforced() && vm->checked_plan_generation().empty()) ||
        !vm->hasPreviousHistory()) return true;
    switch (vm->get_lcm_state())
    {
        case VirtualMachine::PROLOG_MIGRATE:
        case VirtualMachine::PROLOG_MIGRATE_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_POWEROFF:
        case VirtualMachine::PROLOG_MIGRATE_POWEROFF_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_SUSPEND:
        case VirtualMachine::PROLOG_MIGRATE_SUSPEND_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN:
        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN_FAILURE:
            break;
        default: return true;
    }
    const auto persisted = [vm](int rc, const char* step)
    {
        if (rc == 0) return true;
        vm->log("LCM", Log::ERROR, std::string("Enforced migration pre-transfer persistence failed: ") + step);
        return false;
    };
    if (vm->is_previous_history_open())
    {
        vm->set_previous_etime(time(nullptr));
        vm->set_previous_running_etime(time(nullptr));
        if (!persisted(vmpool->update_previous_history(vm), "source history")) return false;
    }
    if (vm->get_hid() != vm->get_previous_hid())
    {
        HostShareCapacity previous_capacity;
        Template previous_template;
        vm->get_previous_capacity(previous_capacity, previous_template);
        if (!persisted(hpool->del_checked_capacity(vm->get_previous_hid(), previous_capacity),
                       "source capacity release")) return false;
        vm->release_previous_vnc_port();
    }
    return persisted(vmpool->update_history(vm), "target history") &&
           persisted(vmpool->update(vm), "VM state");
}

bool LifeCycleManager::cancel_enforced_admission(
        std::unique_ptr<VirtualMachine>& vm, std::string& error)
{
    const auto refused = [&error](const std::string& why)
    {
        error = "Enforced admission remains unresolved: " + why;
        return false;
    };
    auto raftm = Nebula::instance().get_raftm();
    if (!raftm || (!raftm->is_solo() && !raftm->is_leader()))
        return refused("reconciliation requires the current native leader");
    if (!vm || !vm->capacity_enforced() || vm->checked_capacity_pending() ||
        !vm->capacity_admission_pending())
        return refused("request is not an unconsumed ordinary enforced admission");

    const int origin_state = vm->enforced_admission_state();
    const int origin_lcm = vm->enforced_admission_lcm_state();
    const bool initial = (origin_state == VirtualMachine::HOLD ||
                          origin_state == VirtualMachine::PENDING) &&
                         origin_lcm == VirtualMachine::LCM_INIT &&
                         ((vm->history_sequence() == 0 && !vm->hasPreviousHistory()) ||
                          vm->previous_is_canceled_initial_admission());
    const bool source_running = origin_state == VirtualMachine::ACTIVE &&
                                origin_lcm == VirtualMachine::RUNNING;
    const bool source_offline = (origin_state == VirtualMachine::POWEROFF ||
                                origin_state == VirtualMachine::SUSPENDED) &&
                               origin_lcm == VirtualMachine::LCM_INIT;
    const bool migration = (source_running || source_offline) &&
                            vm->hasPreviousHistory() &&
                            vm->get_hid() != vm->get_previous_hid() &&
                            vm->get_ds_id() == vm->get_previous_ds_id() &&
                            vm->get_cid() == vm->get_previous_cid();
    HostShareCapacity capacity;
    vm->get_capacity(capacity);
    if ((!initial && !migration) || vm->is_pinned() ||
        !capacity.nodes.empty() || !capacity.pci.empty())
        return refused("origin, pinning, PCI, NUMA, datastore or cluster requires explicit reconciliation");

    // STIME0 is published before LCM can dispatch. A stable origin VM with an
    // open predecessor is also pre-dispatch because enforced LCM must persist
    // its nonstable state before invoking a driver. Later MIGRATE/PROLOG states
    // with started histories use the existing native recovery path.
    if (!vm->enforced_admission_canceling() && vm->get_history_stime() != 0 &&
        !(migration && vm->get_state() == origin_state &&
          vm->get_lcm_state() == origin_lcm && vm->is_previous_history_open()))
        return refused("driver admission may already have started");

    const int plan_id = vm->plan_id(), action_id = vm->action_id();
    const auto generation = vm->plan_action_generation();
    const auto persisted = [&refused](int rc, const char* step)
    {
        return rc == 0 || refused(std::string("failed durable ") + step);
    };
    // The marker survives a history/VM write failure, including initial deploy
    // whose original HOLD/PENDING state has no prior history to copy.
    vm->enforced_admission_canceling(true);
    if (!persisted(vmpool->update_history(vm.get()), "cancellation marker")) return false;
    if (!persisted(hpool->del_checked_capacity(vm->get_hid(), capacity),
                   "target capacity release")) return false;

    const auto now = time(nullptr);
    if (migration)
    {
        // A cold/offline admission can release the source before its final
        // history write. Reacquire through the same current-capacity ledger;
        // existing source membership is idempotent and must not be double added.
        std::string capacity_error;
        const int rc = hpool->add_capacity(vm->get_previous_hid(), capacity, true, &capacity_error);
        if (!persisted(rc, "source capacity reservation")) return false;
    }
    vm->set_template_error_message("Enforced admission canceled before driver dispatch");
    vm->set_etime(now);
    if (!persisted(vmpool->update_history(vm.get()), "target history")) return false;

    if (migration)
    {
        vm->set_previous_etime(now);
        vm->set_previous_running_etime(now);
        if (!persisted(vmpool->update_previous_history(vm.get()), "source history")) return false;
        vm->cp_previous_history();
        vm->set_stime(now);
        vm->set_running_stime(now);
        if (!source_running) vm->set_running_etime(now);
        vm->set_state(static_cast<VirtualMachine::VmState>(origin_state));
        vm->set_state(static_cast<VirtualMachine::LcmState>(origin_lcm));
        vm->set_vm_info();
        if (!persisted(vmpool->upsert_checked_history(vm.get()), "restored source history")) return false;
        if (!persisted(vmpool->update(vm.get()), "restored VM state")) return false;
    }
    else
    {
        vm->set_state(static_cast<VirtualMachine::VmState>(origin_state));
        vm->set_state(static_cast<VirtualMachine::LcmState>(origin_lcm));
        if (!persisted(vmpool->update(vm.get()), "restored initial VM state")) return false;
        // Record the canceled native attempt only after its original VM state
        // is durable. A failed final clear remains retryable via recover-failure.
        vm->set_stime(now);
        vm->enforced_admission_canceling(false);
        if (!persisted(vmpool->update_history(vm.get()), "completed cancellation")) return false;
    }

    vm.reset();
    if (plan_id >= -1)
        Nebula::instance().get_planm()->action_failure(plan_id, action_id, generation);
    return true;
}

bool LifeCycleManager::cancel_checked_migration(
        std::unique_ptr<VirtualMachine>& vm, const std::string& reason)
{
    const auto generation = vm->checked_plan_generation();
    const int plan_id = vm->plan_id(), action_id = vm->action_id();
    if (!vm->checked_capacity_pending() || generation.empty() ||
        !vm->hasPreviousHistory() || plan_id < 0 || action_id < 0 ||
        vm->get_cid() != plan_id || vm->get_previous_cid() != plan_id)
    {
        vm->log("LCM", Log::ERROR, "Invalid checked pending migration history; refusing automatic recovery");
        return false;
    }

    HostShareCapacity capacity;
    vm->get_capacity(capacity);
    if (vm->is_pinned() || !capacity.nodes.empty() || !capacity.pci.empty() ||
        vm->get_hid() == vm->get_previous_hid() || vm->get_ds_id() != vm->get_previous_ds_id())
    {
        vm->log("LCM", Log::ERROR, "Unsupported checked pending migration; refusing automatic recovery");
        return false;
    }
    if (vm->get_hid() != vm->get_previous_hid() &&
        hpool->del_checked_capacity(vm->get_hid(), capacity) != 0)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist checked reservation release; keeping request pending");
        return false;
    }

    // No driver action is allowed while the native pending bit is true. These
    // writes are retryable with the same next history sequence if oned stops.
    const auto now = time(nullptr);
    vm->set_template_error_message("Checked migration canceled: " + reason);
    vm->set_etime(now);
    if (vmpool->update_history(vm.get()) != 0) return false;
    vm->set_previous_etime(now);
    vm->set_previous_running_etime(now);
    if (vmpool->update_previous_history(vm.get()) != 0) return false;

    vm->cp_previous_history();
    vm->set_stime(now);
    vm->set_running_stime(now);
    if (vmpool->upsert_checked_history(vm.get()) != 0) return false;
    vm->set_state(VirtualMachine::RUNNING);
    if (vmpool->update(vm.get()) != 0) return false;

    vm.reset(); // Never take the plan lock while a VM lock is held.
    Nebula::instance().get_planm()->action_failure(plan_id, action_id, generation);
    return true;
}

bool LifeCycleManager::recover_checked_migrations(bool new_epoch, unsigned int term)
{
    std::vector<int> ids;
    // Include pre-driver MIGRATE/SAVE_MIGRATE: the VM state is persisted before
    // the final history admission bit, so a crash in that window remains safe.
    if (vmpool->search(ids, "state = 3 AND lcm_state IN (4, 7, 72)") != 0) return false;
    bool complete = true;
    for (auto id : ids)
    {
        auto vm = vmpool->get(id);
        if (!vm) { complete = false; continue; }
        if (!vm->checked_capacity_pending()) continue;
        if (!new_epoch && vm->checked_plan_term() == term && vm->get_history_stime() + 30 > time(nullptr))
        {
            continue;
        }
        if (!cancel_checked_migration(vm, new_epoch ?
            "controller restarted or leadership changed before admission" :
            "capacity admission did not complete")) complete = false;
    }
    return complete;
}

int LifeCycleManager::reserve_checked_migration_capacity(
        std::unique_ptr<VirtualMachine>& vm, bool live)
{
    if (!vm->checked_capacity_pending()) return 0;
    auto raftm = Nebula::instance().get_raftm();
    if (!raftm || (!raftm->is_solo() && !raftm->is_leader()))
    {
        vm->log("LCM", Log::ERROR, "Deferring checked admission to the current leader");
        return -1;
    }
    const int plan_id = vm->plan_id();
    std::string error;
    HostShareCapacity capacity;
    vm->get_capacity(capacity);

    if (vm->get_lcm_state() != VirtualMachine::CHECKED_MIGRATE_PENDING ||
        vm->checked_plan_generation().empty() || !vm->hasPreviousHistory() ||
        plan_id < 0 || vm->action_id() < 0 ||
        vm->get_cid() != plan_id || vm->get_previous_cid() != plan_id ||
        vm->checked_plan_term() != raftm->get_term() ||
        (vm->get_action() == VMActions::LIVE_MIGRATE_ACTION) != live)
    {
        error = "native checked request identity or leader epoch changed";
    }
    else
    {
        const int rc = hpool->add_checked_capacity(vm->get_hid(), plan_id, capacity, error,
                                                    [&]() { return vmpool->update(vm.get()); },
                                                    [&](Host& host, std::string& why)
                                                    {
                                                        auto cluster = Nebula::instance().get_clpool()->get_ro(plan_id);
                                                        if (!cluster)
                                                        {
                                                            why = "Checked migration cluster is unavailable";
                                                            return false;
                                                        }
                                                        return one_drs_eligibility::validate(*vm, host, *cluster,
                                                            vm->checked_eligibility_sha256(), true, why);
                                                    },
                                                    vm->get_hid() == vm->get_previous_hid());
        if (rc == 0) return 1;
        if (rc == -2)
        {
            // A failed write can be ambiguous. Keep the native pending record;
            // recovery reloads the authoritative ledger and releases idempotently.
            vm->log("LCM", Log::ERROR, error + "; request remains pending without driver dispatch");
            return -1;
        }
    }
    cancel_checked_migration(vm, error);
    return -1;
}

bool LifeCycleManager::persist_checked_migration_admission(VirtualMachine* vm)
{
    // Host capacity is already durable. Persist all native state before clearing
    // the last pending marker; never call a VMM/TM driver after any failed write.
    if (vmpool->update_history(vm) != 0 ||
        vmpool->update_previous_history(vm) != 0 ||
        vmpool->update(vm) != 0)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist checked migration state; refusing driver dispatch");
        return false;
    }
    vm->checked_capacity_pending(false);
    if (vmpool->update_history(vm) != 0)
    {
        vm->log("LCM", Log::ERROR, "Cannot persist checked admission completion; refusing driver dispatch");
        return false;
    }
    return true;
}

void LifeCycleManager::trigger_migrate(int vid, const RequestAttributes& ra,
                                       VMActions::Action vm_action)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const int admission_sequence = ra.capacity_admission_sequence;

    trigger([this, vid, uid, gid, req_id, vm_action, admission_sequence]
    {
        HostShareCapacity sr;
        Template quota_tmpl;

        time_t the_time = time(0);

        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (admission_sequence >= 0 && vm->history_sequence() != admission_sequence)
        {
            vm->log("LCM", Log::INFO, "Ignoring a superseded native admission event");
            return;
        }

        if (vm->get_state()     == VirtualMachine::ACTIVE &&
            (vm->get_lcm_state() == VirtualMachine::RUNNING ||
             vm->get_lcm_state() == VirtualMachine::CHECKED_MIGRATE_PENDING))
        {
            //----------------------------------------------------
            //                SAVE_MIGRATE STATE
            //----------------------------------------------------

            int checked_capacity = reserve_checked_migration_capacity(vm, false);
            if (checked_capacity < 0) return;

            vm->set_state(VirtualMachine::SAVE_MIGRATE);

            vm->set_resched(false);

            vm->get_capacity(sr);

            int capacity_rc = 0;
            std::string capacity_error;
            if ( checked_capacity == 0 && vm->get_hid() != vm->get_previous_hid() )
            {
                capacity_rc = hpool->add_capacity(vm->get_hid(), sr, vm->capacity_enforced(),
                        &capacity_error, [&]() { return vmpool->update(vm.get()); });
                if (capacity_rc != 0 && vm->capacity_enforced())
                {
                    vm->set_template_error_message(capacity_error);
                    vm->log("LCM", Log::ERROR, capacity_error);
                }
            }

            vm->set_stime(the_time);

            vm->set_action(vm_action, uid, gid, req_id);

            vm->set_vm_info();

            vm->set_previous_action(vm_action, uid, gid, req_id);

            if (checked_capacity == 1)
            {
                if (!persist_checked_migration_admission(vm.get())) return;
            }
            else
            {
                if (vmpool->update_history(vm.get()) != 0 && vm->capacity_enforced()) return;
                if (vmpool->update_previous_history(vm.get()) != 0 && vm->capacity_enforced()) return;
                if (vmpool->update(vm.get()) != 0 && vm->capacity_enforced()) return;
            }

            if (capacity_rc != 0 && vm->capacity_enforced())
            {
                // Before a driver request, ordinary same-datastore unpinned
                // running migration can use native failure restoration. Other
                // legacy shapes remain in an explicit unresolved migration state.
                if (!vm->is_pinned() && sr.nodes.empty() && sr.pci.empty() &&
                    vm->get_ds_id() == vm->get_previous_ds_id() &&
                    vm->get_cid() == vm->get_previous_cid())
                {
                    trigger_save_failure(vid);
                }
                else vm->log("LCM", Log::ERROR, "Enforced migration admission refused before driver dispatch; native recovery is required");
                return;
            }

            //----------------------------------------------------

            switch (vm_action)
            {
                case VMActions::POFF_MIGRATE_ACTION:
                    vmm->trigger_shutdown(vid);
                    break;
                case VMActions::POFF_HARD_MIGRATE_ACTION:
                    vmm->trigger_cancel(vid);
                    break;
                default:
                    vmm->trigger_save(vid);
                    break;
            }
        }
        else if (vm->get_state() == VirtualMachine::POWEROFF ||
                 vm->get_state() == VirtualMachine::SUSPENDED ||
                 (vm->get_state() == VirtualMachine::ACTIVE &&
                  vm->get_lcm_state() == VirtualMachine::UNKNOWN ))
        {
            //----------------------------------------------------------------------
            // Bypass SAVE_MIGRATE & go to PROLOG_MIGRATE_POWEROFF/SUSPENDED/UNKNOWN
            //----------------------------------------------------------------------
            if (vm->get_state() == VirtualMachine::POWEROFF)
            {
                vm->set_state(VirtualMachine::PROLOG_MIGRATE_POWEROFF);
            }
            else if (vm->get_state() == VirtualMachine::SUSPENDED)
            {
                vm->set_state(VirtualMachine::PROLOG_MIGRATE_SUSPEND);
            }
            else //VirtualMachine::UNKNOWN
            {
                vm->set_state(VirtualMachine::PROLOG_MIGRATE_UNKNOWN);

                vm->set_previous_action(VMActions::MIGRATE_ACTION, uid,
                                        gid, req_id);
            }

            vm->get_capacity(sr);
            if (vm->capacity_enforced() && vm->get_hid() != vm->get_previous_hid())
            {
                // An offline/UNKNOWN migration must reserve before releasing
                // source capacity or entering any transfer driver.
                vm->set_state(VirtualMachine::ACTIVE);
                std::string capacity_error;
                const int rc = hpool->add_capacity(vm->get_hid(), sr, true,
                        &capacity_error, [&]() { return vmpool->update(vm.get()); });
                if (rc != 0)
                {
                    vm->set_template_error_message(capacity_error);
                    vm->log("LCM", Log::ERROR, capacity_error);
                    vm->set_stime(the_time);
                    vm->set_prolog_stime(the_time);
                    vm->set_action(VMActions::MIGRATE_ACTION, uid, gid, req_id);
                    if (vmpool->update_history(vm.get()) != 0 || vmpool->update(vm.get()) != 0) return;
                    trigger_prolog_failure(vid);
                    return;
                }
            }

            vm->set_previous_running_etime(the_time);

            vm->set_previous_etime(the_time);

            if (vmpool->update_previous_history(vm.get()) != 0 && vm->capacity_enforced()) return;

            vm->set_state(VirtualMachine::ACTIVE);

            vm->set_resched(false);

            if ( !vmm->is_keep_snapshots(vm->get_vmm_mad()) )
            {
                vm->delete_snapshots(quota_tmpl);
            }

            vm->set_action(VMActions::MIGRATE_ACTION, uid, gid, req_id);

            vm->get_capacity(sr);

            if ( vm->get_hid() != vm->get_previous_hid() )
            {
                hpool->add_capacity(vm->get_hid(), sr);

                if (vm->capacity_enforced())
                {
                    if (hpool->del_checked_capacity(vm->get_previous_hid(), sr) != 0)
                    {
                        vm->log("LCM", Log::ERROR, "Enforced migration source accounting release is unresolved");
                        return;
                    }
                }
                else hpool->del_capacity(vm->get_previous_hid(), sr);

                vm->release_previous_vnc_port();
            }

            vm->set_stime(the_time);

            vm->set_prolog_stime(the_time);

            vm->set_vm_info();

            if (vmpool->update_history(vm.get()) != 0 && vm->capacity_enforced()) return;

            if (vmpool->update(vm.get()) != 0 && vm->capacity_enforced()) return;

            //----------------------------------------------------

            tm->trigger_prolog_migr(vm.get());
        }
        else
        {
            vm->log("LCM", Log::ERROR, "migrate_action, VM in a wrong state.");
        }

        vm.reset();

        if (!quota_tmpl.empty())
        {
            Quotas::quota_del(Quotas::VM, uid, gid, &quota_tmpl);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_live_migrate(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const int admission_sequence = ra.capacity_admission_sequence;

    trigger([this, vid, uid, gid, req_id, admission_sequence]
    {
        ostringstream os;

        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (admission_sequence >= 0 && vm->history_sequence() != admission_sequence)
        {
            vm->log("LCM", Log::INFO, "Ignoring a superseded native admission event");
            return;
        }

        if (vm->get_state()     == VirtualMachine::ACTIVE &&
            (vm->get_lcm_state() == VirtualMachine::RUNNING ||
             vm->get_lcm_state() == VirtualMachine::CHECKED_MIGRATE_PENDING))
        {
            HostShareCapacity sr;

            //----------------------------------------------------
            //                   MIGRATE STATE
            //----------------------------------------------------

            int checked_capacity = reserve_checked_migration_capacity(vm, true);
            if (checked_capacity < 0) return;

            vm->set_state(VirtualMachine::MIGRATE);

            vm->set_resched(false);

            vm->get_capacity(sr);

            int capacity_rc = 0;
            std::string capacity_error;
            if ( checked_capacity == 0 && vm->get_hid() != vm->get_previous_hid() )
            {
                capacity_rc = hpool->add_capacity(vm->get_hid(), sr, vm->capacity_enforced(),
                        &capacity_error, [&]() { return vmpool->update(vm.get()); });
                if (capacity_rc != 0 && vm->capacity_enforced())
                {
                    vm->set_template_error_message(capacity_error);
                    vm->log("LCM", Log::ERROR, capacity_error);
                }
            }

            vm->set_stime(time(0));

            vm->set_vm_info();

            vm->set_previous_action(VMActions::LIVE_MIGRATE_ACTION, uid, gid,
                                    req_id);

            if (checked_capacity == 1)
            {
                if (!persist_checked_migration_admission(vm.get())) return;
            }
            else
            {
                if (vmpool->update_history(vm.get()) != 0 && vm->capacity_enforced()) return;
                if (vmpool->update_previous_history(vm.get()) != 0 && vm->capacity_enforced()) return;
                if (vmpool->update(vm.get()) != 0 && vm->capacity_enforced()) return;
            }

            if (capacity_rc != 0 && vm->capacity_enforced())
            {
                // Before a driver request, ordinary same-datastore unpinned
                // running migration can use native failure restoration. Other
                // legacy shapes remain in an explicit unresolved migration state.
                if (!vm->is_pinned() && sr.nodes.empty() && sr.pci.empty() &&
                    vm->get_ds_id() == vm->get_previous_ds_id() &&
                    vm->get_cid() == vm->get_previous_cid())
                {
                    trigger_deploy_failure(vid);
                }
                else vm->log("LCM", Log::ERROR, "Enforced migration admission refused before driver dispatch; native recovery is required");
                return;
            }

            //----------------------------------------------------

            vmm->trigger_migrate(vid);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "live_migrate_action, VM in a wrong state.");
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_shutdown(int vid, bool hard,
                                        const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, hard, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);
        VirtualMachineTemplate quota_tmpl;

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        int uid = vm->get_uid();
        int gid = vm->get_gid();

        std::string memory, cpu;

        vm->get_template_attribute("MEMORY", memory);
        vm->get_template_attribute("CPU", cpu);

        if ((vm->get_state() == VirtualMachine::SUSPENDED) ||
            (vm->get_state() == VirtualMachine::POWEROFF) ||
            (vm->get_state() == VirtualMachine::STOPPED) ||
            (vm->get_state() == VirtualMachine::UNDEPLOYED))
        {
            vm->get_quota_template(quota_tmpl, false, true);
        }

        auto lcm_state = vm->get_lcm_state();

        if (hard && (vm->get_state() == VirtualMachine::ACTIVE &&
                     lcm_state == VirtualMachine::SHUTDOWN))
        {
            if (!plan_action.generation.empty())
            {
                vm->log("LCM", Log::ERROR, "Native plan action cannot replace an in-flight driver operation");
                reject_native_plan_action(vm, plan_action);
                return;
            }

            // Cancel previous shutdown action
            vmm->trigger_driver_cancel(vid);

            lcm_state = VirtualMachine::RUNNING; // Force execute of hard shutdown
        }

        if (vm->get_state() == VirtualMachine::ACTIVE &&
            (lcm_state == VirtualMachine::RUNNING ||
             lcm_state == VirtualMachine::UNKNOWN))
        {
            //----------------------------------------------------
            //                  SHUTDOWN STATE
            //----------------------------------------------------

            vm->set_state(VirtualMachine::SHUTDOWN);

            if (hard)
            {
                vm->set_action(VMActions::TERMINATE_HARD_ACTION, uid, gid,
                               req_id);

            }
            else
            {
                vm->set_action(VMActions::TERMINATE_ACTION, uid, gid,
                               req_id);

            }

            vm->set_resched(false);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            if (hard) vmm->trigger_cancel(vid);
            else vmm->trigger_shutdown(vid);
        }
        else if (vm->get_state() == VirtualMachine::SUSPENDED ||
                 vm->get_state() == VirtualMachine::POWEROFF)
        {
            vm->set_state(VirtualMachine::ACTIVE);
            vm->set_state(VirtualMachine::EPILOG);

            vm->set_action(VMActions::TERMINATE_ACTION, uid, gid, req_id);

            vm->set_epilog_stime(time(0));

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            tm->trigger_epilog(false, vm.get());

            // Add running quota, it will be removed in DM::done
            vm.reset();
            Quotas::vm_add(uid, gid, &quota_tmpl);
        }
        else if (vm->get_state() == VirtualMachine::STOPPED ||
                 vm->get_state() == VirtualMachine::UNDEPLOYED)
        {
            vm->set_state(VirtualMachine::ACTIVE);
            vm->set_state(VirtualMachine::EPILOG);

            vm->set_action(VMActions::TERMINATE_ACTION, uid, gid, req_id);

            vm->set_epilog_stime(time(0));

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            tm->trigger_epilog(true, vm.get());

            // Add running quota, it will be removed in DM::done
            vm.reset();
            Quotas::vm_add(uid, gid, &quota_tmpl);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "shutdown_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_undeploy(int vid, bool hard,
                                        const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, hard, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        auto lcm_state = vm->get_lcm_state();

        if (hard && (vm->get_state() == VirtualMachine::ACTIVE &&
                     lcm_state == VirtualMachine::SHUTDOWN_UNDEPLOY))
        {
            if (!plan_action.generation.empty())
            {
                vm->log("LCM", Log::ERROR, "Native plan action cannot replace an in-flight driver operation");
                reject_native_plan_action(vm, plan_action);
                return;
            }

            // Cancel previous undeploy action
            vmm->trigger_driver_cancel(vid);

            lcm_state = VirtualMachine::RUNNING; // Force execute of hard shutdown
        }

        if (vm->get_state() == VirtualMachine::ACTIVE &&
            (lcm_state == VirtualMachine::RUNNING ||
             lcm_state == VirtualMachine::UNKNOWN))
        {
            //----------------------------------------------------
            //             SHUTDOWN_UNDEPLOY STATE
            //----------------------------------------------------

            vm->set_state(VirtualMachine::SHUTDOWN_UNDEPLOY);

            vm->set_resched(false);

            if (hard)
            {
                vm->set_action(VMActions::UNDEPLOY_HARD_ACTION, uid, gid,
                               req_id);

            }
            else
            {
                vm->set_action(VMActions::UNDEPLOY_ACTION, uid, gid,
                               req_id);

            }

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            if (hard) vmm->trigger_cancel(vid);
            else vmm->trigger_shutdown(vid);
        }
        else if (vm->get_state() == VirtualMachine::POWEROFF)
        {
            //----------------------------------------------------
            //   Bypass SHUTDOWN_UNDEPLOY
            //----------------------------------------------------

            VirtualMachineTemplate quota_tmpl;

            std::string memory, cpu;

            int quota_uid = vm->get_uid();
            int quota_gid = vm->get_gid();

            vm->get_template_attribute("MEMORY", memory);
            vm->get_template_attribute("CPU", cpu);

            vm->get_quota_template(quota_tmpl, false, true);

            vm->set_state(VirtualMachine::ACTIVE);
            vm->set_state(VirtualMachine::EPILOG_UNDEPLOY);

            vm->set_action(VMActions::UNDEPLOY_ACTION, uid, gid, req_id);

            vm->set_epilog_stime(time(0));

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            //----------------------------------------------------

            tm->trigger_epilog_stop(vm.get());

            vm.reset();

            // Add running quota, it will be removed in DM:undeploy_success
            Quotas::vm_add(quota_uid, quota_gid, &quota_tmpl);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "undeploy_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}


/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_poweroff(int vid, const RequestAttributes& ra)
{
    trigger_poweroff(vid, false, ra);
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_poweroff_hard(int vid, const RequestAttributes& ra)
{
    trigger_poweroff(vid, true, ra);
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_poweroff(int vid, bool hard,
                                        const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, hard, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        auto lcm_state = vm->get_lcm_state();

        if (hard && (vm->get_state() == VirtualMachine::ACTIVE &&
                     lcm_state == VirtualMachine::SHUTDOWN_POWEROFF))
        {
            if (!plan_action.generation.empty())
            {
                vm->log("LCM", Log::ERROR, "Native plan action cannot replace an in-flight driver operation");
                reject_native_plan_action(vm, plan_action);
                return;
            }

            // Cancel previous shutdown action
            vmm->trigger_driver_cancel(vid);

            lcm_state = VirtualMachine::RUNNING; // Force execute of hard shutdown
        }

        if (vm->get_state() == VirtualMachine::ACTIVE &&
            (lcm_state == VirtualMachine::RUNNING ||
             lcm_state == VirtualMachine::UNKNOWN))
        {
            //----------------------------------------------------
            //             SHUTDOWN_POWEROFF STATE
            //----------------------------------------------------

            vm->set_state(VirtualMachine::SHUTDOWN_POWEROFF);

            vm->set_resched(false);

            if (hard)
            {
                vm->set_action(VMActions::POWEROFF_HARD_ACTION, uid, gid,
                               req_id);

            }
            else
            {
                vm->set_action(VMActions::POWEROFF_ACTION, uid, gid, req_id);

            }

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            if (hard) vmm->trigger_cancel(vid);
            else vmm->trigger_shutdown(vid);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "poweroff_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_restore(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, vid, uid, gid, req_id, plan_action]
    {
        ostringstream os;

        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        if (vm->get_state() == VirtualMachine::SUSPENDED)
        {
            time_t the_time = time(0);

            vm->log("LCM", Log::INFO, "Restoring VM");

            //----------------------------------------------------
            //            BOOT STATE (FROM SUSPEND)
            //----------------------------------------------------
            vm->set_state(VirtualMachine::ACTIVE);

            vm->set_state(VirtualMachine::BOOT_SUSPENDED);

            vm->set_etime(the_time);

            if (vmpool->update_history(vm.get()) != 0 && !plan_action.generation.empty()) return;

            vm->cp_history();

            vm->set_stime(the_time);

            vm->set_running_stime(the_time);

            vm->set_action(VMActions::RESUME_ACTION, uid, gid, req_id);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action, true)) return;

            //----------------------------------------------------

            vmm->trigger_restore(vid);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "restore_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_restart(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;
    const auto plan_action = ra.plan_action;

    trigger([this, vid, uid, gid, req_id, plan_action]
    {
        auto vm = vmpool->get(vid);

        if ( vm == nullptr )
        {
            return;
        }

        if (vm->capacity_admission_pending())
        {
            vm->log("LCM", Log::ERROR, "Refusing VM action during native capacity admission");
            reject_native_plan_action(vm, plan_action);
            return;
        }

        if (vm->get_state() == VirtualMachine::ACTIVE &&
            vm->get_lcm_state() == VirtualMachine::UNKNOWN)
        {
            vm->set_state(VirtualMachine::BOOT_UNKNOWN);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action)) return;

            vmm->trigger_deploy(vid);
        }
        else if ( vm->get_state() == VirtualMachine::POWEROFF )
        {
            time_t the_time = time(0);

            vm->set_state(VirtualMachine::ACTIVE);

            vm->set_state(VirtualMachine::BOOT_POWEROFF);

            vm->set_etime(the_time);

            if (vmpool->update_history(vm.get()) != 0 && !plan_action.generation.empty()) return;

            vm->cp_history();

            vm->set_stime(the_time);

            vm->set_running_stime(the_time);

            vm->set_action(VMActions::RESUME_ACTION, uid, gid, req_id);

            if (!persist_native_plan_action(vmpool, vm.get(), plan_action, true)) return;

            vmm->trigger_deploy(vid);
        }
        else
        {
            vm->log("LCM", Log::ERROR, "restart_action, VM in a wrong state.");
            reject_native_plan_action(vm, plan_action);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_delete(int vid, const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;

    trigger([this, vid, uid, gid, req_id]
    {
        int image_id = -1;
        Template quota_tmpl;

        if ( auto vm = vmpool->get(vid) )
        {
            if (vm->capacity_admission_pending() ||
                vm->get_lcm_state() == VirtualMachine::CHECKED_MIGRATE_PENDING)
            {
                vm->log("LCM", Log::ERROR, "Refusing cleanup during checked migration admission");
                return;
            }

            if ( vm->get_state() != VirtualMachine::ACTIVE )
            {
                vm->log("LCM", Log::ERROR, "clean_action, VM in a wrong state.");

                return;
            }

            switch (vm->get_lcm_state())
            {
                case VirtualMachine::CLEANUP_RESUBMIT:
                    vm->set_state(VirtualMachine::CLEANUP_DELETE);
                    vmpool->update(vm.get());

                    [[fallthrough]];

                case VirtualMachine::CLEANUP_DELETE:
                    dm->trigger_done(vid);
                    break;

                default:
                    clean_up_vm(vm.get(), true, image_id, uid, gid, req_id, quota_tmpl);
                    dm->trigger_done(vid);
                    break;
            }
        }
        else
        {
            return;
        }

        if ( image_id != -1 )
        {
            if ( auto image = ipool->get(image_id) )
            {
                image->set_state(Image::ERROR);

                ipool->update(image.get());
            }
        }

        if (!quota_tmpl.empty())
        {
            Quotas::quota_del(Quotas::VM, uid, gid, &quota_tmpl);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_delete_recreate(int vid,
                                               const RequestAttributes& ra)
{
    int uid = ra.uid;
    int gid = ra.gid;
    int req_id = ra.req_id;

    trigger([this, vid, uid, gid, req_id]
    {
        Template vm_quotas_snp;

        vector<Template *> ds_quotas_snp;

        int vm_uid, vm_gid;

        int image_id = -1;

        if ( auto vm = vmpool->get(vid) )
        {
            if (vm->capacity_admission_pending() ||
                vm->get_lcm_state() == VirtualMachine::CHECKED_MIGRATE_PENDING)
            {
                vm->log("LCM", Log::ERROR, "Refusing cleanup during checked migration admission");
                return;
            }

            auto state = vm->get_state();

            if ( state != VirtualMachine::ACTIVE &&
                 state != VirtualMachine::POWEROFF &&
                 state != VirtualMachine::SUSPENDED)
            {
                vm->log("LCM", Log::ERROR, "clean_action, VM in a wrong state " + vm->state_str());

                return;
            }

            switch (vm->get_lcm_state())
            {
                case VirtualMachine::CLEANUP_DELETE:
                    vm->log("LCM", Log::ERROR, "clean_action, VM in a wrong state " + vm->state_str());
                    break;

                case VirtualMachine::CLEANUP_RESUBMIT:
                    dm->trigger_resubmit(vid);
                    break;

                default:
                    vm_uid = vm->get_uid();
                    vm_gid = vm->get_gid();

                    clean_up_vm(vm.get(), false, image_id, uid, gid, req_id, vm_quotas_snp);

                    vm->delete_non_persistent_disk_snapshots(vm_quotas_snp,
                                                             ds_quotas_snp);

                    vm->delete_snapshots(vm_quotas_snp);

                    vmpool->update(vm.get());
                    break;
            }
        }
        else
        {
            return;
        }

        if ( image_id != -1 )
        {
            if ( auto image = ipool->get(image_id) )
            {
                image->set_state(Image::ERROR);

                ipool->update(image.get());
            }
        }

        if ( !ds_quotas_snp.empty() )
        {
            Quotas::ds_del_recreate(vm_uid, vm_gid, ds_quotas_snp);
        }

        if ( !vm_quotas_snp.empty())
        {
            Quotas::vm_del(vm_uid, vm_gid, &vm_quotas_snp);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::clean_up_vm(VirtualMachine * vm, bool dispose,
                                   int& image_id, int uid, int gid, int req_id, Template& quota_tmpl)
{
    HostShareCapacity sr;

    time_t the_time = time(0);

    VirtualMachine::VmState state = vm->get_state();
    VirtualMachine::LcmState lcmstate = vm->get_lcm_state();
    int vid   = vm->get_oid();

    if (dispose)
    {
        vm->set_state(VirtualMachine::ACTIVE);
        vm->set_state(VirtualMachine::CLEANUP_DELETE);
        vm->set_action(VMActions::DELETE_ACTION, uid, gid, req_id);
    }
    else
    {
        vm->set_state(VirtualMachine::ACTIVE);
        vm->set_state(VirtualMachine::CLEANUP_RESUBMIT);
        vm->set_action(VMActions::DELETE_RECREATE_ACTION, uid, gid, req_id);
    }

    vm->set_resched(false);

    if ( !vmm->is_keep_snapshots(vm->get_vmm_mad()) )
    {
        vm->delete_snapshots(quota_tmpl);
    }

    if (vm->get_etime() == 0)
    {
        vm->set_etime(the_time);
    }

    vm->get_capacity(sr);

    hpool->del_capacity(vm->get_hid(), sr);

    vm->release_vnc_port();

    if (vm->get_vm_exec_status() == "EXECUTING")
    {
        vm->set_vm_exec_attribute("STATUS", "CANCELLED");
    }

    if (state == VirtualMachine::POWEROFF ||
        state == VirtualMachine::SUSPENDED)
    {
        float memory, cpu;

        vm->get_template_attribute("MEMORY", memory);
        vm->get_template_attribute("CPU", cpu);

        quota_tmpl.add("RUNNING_MEMORY", -memory);
        quota_tmpl.add("RUNNING_CPU", -cpu);
        quota_tmpl.add("RUNNING_VMS", -1);

        vmm->trigger_cleanup(vid, false);
    }
    else switch (lcmstate)
        {
            case VirtualMachine::PROLOG:
            case VirtualMachine::PROLOG_RESUME:
            case VirtualMachine::PROLOG_RESUME_FAILURE:
            case VirtualMachine::PROLOG_UNDEPLOY:
            case VirtualMachine::PROLOG_UNDEPLOY_FAILURE:
            case VirtualMachine::PROLOG_FAILURE:
                vm->set_prolog_etime(the_time);

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::BOOT:
            case VirtualMachine::BOOT_UNKNOWN:
            case VirtualMachine::BOOT_POWEROFF:
            case VirtualMachine::BOOT_SUSPENDED:
            case VirtualMachine::BOOT_STOPPED:
            case VirtualMachine::BOOT_UNDEPLOY:
            case VirtualMachine::BOOT_MIGRATE:
            case VirtualMachine::BOOT_FAILURE:
            case VirtualMachine::BOOT_MIGRATE_FAILURE:
            case VirtualMachine::BOOT_UNDEPLOY_FAILURE:
            case VirtualMachine::BOOT_STOPPED_FAILURE:
            case VirtualMachine::RUNNING:
            case VirtualMachine::UNKNOWN:
            case VirtualMachine::SHUTDOWN:
            case VirtualMachine::SHUTDOWN_POWEROFF:
            case VirtualMachine::SHUTDOWN_UNDEPLOY:
            case VirtualMachine::HOTPLUG_SNAPSHOT:
                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::BACKUP:
                vm->set_running_etime(the_time);

                vmm->trigger_backup_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::HOTPLUG:
                vm->clear_attach_disk();

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::HOTPLUG_NIC:
            case VirtualMachine::HOTPLUG_NIC_POWEROFF:
                vm->clear_attach_nic();

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::HOTPLUG_SAVEAS:
                image_id = vm->clear_saveas_disk();

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::HOTPLUG_SAVEAS_POWEROFF:
            case VirtualMachine::HOTPLUG_SAVEAS_SUSPENDED:
                image_id = vm->clear_saveas_disk();

                vm->set_running_etime(the_time);

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::HOTPLUG_SAVEAS_UNDEPLOYED:
            case VirtualMachine::HOTPLUG_SAVEAS_STOPPED:
                image_id = vm->clear_saveas_disk();
                break;

            case VirtualMachine::HOTPLUG_PROLOG_POWEROFF:
            case VirtualMachine::HOTPLUG_EPILOG_POWEROFF:
                vm->clear_attach_disk();

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::HOTPLUG_RESIZE:
                vm->reset_resize();

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::DISK_SNAPSHOT_POWEROFF:
            case VirtualMachine::DISK_SNAPSHOT_REVERT_POWEROFF:
            case VirtualMachine::DISK_SNAPSHOT_DELETE_POWEROFF:
            case VirtualMachine::DISK_SNAPSHOT_SUSPENDED:
            case VirtualMachine::DISK_SNAPSHOT_DELETE_SUSPENDED:
            case VirtualMachine::DISK_SNAPSHOT_DELETE:
                vm->clear_snapshot_disk();

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::BACKUP_POWEROFF:
                vmm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::DISK_SNAPSHOT:
                vm->clear_snapshot_disk();

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::DISK_RESIZE:
                vm->clear_resize_disk(true);

                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::DISK_RESIZE_POWEROFF:
            case VirtualMachine::DISK_RESIZE_UNDEPLOYED:
                vm->clear_resize_disk(true);

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::RESTORE:
                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::MIGRATE:
                vm->set_running_etime(the_time);

                vm->set_previous_etime(the_time);
                vm->set_previous_vm_info();
                vm->set_previous_running_etime(the_time);

                if ( vm->get_hid() != vm->get_previous_hid() )
                {
                    hpool->del_capacity(vm->get_previous_hid(), sr);
                }

                vmpool->update_previous_history(vm);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, true);
                break;

            case VirtualMachine::SAVE_STOP:
            case VirtualMachine::SAVE_SUSPEND:
                vm->set_running_etime(the_time);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup(vid, false);
                break;

            case VirtualMachine::SAVE_MIGRATE:
                vm->set_running_etime(the_time);

                vm->set_previous_etime(the_time);
                vm->set_previous_vm_info();
                vm->set_previous_running_etime(the_time);

                if ( vm->get_hid() != vm->get_previous_hid() )
                {
                    hpool->del_capacity(vm->get_previous_hid(), sr);
                }

                vmpool->update_previous_history(vm);

                vmm->trigger_driver_cancel(vid);
                vmm->trigger_cleanup_previous(vid);
                break;

            case VirtualMachine::PROLOG_MIGRATE:
            case VirtualMachine::PROLOG_MIGRATE_FAILURE:
            case VirtualMachine::PROLOG_MIGRATE_POWEROFF:
            case VirtualMachine::PROLOG_MIGRATE_POWEROFF_FAILURE:
            case VirtualMachine::PROLOG_MIGRATE_SUSPEND:
            case VirtualMachine::PROLOG_MIGRATE_SUSPEND_FAILURE:
            case VirtualMachine::PROLOG_MIGRATE_UNKNOWN:
            case VirtualMachine::PROLOG_MIGRATE_UNKNOWN_FAILURE:
                vm->set_prolog_etime(the_time);

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete_both(vm);
                break;

            case VirtualMachine::EPILOG_STOP:
            case VirtualMachine::EPILOG_UNDEPLOY:
            case VirtualMachine::EPILOG:
            case VirtualMachine::EPILOG_FAILURE:
            case VirtualMachine::EPILOG_STOP_FAILURE:
            case VirtualMachine::EPILOG_UNDEPLOY_FAILURE:
                vm->set_epilog_etime(the_time);

                tm->trigger_driver_cancel(vid);
                tm->trigger_epilog_delete(vm);
                break;

            case VirtualMachine::LCM_INIT:
            case VirtualMachine::CLEANUP_RESUBMIT:
            case VirtualMachine::CLEANUP_DELETE:
                break;
        }

    vmpool->update_history(vm);

    vmpool->update(vm);
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::recover(VirtualMachine * vm, bool success,
                               const RequestAttributes& ra)
{
    string action;
    int vim = vm->get_oid();

    switch (vm->get_lcm_state())
    {
        //----------------------------------------------------------------------
        // Direct recovery states
        //----------------------------------------------------------------------
        case VirtualMachine::LCM_INIT:
        case VirtualMachine::RUNNING:
            return;

        case VirtualMachine::CLEANUP_DELETE:
            dm->trigger_done(vm->get_oid());
            return;

        case VirtualMachine::CLEANUP_RESUBMIT:
            dm->trigger_resubmit(vm->get_oid());
            return;

        case VirtualMachine::UNKNOWN:
            vm->set_state(VirtualMachine::RUNNING);
            vmpool->update(vm);
            return;

        //----------------------------------------------------------------------
        // Recover through re-triggering LCM events
        //----------------------------------------------------------------------
        case VirtualMachine::PROLOG:
        case VirtualMachine::PROLOG_MIGRATE:
        case VirtualMachine::PROLOG_MIGRATE_FAILURE:
        case VirtualMachine::PROLOG_RESUME:
        case VirtualMachine::PROLOG_RESUME_FAILURE:
        case VirtualMachine::PROLOG_UNDEPLOY:
        case VirtualMachine::PROLOG_UNDEPLOY_FAILURE:
        case VirtualMachine::PROLOG_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_POWEROFF:
        case VirtualMachine::PROLOG_MIGRATE_POWEROFF_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_SUSPEND:
        case VirtualMachine::PROLOG_MIGRATE_SUSPEND_FAILURE:
        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN:
        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN_FAILURE:
            if (success)
            {
                trigger_prolog_success(vim);
            }
            else
            {
                trigger_prolog_failure(vim);
            }
            break;

        case VirtualMachine::EPILOG:
        case VirtualMachine::EPILOG_STOP:
        case VirtualMachine::EPILOG_UNDEPLOY:
        case VirtualMachine::EPILOG_FAILURE:
        case VirtualMachine::EPILOG_STOP_FAILURE:
        case VirtualMachine::EPILOG_UNDEPLOY_FAILURE:
            if (success)
            {
                trigger_epilog_success(vim);
            }
            else
            {
                trigger_epilog_failure(vim);
            }
            break;

        case VirtualMachine::HOTPLUG_SAVEAS:
        case VirtualMachine::HOTPLUG_SAVEAS_POWEROFF:
        case VirtualMachine::HOTPLUG_SAVEAS_SUSPENDED:
        case VirtualMachine::HOTPLUG_SAVEAS_UNDEPLOYED:
        case VirtualMachine::HOTPLUG_SAVEAS_STOPPED:
            if (success)
            {
                trigger_saveas_success(vim);
            }
            else
            {
                trigger_saveas_failure(vim);
            }
            break;

        case VirtualMachine::HOTPLUG_PROLOG_POWEROFF:
            if (success)
            {
                trigger_attach_success(vim);
            }
            else
            {
                trigger_attach_failure(vim);
            }
            break;

        case VirtualMachine::HOTPLUG_EPILOG_POWEROFF:
            if (success)
            {
                trigger_detach_success(vim);
            }
            else
            {
                trigger_detach_failure(vim);
            }
            break;

        case VirtualMachine::BOOT:
        case VirtualMachine::BOOT_UNKNOWN:
        case VirtualMachine::BOOT_POWEROFF:
        case VirtualMachine::BOOT_SUSPENDED:
        case VirtualMachine::BOOT_STOPPED:
        case VirtualMachine::BOOT_UNDEPLOY:
        case VirtualMachine::MIGRATE:
        case VirtualMachine::BOOT_MIGRATE:
        case VirtualMachine::BOOT_MIGRATE_FAILURE:
        case VirtualMachine::BOOT_FAILURE:
        case VirtualMachine::BOOT_STOPPED_FAILURE:
        case VirtualMachine::BOOT_UNDEPLOY_FAILURE:
            if (success)
            {
                //Auto-generate deploy-id it'll work for Xen, KVM and VMware
                if (vm->get_deploy_id().empty())
                {
                    ostringstream oss;

                    oss << "one-" << vm->get_oid();

                    vm->set_deploy_id(oss.str());
                }

                trigger_deploy_success(vim);
            }
            else
            {
                trigger_deploy_failure(vim);
            }
            break;

        case VirtualMachine::BACKUP:
        case VirtualMachine::BACKUP_POWEROFF:
            if (success)
            {
                trigger_backup_success(vim);
            }
            else
            {
                trigger_backup_failure(vim);
            }
            break;

        case VirtualMachine::SHUTDOWN:
        case VirtualMachine::SHUTDOWN_POWEROFF:
        case VirtualMachine::SHUTDOWN_UNDEPLOY:
            if (success)
            {
                trigger_shutdown_success(vim);
            }
            else
            {
                trigger_shutdown_failure(vim);
            }
            break;

        case VirtualMachine::SAVE_STOP:
        case VirtualMachine::SAVE_SUSPEND:
        case VirtualMachine::SAVE_MIGRATE:
            if (success)
            {
                trigger_save_success(vim);
            }
            else
            {
                trigger_save_failure(vim);
            }
            break;

        case VirtualMachine::HOTPLUG:
            if (success)
            {
                trigger_attach_success(vim);
            }
            else
            {
                trigger_attach_failure(vim);
            }
            break;

        case VirtualMachine::HOTPLUG_NIC:
        case VirtualMachine::HOTPLUG_NIC_POWEROFF:
            if (success)
            {
                trigger_attach_nic_success(vim);
            }
            else
            {
                trigger_attach_nic_failure(vim);
            }
            break;

        //This is for all snapshot actions (create, delete & revert)
        case VirtualMachine::HOTPLUG_SNAPSHOT:
            action = vm->get_snapshot_action();

            if ( success )
            {
                if ( action == "CREATE" )
                {
                    vm->update_snapshot_id();

                    vmpool->update(vm);

                    trigger_snapshot_create_success(vim);
                }
                else if ( action == "REVERT" )
                {
                    trigger_snapshot_revert_success(vim);
                }
                else if  ( action == "DELETE" )
                {
                    trigger_snapshot_delete_success(vim);
                }
            }
            else
            {
                if ( action == "CREATE" )
                {
                    trigger_snapshot_create_failure(vim);
                }
                else if ( action == "REVERT" )
                {
                    trigger_snapshot_revert_failure(vim);
                }
                else if  ( action == "DELETE" )
                {
                    trigger_snapshot_delete_failure(vim);
                }
            }
            break;

        case VirtualMachine::HOTPLUG_RESIZE:
            if (success)
            {
                trigger_resize_success(vim);
            }
            else
            {
                trigger_resize_failure(vim);
            }
            break;

        case VirtualMachine::DISK_SNAPSHOT_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_REVERT_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_DELETE_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_SUSPENDED:
        case VirtualMachine::DISK_SNAPSHOT_DELETE_SUSPENDED:
        case VirtualMachine::DISK_SNAPSHOT:
        case VirtualMachine::DISK_SNAPSHOT_DELETE:
            if (success)
            {
                trigger_disk_snapshot_success(vim);
            }
            else
            {
                trigger_disk_snapshot_failure(vim);
            }
            break;

        case VirtualMachine::DISK_RESIZE_POWEROFF:
        case VirtualMachine::DISK_RESIZE_UNDEPLOYED:
        case VirtualMachine::DISK_RESIZE:
            if (success)
            {
                trigger_disk_resize_success(vim);
            }
            else
            {
                trigger_disk_resize_failure(vim);
            }
            break;

        case VirtualMachine::RESTORE:
            if (success)
            {
                trigger_disk_restore_success(vim);
            }
            else
            {
                trigger_disk_restore_failure(vim);
            }
            break;
    }
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

void LifeCycleManager::retry(VirtualMachine * vm)
{
    int vid = vm->get_oid();

    if ( vm->get_state() != VirtualMachine::ACTIVE )
    {
        return;
    }

    VirtualMachine::LcmState state = vm->get_lcm_state();

    if (vm->capacity_enforced() && vm->capacity_admission_state())
    {
        HostShareCapacity capacity;
        vm->get_capacity(capacity);
        std::string error;
        if (hpool->add_capacity(vm->get_hid(), capacity, true, &error,
                              [&]() { return vmpool->update(vm); }) != 0)
        {
            vm->set_template_error_message(error);
            vm->log("LCM", Log::ERROR, error + "; refusing driver retry");
            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;
            return;
        }
        if (vmpool->update(vm) != 0) return;
    }

    if (!prepare_enforced_prolog_transfer(vm)) return;

    switch (state)
    {
        case VirtualMachine::BOOT_FAILURE:
            vm->set_state(VirtualMachine::BOOT);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            vmm->trigger_deploy(vid);
            break;

        case VirtualMachine::BOOT_MIGRATE_FAILURE:
            vm->set_state(VirtualMachine::BOOT_MIGRATE);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            vmm->trigger_restore(vid);
            break;

        case VirtualMachine::BOOT_UNDEPLOY_FAILURE:
            vm->set_state(VirtualMachine::BOOT_UNDEPLOY);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            vmm->trigger_deploy(vid);
            break;

        case VirtualMachine::BOOT_STOPPED_FAILURE:
            vm->set_state(VirtualMachine::BOOT_STOPPED);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            vmm->trigger_restore(vid);
            break;

        case VirtualMachine::PROLOG_MIGRATE_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_MIGRATE);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_migr(vm);
            break;

        case VirtualMachine::PROLOG_MIGRATE_POWEROFF_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_MIGRATE_POWEROFF);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_migr(vm);
            break;


        case VirtualMachine::PROLOG_MIGRATE_SUSPEND_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_MIGRATE_SUSPEND);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_migr(vm);
            break;

        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_MIGRATE_UNKNOWN);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_migr(vm);
            break;

        case VirtualMachine::PROLOG_RESUME_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_RESUME);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_resume(vm);
            break;

        case VirtualMachine::PROLOG_UNDEPLOY_FAILURE:
            vm->set_state(VirtualMachine::PROLOG_UNDEPLOY);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog_resume(vm);
            break;

        case VirtualMachine::PROLOG_FAILURE:
            vm->set_state(VirtualMachine::PROLOG);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_prolog(vm);
            break;

        case VirtualMachine::EPILOG_FAILURE:
            vm->set_state(VirtualMachine::EPILOG);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_epilog(false, vm);
            break;

        case VirtualMachine::EPILOG_STOP_FAILURE:
            vm->set_state(VirtualMachine::EPILOG_STOP);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_epilog_stop(vm);
            break;

        case VirtualMachine::EPILOG_UNDEPLOY_FAILURE:
            vm->set_state(VirtualMachine::EPILOG_UNDEPLOY);

            if (vmpool->update(vm) != 0 && vm->capacity_enforced()) return;

            tm->trigger_epilog_stop(vm);
            break;

        case VirtualMachine::BOOT_MIGRATE:
        case VirtualMachine::BOOT_SUSPENDED:
        case VirtualMachine::BOOT_STOPPED:
        case VirtualMachine::BOOT_UNDEPLOY:
            vmm->trigger_restore(vid);
            break;

        case VirtualMachine::BOOT:
        case VirtualMachine::BOOT_POWEROFF:
        case VirtualMachine::BOOT_UNKNOWN:
            vmm->trigger_deploy(vid);
            break;

        case VirtualMachine::SHUTDOWN:
        case VirtualMachine::SHUTDOWN_POWEROFF:
        case VirtualMachine::SHUTDOWN_UNDEPLOY:
            if (vm->get_action() == VMActions::TERMINATE_ACTION)
            {
                vmm->trigger_shutdown(vid);
            }
            else
            {
                vmm->trigger_cancel(vid);
            }
            break;

        case VirtualMachine::SAVE_STOP:
        case VirtualMachine::SAVE_SUSPEND:
        case VirtualMachine::SAVE_MIGRATE:
            vmm->trigger_save(vid);
            break;

        case VirtualMachine::MIGRATE:
            vmm->trigger_migrate(vid);
            break;

        case VirtualMachine::PROLOG:
            tm->trigger_prolog(vm);
            break;

        case VirtualMachine::PROLOG_MIGRATE:
        case VirtualMachine::PROLOG_MIGRATE_POWEROFF:
        case VirtualMachine::PROLOG_MIGRATE_SUSPEND:
        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN:
            tm->trigger_prolog_migr(vm);
            break;

        case VirtualMachine::PROLOG_RESUME:
        case VirtualMachine::PROLOG_UNDEPLOY:
            tm->trigger_prolog_resume(vm);
            break;

        case VirtualMachine::EPILOG:
            tm->trigger_epilog(false, vm);
            break;

        case VirtualMachine::EPILOG_STOP:
        case VirtualMachine::EPILOG_UNDEPLOY:
            tm->trigger_epilog_stop(vm);
            break;

        case VirtualMachine::LCM_INIT:
        case VirtualMachine::CLEANUP_RESUBMIT:
        case VirtualMachine::CLEANUP_DELETE:
        case VirtualMachine::HOTPLUG:
        case VirtualMachine::HOTPLUG_NIC:
        case VirtualMachine::HOTPLUG_NIC_POWEROFF:
        case VirtualMachine::HOTPLUG_SNAPSHOT:
        case VirtualMachine::HOTPLUG_SAVEAS:
        case VirtualMachine::HOTPLUG_SAVEAS_POWEROFF:
        case VirtualMachine::HOTPLUG_SAVEAS_SUSPENDED:
        case VirtualMachine::HOTPLUG_SAVEAS_UNDEPLOYED:
        case VirtualMachine::HOTPLUG_SAVEAS_STOPPED:
        case VirtualMachine::HOTPLUG_PROLOG_POWEROFF:
        case VirtualMachine::HOTPLUG_EPILOG_POWEROFF:
        case VirtualMachine::HOTPLUG_RESIZE:
        case VirtualMachine::DISK_SNAPSHOT_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_REVERT_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_DELETE_POWEROFF:
        case VirtualMachine::DISK_SNAPSHOT_SUSPENDED:
        case VirtualMachine::DISK_SNAPSHOT_DELETE_SUSPENDED:
        case VirtualMachine::DISK_SNAPSHOT:
        case VirtualMachine::DISK_SNAPSHOT_DELETE:
        case VirtualMachine::DISK_RESIZE:
        case VirtualMachine::DISK_RESIZE_POWEROFF:
        case VirtualMachine::DISK_RESIZE_UNDEPLOYED:
        case VirtualMachine::RUNNING:
        case VirtualMachine::UNKNOWN:
        case VirtualMachine::BACKUP:
        case VirtualMachine::BACKUP_POWEROFF:
        case VirtualMachine::RESTORE:
            break;
    }

    return;
}

/*  -------------------------------------------------------------------------- */
/*  -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_updatesg(int sgid)
{
    trigger([this, sgid]
    {
        int  vmid, rc;

        auto sg = sgpool->get(sgid);

        if ( sg == nullptr )
        {
            return;
        }

        // -------------------------------------------------------------------------
        // Iterate over SG VMs, rules at hypervisor are updated one by one
        // -------------------------------------------------------------------------
        do
        {
            bool is_error  = false;
            bool is_tmpl   = false;
            bool is_update = false;

            rc = sg->get_outdated(vmid);

            sgpool->update(sg.get());

            sg.reset();

            if ( rc != 0 )
            {
                return;
            }

            if ( auto vm = vmpool->get(vmid) )
            {
                VirtualMachine::LcmState lstate = vm->get_lcm_state();
                VirtualMachine::VmState  state  = vm->get_state();

                if ( state != VirtualMachine::ACTIVE ) //Update just VM info
                {
                    is_tmpl = true;
                }
                else
                {
                    switch (lstate)
                    {
                        //Cannnot update VM, SG rules being updated/created
                        case VirtualMachine::BOOT:
                        case VirtualMachine::BOOT_MIGRATE:
                        case VirtualMachine::BOOT_SUSPENDED:
                        case VirtualMachine::BOOT_STOPPED:
                        case VirtualMachine::BOOT_UNDEPLOY:
                        case VirtualMachine::BOOT_POWEROFF:
                        case VirtualMachine::BOOT_UNKNOWN:
                        case VirtualMachine::BOOT_FAILURE:
                        case VirtualMachine::BOOT_MIGRATE_FAILURE:
                        case VirtualMachine::BOOT_UNDEPLOY_FAILURE:
                        case VirtualMachine::BOOT_STOPPED_FAILURE:
                        case VirtualMachine::MIGRATE:
                        case VirtualMachine::HOTPLUG_NIC:
                        case VirtualMachine::HOTPLUG_NIC_POWEROFF:
                        case VirtualMachine::UNKNOWN:
                            is_error = true;
                            break;

                        //Update just VM information
                        case VirtualMachine::LCM_INIT:
                        case VirtualMachine::PROLOG:
                        case VirtualMachine::PROLOG_MIGRATE_FAILURE:
                        case VirtualMachine::PROLOG_MIGRATE_POWEROFF_FAILURE:
                        case VirtualMachine::PROLOG_MIGRATE_SUSPEND_FAILURE:
                        case VirtualMachine::PROLOG_RESUME_FAILURE:
                        case VirtualMachine::PROLOG_UNDEPLOY_FAILURE:
                        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN_FAILURE:
                        case VirtualMachine::PROLOG_FAILURE:
                        case VirtualMachine::PROLOG_MIGRATE:
                        case VirtualMachine::PROLOG_MIGRATE_POWEROFF:
                        case VirtualMachine::PROLOG_MIGRATE_SUSPEND:
                        case VirtualMachine::PROLOG_MIGRATE_UNKNOWN:
                        case VirtualMachine::PROLOG_RESUME:
                        case VirtualMachine::PROLOG_UNDEPLOY:
                        case VirtualMachine::EPILOG:
                        case VirtualMachine::EPILOG_STOP:
                        case VirtualMachine::EPILOG_UNDEPLOY:
                        case VirtualMachine::EPILOG_FAILURE:
                        case VirtualMachine::EPILOG_STOP_FAILURE:
                        case VirtualMachine::EPILOG_UNDEPLOY_FAILURE:
                        case VirtualMachine::SHUTDOWN:
                        case VirtualMachine::SHUTDOWN_POWEROFF:
                        case VirtualMachine::SHUTDOWN_UNDEPLOY:
                        case VirtualMachine::SAVE_STOP:
                        case VirtualMachine::SAVE_SUSPEND:
                        case VirtualMachine::SAVE_MIGRATE:
                        case VirtualMachine::CLEANUP_RESUBMIT:
                        case VirtualMachine::CLEANUP_DELETE:
                        case VirtualMachine::DISK_RESIZE_POWEROFF:
                        case VirtualMachine::DISK_RESIZE_UNDEPLOYED:
                        case VirtualMachine::DISK_SNAPSHOT_POWEROFF:
                        case VirtualMachine::DISK_SNAPSHOT_REVERT_POWEROFF:
                        case VirtualMachine::DISK_SNAPSHOT_DELETE_POWEROFF:
                        case VirtualMachine::DISK_SNAPSHOT_SUSPENDED:
                        case VirtualMachine::DISK_SNAPSHOT_DELETE_SUSPENDED:
                        case VirtualMachine::HOTPLUG_SAVEAS_POWEROFF:
                        case VirtualMachine::HOTPLUG_SAVEAS_SUSPENDED:
                        case VirtualMachine::HOTPLUG_SAVEAS_UNDEPLOYED:
                        case VirtualMachine::HOTPLUG_SAVEAS_STOPPED:
                        case VirtualMachine::HOTPLUG_PROLOG_POWEROFF:
                        case VirtualMachine::HOTPLUG_EPILOG_POWEROFF:
                        case VirtualMachine::BACKUP_POWEROFF:
                        case VirtualMachine::RESTORE:
                            is_tmpl = true;
                            break;

                        //Update VM information + SG rules at host
                        case VirtualMachine::RUNNING:
                        case VirtualMachine::HOTPLUG:
                        case VirtualMachine::HOTPLUG_SNAPSHOT:
                        case VirtualMachine::HOTPLUG_SAVEAS:
                        case VirtualMachine::HOTPLUG_RESIZE:
                        case VirtualMachine::DISK_SNAPSHOT:
                        case VirtualMachine::DISK_SNAPSHOT_DELETE:
                        case VirtualMachine::DISK_RESIZE:
                        case VirtualMachine::BACKUP:
                            is_update = true;
                            break;
                    }
                }

                // -------------------------------------------------------------
                // Update VM template with the new SG rules & trigger update
                // -------------------------------------------------------------
                if ( is_tmpl || is_update )
                {
                    vector<VectorAttribute *> sg_rules;

                    sgpool->get_security_group_rules(-1, sgid, sg_rules);

                    vm->remove_security_group(sgid);

                    vm->add_template_attribute(sg_rules);

                    vmpool->update(vm.get());
                }

                if ( is_update )
                {
                    vmm->updatesg(vm.get(), sgid);
                }
            }
            else
            {
                continue;
            }

            sg = sgpool->get(sgid);

            if ( sg == nullptr )
            {
                return;
            }

            // ---------------------------------------------------------------------
            // Update VM status in the security group and exit
            // ---------------------------------------------------------------------
            if ( is_error )
            {
                sg->add_error(vmid);
            }
            else if ( is_tmpl )
            {
                sg->add_vm(vmid);
            }
            else if ( is_update )
            {
                sg->add_updating(vmid);
            }

            sgpool->update(sg.get());

            if (is_update)
            {
                return;
            }
        } while (true);
    });
}

/*  -------------------------------------------------------------------------- */
/*  -------------------------------------------------------------------------- */

void LifeCycleManager::trigger_updatevnet(int vnid)
{
    trigger([this, vnid]
    {
        int  vmid, rc;

        auto vnet = vnpool->get(vnid);

        if ( vnet == nullptr )
        {
            return;
        }

        // -------------------------------------------------------------------------
        // Iterate over VNET VMs, networks at hypervisor are updated one by one
        // -------------------------------------------------------------------------
        do
        {
            bool is_error  = false;
            bool is_tmpl   = false;
            bool is_update = false;

            rc = vnet->get_outdated(vmid);

            if ( rc != 0 )
            {
                vnet->remove_template_attribute("VNET_UPDATE");

                vnpool->update(vnet.get());
                return;
            }

            vnpool->update(vnet.get());

            vnet.reset();

            if ( auto vm = vmpool->get(vmid) )
            {
                VirtualMachine::LcmState lstate = vm->get_lcm_state();
                VirtualMachine::VmState  state  = vm->get_state();

                if ( state != VirtualMachine::ACTIVE ) // Update just VM info
                {
                    is_tmpl = true;
                }
                else
                {
                    switch (lstate)
                    {
                        // Can't live update the NIC, wrong VM state
                        case VirtualMachine::BOOT:
                        case VirtualMachine::BOOT_MIGRATE:
                        case VirtualMachine::BOOT_SUSPENDED:
                        case VirtualMachine::BOOT_STOPPED:
                        case VirtualMachine::BOOT_UNDEPLOY:
                        case VirtualMachine::BOOT_POWEROFF:
                        case VirtualMachine::BOOT_UNKNOWN:
                        case VirtualMachine::BOOT_FAILURE:
                        case VirtualMachine::BOOT_MIGRATE_FAILURE:
                        case VirtualMachine::BOOT_UNDEPLOY_FAILURE:
                        case VirtualMachine::BOOT_STOPPED_FAILURE:
                        case VirtualMachine::MIGRATE:
                        case VirtualMachine::HOTPLUG_NIC:
                        case VirtualMachine::HOTPLUG_NIC_POWEROFF:
                        case VirtualMachine::HOTPLUG:
                        case VirtualMachine::HOTPLUG_SNAPSHOT:
                        case VirtualMachine::HOTPLUG_SAVEAS:
                        case VirtualMachine::HOTPLUG_RESIZE:
                        case VirtualMachine::DISK_SNAPSHOT:
                        case VirtualMachine::DISK_SNAPSHOT_DELETE:
                        case VirtualMachine::DISK_RESIZE:
                        case VirtualMachine::UNKNOWN:
                            is_error = true;
                            break;

                        // Update VM information + virtual network at host
                        case VirtualMachine::RUNNING:
                            is_update = true;
                            break;

                        // Update just VM information
                        default:
                            is_tmpl = true;
                            break;
                    }
                }

                // -------------------------------------------------------------
                // Update VM template with the new NIC attributes & trigger update
                // -------------------------------------------------------------
                if ( is_tmpl || is_update )
                {
                    rc = vm->nic_update(vnid);

                    if (rc < 0)
                    {
                        NebulaLog::error("LCM", "VM " + to_string(vm->get_oid())
                                         + ": Unable to update Virtual Network " + to_string(vnid));

                        is_error = true;
                        is_tmpl = is_update = false;
                    }

                    if (is_update && vm->get_template_attribute("VNET_UPDATE") == nullptr)
                    {
                        // Do not trigger driver update in case no attribute was updated
                        is_update = false;
                        is_tmpl = true;
                    }

                    if (is_update)
                    {
                        vm->set_state(VirtualMachine::HOTPLUG_NIC);

                        RequestAttributes ra(AuthRequest::NONE);
                        ra.uid = vm->get_uid();
                        ra.gid = vm->get_gid();
                        ra.req_id = 0;

                        DispatchManager::close_cp_history(vmpool, vm.get(),
                                                          VMActions::NIC_UPDATE_ACTION, ra);
                    }

                    vmpool->update(vm.get());
                }

                if ( is_update )
                {
                    vmm->updatenic(vm.get(), vnid);
                }
            }
            else
            {
                continue;
            }

            vnet = vnpool->get(vnid);

            if ( vnet == nullptr )
            {
                return;
            }

            // ---------------------------------------------------------------------
            // Update VM status in the security group and exit
            // ---------------------------------------------------------------------
            if ( is_error )
            {
                vnet->add_error(vmid);
            }
            else if ( is_tmpl )
            {
                vnet->add_updated(vmid);
            }
            else if ( is_update )
            {
                vnet->add_updating(vmid);
            }

            vnpool->update(vnet.get());

            if (is_update)
            {
                return;
            }
        } while (true);
    });
}
