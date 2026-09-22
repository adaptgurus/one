package recommendation

import (
	"testing"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
)

func nic(name string, speed int, rdma bool) inventory.NIC {
	return inventory.NIC{
		Name: name, SpeedMbps: speed, RDMA: rdma,
		LinkUp: true, HardwareBacked: true, EligibleForFabric: true,
	}
}

func role(plan Plan, name string) Role {
	for _, r := range plan.Roles {
		if r.Name == name {
			return r
		}
	}
	return Role{}
}

func TestRecommendSixNICPhysicalHost(t *testing.T) {
	plan := Recommend([]inventory.NIC{
		nic("eno1", 1000, false), nic("eno2", 1000, false),
		nic("eno3", 25000, false), nic("eno4", 25000, false),
		nic("eno5", 100000, true), nic("eno6", 100000, true),
	}, Options{})
	if !plan.ProductionReady {
		t.Fatalf("expected production-ready recommendation: %#v", plan)
	}
	mgmt := role(plan, "management")
	if mgmt.BondMode != "active-backup" || len(mgmt.Interfaces) != 2 || mgmt.Interfaces[0] != "eno1" || mgmt.Interfaces[1] != "eno2" {
		t.Fatalf("unexpected management recommendation: %#v", mgmt)
	}
	workload := role(plan, "workload")
	if len(workload.Interfaces) != 2 || workload.Interfaces[0] != "eno3" || workload.Interfaces[1] != "eno4" || !workload.VLANTrunk {
		t.Fatalf("unexpected workload recommendation: %#v", workload)
	}
	sa, sb := role(plan, "storage_a"), role(plan, "storage_b")
	if len(sa.Interfaces) != 1 || len(sb.Interfaces) != 1 || !sa.RDMA || !sb.RDMA {
		t.Fatalf("RDMA storage NICs were not preserved: %#v %#v", sa, sb)
	}
	if sa.Interfaces[0] != "eno5" || sb.Interfaces[0] != "eno6" {
		t.Fatalf("unexpected storage selection: %#v %#v", sa, sb)
	}
}

func TestRecommendFourNICHostSharesStorageButSeparatesManagement(t *testing.T) {
	plan := Recommend([]inventory.NIC{
		nic("eth0", 1000, false), nic("eth1", 1000, false),
		nic("eth2", 25000, false), nic("eth3", 25000, false),
	}, Options{})
	if role(plan, "management").Interfaces[0] != "eth0" {
		t.Fatalf("low-speed pair should be management: %#v", plan)
	}
	if role(plan, "storage_a").SharedWith != "workload" || role(plan, "storage_b").SharedWith != "workload" {
		t.Fatalf("storage should be explicitly shared when no dedicated pair remains: %#v", plan)
	}
}
func TestRecommendTwoNICVirtualHostFailsClosedForProductionSeparation(t *testing.T) {
	plan := Recommend([]inventory.NIC{nic("ens160", 10000, false), nic("ens192", 10000, false)}, Options{})
	if plan.ProductionReady {
		t.Fatalf("two-NIC host must not be called production-ready: %#v", plan)
	}
	if role(plan, "workload").SharedWith != "management" {
		t.Fatalf("two-NIC workload must share management: %#v", plan)
	}
	if role(plan, "storage_a").SharedWith != "workload" {
		t.Fatalf("two-NIC storage must be marked shared: %#v", plan)
	}
}

func TestRecommendUsesLACPOnlyWhenExplicitlyEnabled(t *testing.T) {
	nics := []inventory.NIC{
		nic("p1", 1000, false), nic("p2", 1000, false),
		nic("p3", 25000, false), nic("p4", 25000, false),
	}
	without := Recommend(nics, Options{})
	with := Recommend(nics, Options{SwitchLACP: true})
	if role(without, "workload").BondMode != "active-backup" {
		t.Fatalf("LACP must not be inferred from host inventory")
	}
	if role(with, "workload").BondMode != "802.3ad" {
		t.Fatalf("explicit LACP capability should select 802.3ad")
	}
}

func TestFrontendProfileNeedsOnlyResilientManagementPair(t *testing.T) {
	plan := Recommend([]inventory.NIC{nic("eno1", 1000, false), nic("eno2", 1000, false)}, Options{Profile: "frontend"})
	if !plan.ProductionReady {
		t.Fatalf("frontend management pair should be production-ready: %#v", plan)
	}
	if plan.Profile != "frontend" || plan.Strategy != "automatic-frontend" {
		t.Fatalf("wrong profile: %#v", plan)
	}
	if len(plan.Roles) != 1 || plan.Roles[0].Name != "management" || plan.Roles[0].BondMode != "active-backup" {
		t.Fatalf("unexpected frontend roles: %#v", plan.Roles)
	}
}

func TestUnknownRecommendationProfileFailsClosed(t *testing.T) {
	plan := Recommend([]inventory.NIC{nic("eno1", 1000, false), nic("eno2", 1000, false)}, Options{Profile: "storage-controller"})
	if plan.ProductionReady || len(plan.Roles) != 0 {
		t.Fatalf("unknown profile was accepted: %#v", plan)
	}
}
