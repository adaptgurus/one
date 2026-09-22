package hostops

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type fakeRunner struct {
	responses map[string]string
}

func (f fakeRunner) Run(_ context.Context, name string, args ...string) (string, error) {
	key := name
	if len(args) > 0 {
		key += " " + strings.Join(args, " ")
	}
	value, ok := f.responses[key]
	if !ok {
		return "", errors.New("unexpected command: " + key)
	}
	return value, nil
}

func TestContainsExactTokenRejectsSimilarWWID(t *testing.T) {
	wanted := "3600d0231000e2ee804a01313019a02e4"
	if containsExactToken("mpatha ("+wanted+"9) dm-2", wanted) {
		t.Fatal("substring WWID was accepted as an exact token")
	}
	if !containsExactToken("mpatha "+wanted+" dm-2", wanted) {
		t.Fatal("exact WWID token was not recognized")
	}
}

func TestISCSIValidationRejectsCHAPInOrdinaryJob(t *testing.T) {
	req := ISCSIRequest{
		TargetIQN: "iqn.2026-09.example:storage.target1",
		Portal:    "10.10.20.10:3260",
		Interface: "iscsi-a",
		AuthMode:  "chap",
	}
	if err := validateISCSI(req); err == nil {
		t.Fatal("ordinary iSCSI job accepted CHAP material path")
	}
}

func TestISCSIValidationRejectsMalformedIdentity(t *testing.T) {
	for _, req := range []ISCSIRequest{
		{TargetIQN: "target1", Portal: "10.10.20.10:3260"},
		{TargetIQN: "iqn.2026-09.example:storage.target1", Portal: "-bad:3260"},
		{TargetIQN: "iqn.2026-09.example:storage.target1", Portal: "10.10.20.10:70000"},
	} {
		if err := validateISCSI(req); err == nil {
			t.Fatalf("invalid iSCSI identity accepted: %+v", req)
		}
	}
}

func TestSafeTargetRejectsCommandLikeValues(t *testing.T) {
	for _, value := range []string{"-c", "10.0.0.1;id", "$(id)", "host name"} {
		if safeTarget(value) {
			t.Fatalf("unsafe verification target accepted: %q", value)
		}
	}
	for _, value := range []string{"10.0.0.1", "controller.internal", "2001:db8::10"} {
		if !safeTarget(value) {
			t.Fatalf("valid verification target rejected: %q", value)
		}
	}
}

func TestUnknownPayloadFieldRejectedBeforeExecution(t *testing.T) {
	payload := json.RawMessage(`{"interface":"ens2","shell":"rm -rf /"}`)
	_, err := Execute(context.Background(), "op-1", "network.preflight", payload, fakeRunner{responses: map[string]string{}})
	if err == nil {
		t.Fatal("unknown payload field was accepted")
	}
}

func TestMultipathVerifyUsesExactWWIDAndPathCount(t *testing.T) {
	wwid := "3600d0231000e2ee804a01313019a02e4"
	runner := fakeRunner{responses: map[string]string{
		"systemctl is-active multipathd":           "active",
		"multipath -ll " + wwid:                    "mpatha " + wwid + " dm-2 VENDOR,MODEL",
		"multipathd show paths format %w|%d|%t|%o": wwid + "|sda|ready|running\n" + wwid + "|sdb|ready|running",
	}}
	if _, err := multipathVerify(context.Background(), MultipathRequest{WWID: wwid, MinPaths: 2}, runner); err != nil {
		t.Fatalf("valid exact multipath evidence rejected: %v", err)
	}
}

func TestMultipathVerifyRejectsSimilarWWID(t *testing.T) {
	wwid := "3600d0231000e2ee804a01313019a02e4"
	runner := fakeRunner{responses: map[string]string{
		"systemctl is-active multipathd":           "active",
		"multipath -ll " + wwid:                    "mpatha (" + wwid + "9) dm-2 VENDOR,MODEL",
		"multipathd show paths format %w|%d|%t|%o": wwid + "9|sda|ready|running\n" + wwid + "9|sdb|ready|running",
	}}
	if _, err := multipathVerify(context.Background(), MultipathRequest{WWID: wwid, MinPaths: 2}, runner); err == nil {
		t.Fatal("similar but different WWID was accepted")
	}
}

func TestDiagnosticsCollectUsesOnlyFixedScopes(t *testing.T) {
	runner := fakeRunner{responses: map[string]string{
		"ip -s -j link show":         `[{"ifname":"eno1"}]`,
		"ip -j route show table all": `[{"dst":"default"}]`,
		"rdma -j link show":          `[]`,
	}}
	result, err := diagnosticsCollect(context.Background(), DiagnosticsRequest{Scopes: []string{"network"}}, runner)
	if err != nil {
		t.Fatalf("network diagnostics failed: %v", err)
	}
	body, ok := result.(map[string]any)
	if !ok || body["schema"] != "layersentry-host-diagnostics/v1" {
		t.Fatalf("unexpected diagnostics result: %#v", result)
	}
	if _, ok := body["network"]; !ok {
		t.Fatalf("network diagnostic evidence missing: %#v", body)
	}
}

func TestDiagnosticsRejectsUnknownScopeAndCommandInjection(t *testing.T) {
	if _, err := diagnosticsCollect(context.Background(), DiagnosticsRequest{Scopes: []string{"shell"}}, fakeRunner{responses: map[string]string{}}); err == nil {
		t.Fatal("unsupported diagnostic scope was accepted")
	}
	payload := json.RawMessage(`{"scopes":["network"],"command":"id"}`)
	if _, err := Execute(context.Background(), "op-diag", "diagnostics.collect", payload, fakeRunner{responses: map[string]string{}}); err == nil {
		t.Fatal("diagnostics accepted an arbitrary command field")
	}
}

func TestLVMSystemVerifyUsesExactWWIDAndExpectedVG(t *testing.T) {
	wwid := "3600d0231000e2ee804a01313019a02e4"
	stable := "/dev/disk/by-id/dm-uuid-mpath-" + wwid
	runner := fakeRunner{responses: map[string]string{
		"systemctl is-active multipathd":             "active",
		"multipath -ll " + wwid:                      "mpatha " + wwid + " dm-5 VENDOR,MODEL",
		"multipathd show paths format %w|%d|%t|%o":   wwid + "|sda|ready|running\n" + wwid + "|sdb|ready|running",
		"lvmdevices --check":                         "",
		"lvmdevices":                                 stable,
		"readlink -f " + stable:                      "/dev/dm-5",
		"pvs --reportformat json -o pv_name,vg_name": `{"report":[{"pv":[{"pv_name":"/dev/dm-5","vg_name":"vg-one-7"}]}]}`,
		"vgs --noheadings -o pv_count vg-one-7":      "1",
	}}
	result, err := lvmSystem(context.Background(), LVMSystemRequest{WWID: wwid, DatastoreID: 7}, false, runner)
	if err != nil {
		t.Fatalf("exact system VG verification failed: %v", err)
	}
	row := result.(map[string]any)
	if row["vg"] != "vg-one-7" || row["idempotent"] != true {
		t.Fatalf("unexpected result: %#v", row)
	}
}

func TestLVMSystemVerifyRejectsForeignVG(t *testing.T) {
	wwid := "3600d0231000e2ee804a01313019a02e4"
	stable := "/dev/disk/by-id/dm-uuid-mpath-" + wwid
	runner := fakeRunner{responses: map[string]string{
		"systemctl is-active multipathd":             "active",
		"multipath -ll " + wwid:                      "mpatha " + wwid + " dm-5 VENDOR,MODEL",
		"multipathd show paths format %w|%d|%t|%o":   wwid + "|sda|ready|running\n" + wwid + "|sdb|ready|running",
		"lvmdevices --check":                         "",
		"lvmdevices":                                 stable,
		"readlink -f " + stable:                      "/dev/dm-5",
		"pvs --reportformat json -o pv_name,vg_name": `{"report":[{"pv":[{"pv_name":"/dev/dm-5","vg_name":"foreign-vg"}]}]}`,
	}}
	if _, err := lvmSystem(context.Background(), LVMSystemRequest{WWID: wwid, DatastoreID: 7}, false, runner); err == nil {
		t.Fatal("foreign VG on exact WWID was accepted")
	}
}
