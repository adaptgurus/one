package update

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
)

type fakeRunner struct {
	running bool
	calls   [][]string
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (string, string, error) {
	f.calls = append(f.calls, append([]string{name}, args...))
	if name == "virsh" {
		if f.running {
			return "vm-1\n", "", nil
		}
		return "", "", nil
	}
	if name == "needs-restarting" {
		return "", "", nil
	}
	if name == "dnf" {
		return "ok", "", nil
	}
	return "", "", errors.New("unexpected")
}

func TestDisruptiveUpdateRequiresDrainedHost(t *testing.T) {
	p := config.UpdatePolicy{Mode: "online", RepoIDs: []string{"baseos"}, PackageAllowlist: []string{"qemu-kvm"}}
	f := &fakeRunner{running: true}
	if _, err := Apply(context.Background(), p, f); err == nil {
		t.Fatal("running VM did not block update")
	}
}
func TestDNFIsRepoAndPackageAllowlisted(t *testing.T) {
	p := config.UpdatePolicy{Mode: "online", RepoIDs: []string{"baseos", "appstream"}, PackageAllowlist: []string{"openssl", "systemd"}}
	f := &fakeRunner{}
	if _, err := Apply(context.Background(), p, f); err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, c := range f.calls {
		if len(c) > 0 && c[0] == "dnf" {
			joined += strings.Join(c, " ") + "\n"
		}
	}
	for _, needle := range []string{"--disablerepo=*", "--enablerepo=appstream", "--enablerepo=baseos", "upgrade openssl systemd"} {
		if !strings.Contains(joined, needle) {
			t.Fatalf("missing %q in %s", needle, joined)
		}
	}
}
