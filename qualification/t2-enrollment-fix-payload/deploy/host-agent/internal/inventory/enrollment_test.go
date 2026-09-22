package inventory

import (
	"context"
	"testing"
	"time"
)

func TestCollectEnrollmentAvoidsFullInventoryProbes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	got := CollectEnrollment(ctx)
	if got.Schema != "layersentry-agent-inventory/v3" {
		t.Fatalf("schema=%q", got.Schema)
	}
	if got.ObservedAt.IsZero() {
		t.Fatal("observed_at is zero")
	}
	if got.Packages == nil || len(got.Packages) != 0 {
		t.Fatalf("enrollment inventory unexpectedly includes packages: %#v", got.Packages)
	}
	if got.Services == nil || len(got.Services) != 0 {
		t.Fatalf("enrollment inventory unexpectedly includes services: %#v", got.Services)
	}
	if len(got.Block) != 0 || got.PCI != "" || len(got.LVMPhysical) != 0 || len(got.LVMGroups) != 0 {
		t.Fatal("enrollment inventory included slow storage/PCI probes")
	}
}
