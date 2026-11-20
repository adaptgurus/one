#ifndef ONE_DRS_ELIGIBILITY_H_
#define ONE_DRS_ELIGIBILITY_H_

#include "AclManager.h"
#include "Cluster.h"
#include "ClusterPool.h"
#include "Host.h"
#include "HostShareCapacity.h"
#include "Nebula.h"
#include "NebulaUtil.h"
#include "UserPool.h"
#include "VirtualMachine.h"

#include <algorithm>
#include <cstdlib>
#include <sstream>

// These identities are generated from the exact cached native scheduler input.
// Monitoring counters are deliberately excluded: current native capacity and
// requirements are re-evaluated at admission while holding VM and target locks.
namespace one_drs_eligibility
{
constexpr const char* SCOPE = "RUNNING_UNPINNED_NO_PCI_NO_VMGROUP_SAME_DATASTORE_CROSS_HOST";
constexpr const char* CAPABILITY = "SOURCE_BOUND_CURRENT_OWNER_REQUIREMENTS";

inline bool valid_sha256(const std::string& value)
{
    return value.size() == 64 && std::all_of(value.begin(), value.end(),
        [](unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); });
}

inline void field(std::ostringstream& out, const std::string& value)
{
    out << value.size() << ':' << value << ';';
}

template<typename T>
inline void field(std::ostringstream& out, T value)
{
    field(out, std::to_string(value));
}

inline std::string identity(const VirtualMachine& vm, const Host& target,
                            const Cluster& cluster, bool pending = false)
{
    if (!vm.hasHistory() || (pending && !vm.hasPreviousHistory())) return "";
    std::string requirements, automatic;
    vm.get_user_template_attribute("SCHED_REQUIREMENTS", requirements);
    vm.get_template_attribute("AUTOMATIC_REQUIREMENTS", automatic);
    HostShareCapacity capacity;
    vm.get_capacity(capacity);

    std::ostringstream out;
    field(out, std::string("one-drs-native-eligibility-v1"));
    field(out, vm.get_oid());
    field(out, vm.get_uid());
    field(out, vm.get_gid());
    field(out, static_cast<int>(vm.get_lock_state()));
    field(out, pending ? vm.get_previous_hid() : vm.get_hid());
    field(out, pending ? vm.get_previous_cid() : vm.get_cid());
    field(out, pending ? vm.get_previous_ds_id() : vm.get_ds_id());
    field(out, capacity.cpu);
    field(out, capacity.mem);
    field(out, capacity.vcpu);
    field(out, vm.is_pinned() ? 1 : 0);
    field(out, static_cast<int>(capacity.nodes.size()));
    field(out, static_cast<int>(capacity.pci.size()));
    field(out, vm.get_template_attribute("VMGROUP") != nullptr ? 1 : 0);
    field(out, requirements);
    field(out, automatic);
    field(out, target.get_oid());
    field(out, target.get_name());
    field(out, target.get_cluster_id());
    field(out, target.get_vmm_mad());
    field(out, target.get_im_mad());
    field(out, cluster.template_sha256());
    return one_util::sha256_digest(out.str());
}

// Caller holds the VM lock and, for final admission, the native target host lock.
// Read-only preflight is useful feedback only; this function must also run inside
// the target test+reserve critical section. No native policy or template is edited.
inline bool validate(VirtualMachine& vm, Host& target, Cluster& cluster,
                     const std::string& expected, bool pending,
                     std::string& error, std::string* category = nullptr)
{
    const auto fail = [&](const char* state, const std::string& reason)
    {
        if (category) *category = state;
        error = reason;
        return false;
    };
    if (vm.get_template_attribute("VMGROUP") != nullptr)
        return fail("UNSUPPORTED", "VMGroup checked migration requires separate admission qualification");
    if (!valid_sha256(expected))
        return fail("STALE", "Native recommendation lacks a valid source eligibility identity");
    if (!vm.hasHistory() || (pending && !vm.hasPreviousHistory()))
        return fail("STALE", "Native VM source history is unavailable");
    if (vm.get_lock_state() != PoolObjectSQL::ST_NONE)
        return fail("STALE", "Native VM is locked against checked migration");
    const int source_cid = pending ? vm.get_previous_cid() : vm.get_cid();
    const int source_hid = pending ? vm.get_previous_hid() : vm.get_hid();
    if (target.get_state() != Host::MONITORED || target.get_cluster_id() != source_cid ||
        cluster.get_oid() != source_cid || target.get_oid() == source_hid)
        return fail("STALE", "Current target is not an enabled cross-host destination in the approved cluster");
    if (identity(vm, target, cluster, pending) != expected)
        return fail("STALE", "Native VM, target or policy eligibility changed since optimization");
    if (pending && (vm.get_hid() != target.get_oid() || vm.get_hostname() != target.get_name() ||
                    vm.get_vmm_mad() != target.get_vmm_mad()))
        return fail("STALE", "Pending migration target identity changed");

    auto user = Nebula::instance().get_upool()->get_ro(vm.get_uid());
    if (!user || !user->isEnabled())
        return fail("STALE", "Current VM owner is unavailable or disabled");
    if (vm.get_uid() != 0 && vm.get_gid() != 0)
    {
        PoolObjectAuth permissions;
        target.get_permissions(permissions);
        if (!Nebula::instance().get_aclm()->authorize(vm.get_uid(), user->get_groups(),
                                                      permissions, AuthRequest::MANAGE))
            return fail("STALE", "Current VM owner is not authorized to use the target host");
    }

    // Rebuild only the XPath observation, then add the same cluster context used
    // by native match_hosts. Host::to_xml persists members, not these added nodes.
    std::string host_xml;
    target.to_xml(host_xml);
    if (target.update_from_str(host_xml) != 0)
        return fail("STALE", "Current target XML cannot be evaluated");
    target.remove_nodes("/HOST/CLUSTER_TEMPLATE");
    std::vector<xmlNodePtr> nodes;
    cluster.get_nodes("/CLUSTER/TEMPLATE", nodes);
    if (nodes.size() != 1)
    {
        ObjectXML::free_nodes(nodes);
        return fail("STALE", "Current cluster scheduling context is unavailable");
    }
    const int added = target.add_node("/HOST", nodes.front(), "CLUSTER_TEMPLATE");
    ObjectXML::free_nodes(nodes);
    if (added != 0)
        return fail("STALE", "Current cluster scheduling context cannot be evaluated");

    std::string requirements, automatic;
    vm.get_user_template_attribute("SCHED_REQUIREMENTS", requirements);
    vm.get_template_attribute("AUTOMATIC_REQUIREMENTS", automatic);
    if (!requirements.empty() && !automatic.empty())
        requirements = automatic + " & ( " + requirements + " )";
    else if (requirements.empty())
        requirements = automatic;
    if (!requirements.empty())
    {
        bool matched = false;
        char* detail = nullptr;
        const int rc = target.eval_bool(requirements, matched, &detail);
        if (detail) std::free(detail);
        if (rc != 0 || !matched)
            return fail("STALE", "Current target no longer satisfies native scheduling requirements");
    }
    if (category) *category = "ELIGIBLE";
    error.clear();
    return true;
}
}
#endif
