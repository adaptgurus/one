#include "SchedulerHostContext.h"
#include <cassert>
#include <iostream>

int main()
{
    const std::map<int,int> inventory{{0,0},{1,0},{2,0},{10,5},{11,5},{99,9}};
    auto lookup = [&inventory](int id) {
        auto it=inventory.find(id);
        return it==inventory.end() ? -1 : it->second;
    };
    std::set<int> hosts,clusters;
    std::string error;
    const std::vector<int> all{0,1,2,10,11,99};
    const std::set<int> candidates{0,2};
    assert(scheduler_host_context(all,candidates,lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{0,1,2}));
    assert((clusters==std::set<int>{0}));
    assert((candidates==std::set<int>{0,2})); // No candidate expansion.

    assert(scheduler_host_context(all,{0},lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{0,1,2})); // Pin validation remains downstream.
    assert(scheduler_host_context(all,{0,10},lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{0,1,2,10,11}));
    assert((clusters==std::set<int>{0,5}));
    assert(scheduler_host_context({0,2},{0,2},lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{0,2})); // Never invent missing/failed host 1.
    assert(!scheduler_host_context(all,{},lookup,hosts,clusters,error));
    assert(hosts.empty() && clusters.empty());
    assert(!scheduler_host_context({0,1},{0,2},lookup,hosts,clusters,error));
    assert(!scheduler_host_context({0,1,404},{0},lookup,hosts,clusters,error));
    assert(!scheduler_host_context({-1,0},{0},lookup,hosts,clusters,error));
    assert(scheduler_host_context({0,0,1,2},{0},lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{0,1,2}));
    assert(scheduler_host_context(all,{99},lookup,hosts,clusters,error));
    assert((hosts==std::set<int>{99}));
    std::cout << "SCHEDULER_HOST_CONTEXT_10_CASES_PASS\n";
    // Exhaust all nonempty destination subsets against every cached pool
    // subset. Context completion must never alter candidate eligibility.
    const std::vector<int> universe{0,1,2,10,11,99};
    unsigned checked=0;
    for (unsigned pool_mask=0; pool_mask<64; ++pool_mask)
    {
        for (unsigned candidate_mask=1; candidate_mask<64; ++candidate_mask)
        {
            std::vector<int> pool;
            std::set<int> target;
            for (unsigned i=0; i<universe.size(); ++i)
            {
                if (pool_mask & (1u<<i)) pool.push_back(universe[i]);
                if (candidate_mask & (1u<<i)) target.insert(universe[i]);
            }
            const auto unchanged=target;
            const bool should_accept=(candidate_mask & ~pool_mask)==0;
            const bool accepted=scheduler_host_context(pool,target,lookup,hosts,clusters,error);
            assert(accepted==should_accept);
            assert(target==unchanged);
            if (accepted)
            {
                std::set<int> expected_hosts,expected_clusters;
                for (int id:target) expected_clusters.insert(lookup(id));
                for (int id:pool)
                    if (expected_clusters.count(lookup(id))) expected_hosts.insert(id);
                assert(hosts==expected_hosts && clusters==expected_clusters);
            }
            ++checked;
        }
    }
    assert(checked==4032);
    std::cout << "SCHEDULER_HOST_CONTEXT_4032_SUBSET_CASES_PASS\n";

}
