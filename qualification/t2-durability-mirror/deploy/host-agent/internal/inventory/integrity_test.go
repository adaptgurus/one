package inventory

import "testing"

func TestDecodeIntegrityVerification(t *testing.T) {
	good := decodeIntegrityVerification(`{"schema":"layersentry-sealed-appliance-verification/v1","valid":true}`)
	if !good.Valid || good.Schema != "layersentry-sealed-appliance-verification/v1" {
		t.Fatalf("valid privileged integrity result rejected: %#v", good)
	}
	for _, bad := range []string{"", "not-json", `{"schema":"wrong","valid":true}`} {
		value := decodeIntegrityVerification(bad)
		if value.Valid || len(value.Drift) == 0 {
			t.Fatalf("malformed privileged result accepted: %q %#v", bad, value)
		}
	}
}
