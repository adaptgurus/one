package tooling

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
)

var SupplementalPackages = []string{
	"tcpdump",
	"iperf3",
	"fio",
	"infiniband-diags",
	"nmap-ncat",
	"nmstate",
	"fapolicyd",
	"policycoreutils-python-utils",
	"setools-console",
	"audit",
}

type Runner interface {
	Run(context.Context, string, ...string) (string, string, error)
}

type Result struct {
	Schema    string   `json:"schema"`
	Installed []string `json:"installed,omitempty"`
	Present   []string `json:"present,omitempty"`
}

func Ensure(ctx context.Context, policy config.UpdatePolicy, runner Runner) (Result, error) {
	if err := policy.Validate(); err != nil {
		return Result{}, err
	}
	packages := append([]string(nil), SupplementalPackages...)
	sort.Strings(packages)
	result := Result{Schema: "layersentry-diagnostic-tooling/v1"}
	missing := make([]string, 0, len(packages))
	for _, pkg := range packages {
		checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		_, _, err := runner.Run(checkCtx, "rpm", "-q", pkg)
		cancel()
		if err == nil {
			result.Present = append(result.Present, pkg)
		} else {
			missing = append(missing, pkg)
		}
	}
	if len(missing) == 0 {
		return result, nil
	}
	args := []string{"-y", "--disablerepo=*"}
	for _, repoID := range policy.NormalizedRepoIDs() {
		args = append(args, "--enablerepo="+repoID)
	}
	args = append(args, "install")
	args = append(args, missing...)
	installCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	_, _, err := runner.Run(installCtx, "dnf", args...)
	cancel()
	if err != nil {
		return result, errors.New("diagnostic package installation failed")
	}
	for _, pkg := range missing {
		checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		_, _, verifyErr := runner.Run(checkCtx, "rpm", "-q", pkg)
		cancel()
		if verifyErr != nil {
			return result, errors.New("diagnostic package verification failed")
		}
		result.Installed = append(result.Installed, pkg)
	}
	return result, nil
}
