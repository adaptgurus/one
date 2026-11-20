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

#ifndef HOST_POOL_H_
#define HOST_POOL_H_

#include <functional>
#include "PoolSQL.h"
#include "Host.h"
#include "HostMonitoringTemplate.h"
#include "OneDB.h"

#include <sstream>

#include <vector>

/**
 *  The Host Pool class.
 */
class HostPool : public PoolSQL
{
public:
    HostPool(SqlDB * db, const std::vector<const SingleAttribute *>& secrets);

    ~HostPool() = default;

    /**
     *  Function to allocate a new Host object
     *    @param oid the id assigned to the Host
     *    @return the oid assigned to the object or -1 in case of failure
     */
    int allocate (
            int *              oid,
            const std::string& hostname,
            const std::string& im_mad_name,
            const std::string& vmm_mad_name,
            int                cluster_id,
            const std::string& cluster_name,
            std::string&       error_str);

    /**
     *  Updates a Host in the data base. It also updates the previous state
     *  after executing the hooks.
     *    @param objsql a pointer to the Host
     *
     *    @return 0 on success.
     */
    int update(PoolObjectSQL * objsql) override;

    /**
     *  Gets an object from the pool (if needed the object is loaded from the
     *  database). The object is locked, other threads can't access the same
     *  object. The lock is released by destructor.
     *   @param oid the Host unique identifier
     *   @return a pointer to the Host, nullptr in case of failure
     */
    std::unique_ptr<Host> get(int oid)
    {
        return PoolSQL::get<Host>(oid);
    }

    /**
     *  Gets a read only object from the pool (if needed the object is loaded from the
     *  database). No object lock, other threads may work with the same object.
     *   @param oid the Host unique identifier
     *   @return a pointer to the Host, nullptr in case of failure
     */
    std::unique_ptr<Host> get_ro(int oid)
    {
        return PoolSQL::get_ro<Host>(oid);
    }

    /**
     *  Gets an object from the pool (if needed the object is loaded from the
     *  database). The object is locked, other threads can't access the same
     *  object. The lock is released by destructor.
     *    @param hostname
     *    @return a pointer to the Host, nullptr if the Host could not be loaded
     */
    std::unique_ptr<Host> get(const std::string& name)
    {
        // The owner is set to -1, because it is not used in the key() method
        return PoolSQL::get<Host>(name, -1);
    }

    /**
     *  Gets a read only object from the pool (if needed the object is loaded from the
     *  database). No object lock, other threads may work with the same object.
     *    @param hostname
     *    @return a pointer to the Host, 0 if the Host could not be loaded
     */
    std::unique_ptr<Host> get_ro(const std::string& name)
    {
        // The owner is set to -1, because it is not used in the key() method
        return PoolSQL::get_ro<Host>(name, -1);
    }

    /**
     *  Generate an index key for the object
     *    @param name of the object
     *    @param uid owner of the object, only used if needed
     *
     *    @return the key, a string
     */
    std::string key(const std::string& name, int uid)
    {
        // Name is enough key because Hosts can't repeat names.
        return name;
    };

    /**
     *  Bootstraps the database table(s) associated to the Host pool
     *    @return 0 on success
     */
    static int bootstrap(SqlDB *_db)
    {
        int rc;

        std::ostringstream oss_host(one_db::host_db_bootstrap);
        std::ostringstream oss_monitor(one_db::host_monitor_db_bootstrap);

        rc =  _db->exec_local_wr(oss_host);
        rc += _db->exec_local_wr(oss_monitor);

        return rc;
    };

    /**
     * Allocates a given capacity to the host
     *   @param oid the id of the host to allocate the capacity
     *   @param vm_id id of the vm to add to the host
     *   @param cpu amount of CPU, in percentage
     *   @param mem amount of main memory, in KB
     *   @param disk amount of disk
     *   @param pci devices requested by the VM
     *
     *   @return 0 on success -1 in case of failure
     */
    int add_checked_capacity(int oid, int expected_cluster, HostShareCapacity& sr,
                             std::string& error, const std::function<int()>& persist_request,
                             bool already_on_host = false)
    {
        auto host = get(oid);
        if (!host)
        {
            error = "Checked migration target host is unavailable";
            return -2;
        }
        if (host->get_cluster_id() != expected_cluster || host->get_state() != Host::MONITORED)
        {
            error = "Checked migration target is no longer an enabled monitored host in the approved cluster";
            return -1;
        }
        const bool accounted = host->get_vm_ids().count(sr.vmid) != 0;
        if (already_on_host)
        {
            if (accounted) return 0;
            error = "Checked migration source host no longer accounts for the VM";
            return -1;
        }
        // The caller holds the VM in durable checked pending state. The API
        // rejected prior target membership before writing that history, and all
        // other native lifecycle/capacity mutations reject this state. Membership
        // here is therefore an idempotent replay of this pending reservation.
        if (accounted) return 0;
        if (!host->test_capacity(sr, error, true)) return -1;
        host->add_capacity(sr);
        // PCI/NUMA allocation can update the VM template through capacity
        // pointers. Its pending record must be durable before the host ledger,
        // so restart can release/reuse the exact committed allocation.
        if (persist_request() != 0)
        {
            error = "Unable to persist checked migration allocation metadata";
            return -2;
        }
        if (update(host.get()) != 0)
        {
            error = "Unable to persist checked migration capacity reservation";
            return -2;
        }
        return 0;
    }

    int del_checked_capacity(int oid, HostShareCapacity& sr)
    {
        auto host = get(oid);
        if (!host) return -1;
        if (host->get_vm_ids().count(sr.vmid) == 0) return 0;
        host->del_capacity(sr);
        return update(host.get());
    }

    int add_capacity(int oid, HostShareCapacity &sr, bool enforce = false,
                     std::string* error = nullptr,
                     const std::function<int()>& persist_request = {})
    {
        auto host = get(oid);
        if (!host)
        {
            if (error) *error = "Target host is unavailable";
            return -1;
        }
        // The same native ledger is used by checked migration, deploy, migrate
        // and resize. Retrying a reservation already owned by this VM is a no-op.
        if (host->get_vm_ids().count(sr.vmid) != 0) return 0;
        std::string reason;
        if (enforce && !host->test_capacity(sr, reason, true))
        {
            if (error) *error = "Enforced capacity admission refused: " + reason;
            return -2;
        }
        host->add_capacity(sr);
        if (enforce && persist_request && persist_request() != 0)
        {
            if (error) *error = "Enforced capacity admission could not persist VM allocation metadata";
            return -3;
        }
        const int rc = update(host.get());
        if (enforce && rc != 0)
        {
            if (error) *error = "Enforced capacity admission could not persist host accounting";
            return -3;
        }
        return 0;
    }

    /**
     * De-Allocates a given capacity to the host
     *   @param oid the id of the host to allocate the capacity
     *   @param vm_id id of the vm to add to the host
     *   @param cpu amount of CPU
     *   @param mem amount of main memory
     *   @param disk amount of disk
     *   @param pci devices requested by the VM
     */
    void del_capacity(int oid, HostShareCapacity &sr)
    {
        if ( auto host = get(oid) )
        {
            host->del_capacity(sr);

            update(host.get());
        }
    }

    int drop(PoolObjectSQL * objsql, std::string& error_msg) override
    {
        Host * host = static_cast<Host *>(objsql);

        if ( host->get_share_running_vms() > 0 )
        {
            error_msg = "Can not remove a host with running VMs";
            return -1;
        }

        return PoolSQL::drop(objsql, error_msg);
    };

    /**
     *  Dumps the HOST pool in XML format. A filter can be also added to the
     *  query
     *  @param oss the output stream to dump the pool contents
     *  @param where filter for the objects, defaults to all
     *  @param sid first element used for pagination
     *  @param eid last element used for pagination, -1 to disable
     *  @param desc descending order of pool elements
     *
     *  @return 0 on success
     */
    int dump(std::string& oss, const std::string& where, int sid, int eid,
             bool desc) override
    {
        return PoolSQL::dump(oss, "HOST_POOL", "body", one_db::host_table,
                             where, sid, eid, desc);
    };

    /**
     *  Finds a set objects that satisfies a given condition
     *   @param oids a vector with the oids of the objects.
     *   @param the name of the DB table.
     *   @param where condition in SQL format.
     *
     *   @return 0 on success
     */
    int search(std::vector<int>& oids, const std::string& where)
    {
        return PoolSQL::search(oids, one_db::host_table, where);
    };

    /**
     *  Dumps the host monitoring information entries in XML format. A filter
     *  can be also added to the query.
     *
     *  @param oss the output stream to dump the pool contents
     *  @param where filter for the objects, defaults to all
     *  @param seconds Retrieve monitor records in the last seconds
     *
     *  @return 0 on success
     */
    int dump_monitoring(std::string& oss, const std::string&  where, const int seconds);

    /**
     *  Dumps the HOST monitoring information for a single HOST
     *
     *  @param oss the output stream to dump the pool contents
     *  @param hostid id of the target HOST
     *
     *  @return 0 on success
     */
    int dump_monitoring(std::string& oss, int hostid)
    {
        std::ostringstream filter;

        filter << "oid = " << hostid;

        return dump_monitoring(oss, filter.str(), -1);
    }

    /**
     * Returns last monitoring info for a host
     *  @param hid host id
     */
    HostMonitoringTemplate get_monitoring(int hid);

private:
    /**
     *  Factory method to produce Host objects
     *    @return a pointer to the new Host
     */
    PoolObjectSQL * create() override
    {
        return new Host(-1, "", "", "", -1, "");
    };
};

#endif /*HOST_POOL_H_*/
