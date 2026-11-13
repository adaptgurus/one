/* Copyright 2026, LayerSentry contributors. Licensed under Apache-2.0. */
#ifndef SCHEDULER_HOST_CONTEXT_H_
#define SCHEDULER_HOST_CONTEXT_H_

#include <map>
#include <set>
#include <string>
#include <vector>

/**
 * Keep cluster-health inventory separate from per-VM destination eligibility.
 *
 * Native matching deliberately removes a rescheduled VM's current host from
 * destination candidates. Removing that still-monitored host from HOST_POOL
 * also makes resilience admission count a three-host cluster as two hosts.
 *
 * Expand only to the original cached pool's hosts in matched clusters. The
 * caller must continue serializing the UNMODIFIED REQUIREMENTS host lists;
 * this context is not an authorization to place on an unmatched host.
 * No live API reread, new host, other cluster or relaxation is synthesized.
 */
template<typename ClusterLookup>
bool scheduler_host_context(
        const std::vector<int>& available_hosts,
        const std::set<int>& matched_hosts,
        ClusterLookup cluster_for,
        std::set<int>& context_hosts,
        std::set<int>& context_clusters,
        std::string& error)
{
    context_hosts.clear();
    context_clusters.clear();
    error.clear();

    if (matched_hosts.empty())
    {
        error = "scheduler host context requires matched destinations";
        return false;
    }

    std::map<int, int> inventory;
    for (int id : available_hosts)
    {
        const int cluster = cluster_for(id);
        if (id < 0 || cluster < 0)
        {
            error = "scheduler host context contains missing host identity";
            return false;
        }
        inventory.emplace(id, cluster);
    }

    for (int id : matched_hosts)
    {
        auto item = inventory.find(id);
        if (item == inventory.end())
        {
            error = "matched host is not in the authoritative scheduler pool";
            context_clusters.clear();
            return false;
        }
        context_clusters.insert(item->second);
    }

    for (const auto& [id, cluster] : inventory)
    {
        if (context_clusters.count(cluster) != 0)
        {
            context_hosts.insert(id);
        }
    }
    return true;
}
#endif
