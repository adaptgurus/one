package recommendation

import (
	"sort"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
)

type Options struct {
	SwitchLACP bool   `json:"switch_lacp"`
	Profile    string `json:"profile,omitempty"` // compute (default) or frontend
}

type Role struct {
	Name       string   `json:"name"`
	Interfaces []string `json:"interfaces,omitempty"`
	BondMode   string   `json:"bond_mode,omitempty"`
	SharedWith string   `json:"shared_with,omitempty"`
	SpeedMbps  int      `json:"speed_mbps,omitempty"`
	RDMA       bool     `json:"rdma,omitempty"`
	Dedicated  bool     `json:"dedicated"`
	MTU        int      `json:"mtu"`
	VLANTrunk  bool     `json:"vlan_trunk,omitempty"`
}

type Plan struct {
	Schema          string   `json:"schema"`
	Profile         string   `json:"profile"`
	Strategy        string   `json:"strategy"`
	EligibleNICs    int      `json:"eligible_nics"`
	ProductionReady bool     `json:"production_ready"`
	Roles           []Role   `json:"roles"`
	Warnings        []string `json:"warnings,omitempty"`
}
type candidate struct {
	inventory.NIC
}

func Recommend(nics []inventory.NIC, options Options) Plan {
	candidates := make([]candidate, 0, len(nics))
	for _, nic := range nics {
		if nic.EligibleForFabric && nic.Name != "" {
			candidates = append(candidates, candidate{NIC: nic})
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].Name < candidates[j].Name })
	profile := options.Profile
	if profile == "" {
		profile = "compute"
	}
	plan := Plan{Schema: "layersentry-network-recommendation/v1", Profile: profile, Strategy: "automatic-safe", EligibleNICs: len(candidates)}
	if profile != "compute" && profile != "frontend" {
		plan.Warnings = append(plan.Warnings, "unknown host profile")
		return plan
	}
	if len(candidates) < 2 {
		plan.Warnings = append(plan.Warnings, "at least two eligible NICs are required for resilient production management")
		plan.Roles = append(plan.Roles, sharedRole("management", "", 1500))
		return plan
	}

	managementPool := nonRDMA(candidates)
	if len(managementPool) < 2 {
		managementPool = candidates
	}
	management, remaining := takePair(candidates, pickPair(managementPool, false))
	plan.Roles = append(plan.Roles, pairRole("management", management, "active-backup", false, 1500))
	plan.ProductionReady = allLinkUp(management)
	if !allLinkUp(management) {
		plan.Warnings = append(plan.Warnings, "management recommendation includes a link-down interface")
	}
	if profile == "frontend" {
		plan.Strategy = "automatic-frontend"
		return plan
	}
	rdmaPool := onlyRDMA(remaining)
	var storage []candidate
	if len(rdmaPool) >= 2 {
		storage, remaining = takePair(remaining, pickPair(rdmaPool, true))
	}

	workloadMode := "active-backup"
	if options.SwitchLACP {
		workloadMode = "802.3ad"
	}
	workloadPair := pickPair(remaining, true)
	if len(workloadPair) == 2 {
		var workload []candidate
		workload, remaining = takePair(remaining, workloadPair)
		plan.Roles = append(plan.Roles, pairRole("workload", workload, workloadMode, true, 1500))
		if !allLinkUp(workload) {
			plan.ProductionReady = false
			plan.Warnings = append(plan.Warnings, "workload recommendation includes a link-down interface")
		}
	} else {
		plan.Roles = append(plan.Roles, sharedRole("workload", "management", 1500))
		plan.Warnings = append(plan.Warnings, "workload traffic must share the management fabric because no dedicated pair is available")
	}

	if len(storage) == 0 && len(remaining) >= 2 {
		storage, remaining = takePair(remaining, pickPair(remaining, true))
	}
	if len(storage) == 2 {
		plan.Roles = append(plan.Roles,
			singleRole("storage_a", storage[0], 1500),
			singleRole("storage_b", storage[1], 1500),
		)
		if !allLinkUp(storage) {
			plan.ProductionReady = false
			plan.Warnings = append(plan.Warnings, "dedicated storage recommendation includes a link-down interface")
		}
	} else {
		plan.Roles = append(plan.Roles,
			sharedRole("storage_a", "workload", 1500),
			sharedRole("storage_b", "workload", 1500),
		)
		plan.Warnings = append(plan.Warnings, "storage fabrics are shared because two dedicated storage NICs are not available")
	}
	migrationPair := pickPair(remaining, true)
	if len(migrationPair) == 2 {
		var migration []candidate
		migration, remaining = takePair(remaining, migrationPair)
		plan.Roles = append(plan.Roles, pairRole("migration", migration, workloadMode, false, 1500))
	} else {
		plan.Roles = append(plan.Roles, sharedRole("migration", "workload", 1500))
	}

	backupPair := pickPair(remaining, true)
	if len(backupPair) == 2 {
		var backup []candidate
		backup, remaining = takePair(remaining, backupPair)
		plan.Roles = append(plan.Roles, pairRole("backup", backup, workloadMode, false, 1500))
	} else {
		plan.Roles = append(plan.Roles, sharedRole("backup", "workload", 1500))
	}
	if len(candidates) < 4 {
		plan.ProductionReady = false
		plan.Warnings = append(plan.Warnings, "fewer than four fabric NICs limits separation of management and workload traffic")
	}
	return plan
}

func nonRDMA(in []candidate) []candidate {
	out := make([]candidate, 0, len(in))
	for _, nic := range in {
		if !nic.RDMA {
			out = append(out, nic)
		}
	}
	return out
}

func onlyRDMA(in []candidate) []candidate {
	out := make([]candidate, 0, len(in))
	for _, nic := range in {
		if nic.RDMA {
			out = append(out, nic)
		}
	}
	return out
}
func pickPair(in []candidate, fastest bool) []candidate {
	if len(in) < 2 {
		return nil
	}
	groups := map[int][]candidate{}
	for _, nic := range in {
		if nic.LinkUp && nic.SpeedMbps > 0 {
			groups[nic.SpeedMbps] = append(groups[nic.SpeedMbps], nic)
		}
	}
	speeds := make([]int, 0, len(groups))
	for speed, group := range groups {
		if len(group) >= 2 {
			speeds = append(speeds, speed)
		}
	}
	if len(speeds) > 0 {
		sort.Ints(speeds)
		speed := speeds[0]
		if fastest {
			speed = speeds[len(speeds)-1]
		}
		group := append([]candidate(nil), groups[speed]...)
		sort.Slice(group, func(i, j int) bool { return group[i].Name < group[j].Name })
		return group[:2]
	}

	fallback := append([]candidate(nil), in...)
	sort.Slice(fallback, func(i, j int) bool {
		if fallback[i].LinkUp != fallback[j].LinkUp {
			return fallback[i].LinkUp
		}
		si, sj := fallback[i].SpeedMbps, fallback[j].SpeedMbps
		if si != sj {
			if fastest {
				return si > sj
			}
			if si == 0 {
				return false
			}
			if sj == 0 {
				return true
			}
			return si < sj
		}
		return fallback[i].Name < fallback[j].Name
	})
	return fallback[:2]
}
func takePair(all, selected []candidate) ([]candidate, []candidate) {
	if len(selected) != 2 {
		return nil, all
	}
	chosen := map[string]bool{selected[0].Name: true, selected[1].Name: true}
	remaining := make([]candidate, 0, len(all)-2)
	for _, nic := range all {
		if !chosen[nic.Name] {
			remaining = append(remaining, nic)
		}
	}
	return selected, remaining
}

func pairRole(name string, pair []candidate, mode string, trunk bool, mtu int) Role {
	role := Role{Name: name, BondMode: mode, Dedicated: true, MTU: mtu, VLANTrunk: trunk}
	for _, nic := range pair {
		role.Interfaces = append(role.Interfaces, nic.Name)
		if role.SpeedMbps == 0 || (nic.SpeedMbps > 0 && nic.SpeedMbps < role.SpeedMbps) {
			role.SpeedMbps = nic.SpeedMbps
		}
		role.RDMA = role.RDMA || nic.RDMA
	}
	return role
}

func singleRole(name string, nic candidate, mtu int) Role {
	return Role{
		Name: name, Interfaces: []string{nic.Name}, Dedicated: true,
		SpeedMbps: nic.SpeedMbps, RDMA: nic.RDMA, MTU: mtu,
	}
}

func sharedRole(name, with string, mtu int) Role {
	return Role{Name: name, SharedWith: with, Dedicated: false, MTU: mtu}
}

func allLinkUp(in []candidate) bool {
	if len(in) == 0 {
		return false
	}
	for _, nic := range in {
		if !nic.LinkUp {
			return false
		}
	}
	return true
}
