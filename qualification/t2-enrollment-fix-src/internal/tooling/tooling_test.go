package tooling

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
)

type fakeRunner struct {
	installed map[string]bool
	dnfArgs   []string
	failDNF   bool
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (string, string, error) {
	switch name {
	case "rpm":
		if len(args) != 2 || args[0] != "-q" {
			return "", "", errors.New("unexpected rpm invocation")
		}
		if f.installed[args[1]] {
			return args[1], "", nil
		}
		return "", "not installed", errors.New("not installed")
	case "dnf":
		f.dnfArgs = append([]string(nil), args...)
		if f.failDNF {
			return "", "password=should-not-leak", errors.New("dnf failed")
		}
		installAt := -1
		for i, arg := range args {
			if arg == "install" {
				installAt = i
				break
			}
		}
		if installAt < 0 {
			return "", "", errors.New("install subcommand missing")
		}
		for _, pkg := range args[installAt+1:] {
			f.installed[pkg] = true
		}
		return "installed", "", nil
	default:
		return "", "", errors.New("unexpected command: " + name)
	}
}

func policy() config.UpdatePolicy {
	return config.UpdatePolicy{
		Mode: "online", RepoIDs: []string{"appstream", "baseos"},
		PackageAllowlist: []string{"openssl"}, AgentPackage: "layersentry-host-agent",
	}
}

func TestEnsureInstallsOnlyFixedSupplementalPackages(t *testing.T) {
	runner := &fakeRunner{installed: map[string]bool{"tcpdump": true}}
	result, err := Ensure(context.Background(), policy(), runner)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Installed) != len(SupplementalPackages)-1 {
		t.Fatalf("unexpected installed set: %#v", result)
	}
	joined := strings.Join(runner.dnfArgs, " ")
	for _, want := range []string{"--disablerepo=*", "--enablerepo=appstream", "--enablerepo=baseos", "install"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("expected %q in dnf args: %q", want, joined)
		}
	}
	for _, pkg := range SupplementalPackages {
		if !runner.installed[pkg] {
			t.Fatalf("fixed supplemental package %q was not installed", pkg)
		}
	}
}

func TestEnsureFailureDoesNotReturnRepositorySecretText(t *testing.T) {
	runner := &fakeRunner{installed: map[string]bool{}, failDNF: true}
	_, err := Ensure(context.Background(), policy(), runner)
	if err == nil {
		t.Fatal("failed DNF transaction was reported as success")
	}
	if strings.Contains(strings.ToLower(err.Error()), "password") || strings.Contains(err.Error(), "should-not-leak") {
		t.Fatalf("DNF stderr leaked through tooling error: %v", err)
	}
}
