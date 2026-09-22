package topology

import (
	"encoding/json"
	"testing"
)

func productionRequest() Request {
	return Request{RequiredTargets: []string{"10.10.10.1"}, Fabrics: []Fabric{
		{Role: "management", Interfaces: []string{"eno1", "eno2"}, BondMode: "active-backup", Address: "10.10.10.31/24", Gateway: "10.10.10.1", DNS: []string{"10.10.10.5"}, VLAN: 10, MTU: 1500},
		{Role: "workload", Interfaces: []string{"eno3", "eno4"}, BondMode: "802.3ad", MTU: 9000},
		{Role: "storage_a", Interfaces: []string{"eno5"}, Address: "10.10.30.31/24", VLAN: 30, MTU: 9000},
		{Role: "storage_b", Interfaces: []string{"eno6"}, Address: "10.10.31.31/24", VLAN: 31, MTU: 9000},
		{Role: "migration", SharedWith: "workload", Address: "10.10.20.31/24", VLAN: 20, MTU: 9000},
	}}
}

func TestRenderProductionTopologyUsesNmstateBondsAndVlans(t *testing.T) {
	r, err := Render(productionRequest())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.PhysicalInterfaces) != 6 {
		t.Fatalf("physical interfaces=%v", r.PhysicalInterfaces)
	}
	if r.ResultInterfaces["management"] != "ls-mgmt.10" {
		t.Fatalf("management=%s", r.ResultInterfaces["management"])
	}
	if r.ResultInterfaces["migration"] != "ls-mig.20" {
		t.Fatalf("migration=%s", r.ResultInterfaces["migration"])
	}
	var state map[string]any
	if err := json.Unmarshal(r.Nmstate, &state); err != nil {
		t.Fatal(err)
	}
	if _, ok := state["routes"]; !ok {
		t.Fatal("management default route missing")
	}
}

func TestTopologyRejectsUnsafeSharingAndManagementLACP(t *testing.T) {
	req := productionRequest()
	req.Fabrics[0].BondMode = "802.3ad"
	if err := Validate(req); err == nil {
		t.Fatal("management LACP accepted")
	}
	req = productionRequest()
	req.Fabrics[2].SharedWith = "workload"
	req.Fabrics[2].Interfaces = nil
	if err := Validate(req); err == nil {
		t.Fatal("shared storage fabric accepted")
	}
}

func TestTopologyRejectsPhysicalNICReuse(t *testing.T) {
	req := productionRequest()
	req.Fabrics[2].Interfaces = []string{"eno3"}
	if err := Validate(req); err == nil {
		t.Fatal("physical NIC reuse accepted")
	}
}

func TestSharedMigrationRequiresVLAN(t *testing.T) {
	req := productionRequest()
	req.Fabrics[4].VLAN = 0
	if err := Validate(req); err == nil {
		t.Fatal("untagged shared migration accepted")
	}
}
