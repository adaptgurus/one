package update

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
)

type Runner interface {
	Run(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)
}
type ExecRunner struct{}

func (ExecRunner) Run(ctx context.Context, name string, args ...string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	err := cmd.Run()
	return out.String(), stderr.String(), err
}

type Result struct {
	Schema               string    `json:"schema"`
	StartedAt            time.Time `json:"started_at"`
	FinishedAt           time.Time `json:"finished_at"`
	Status               string    `json:"status"`
	RepoIDs              []string  `json:"repo_ids"`
	Packages             []string  `json:"packages"`
	TransactionLog       string    `json:"transaction_log,omitempty"`
	RebootAdvised        bool      `json:"reboot_advised"`
	RebootCheckAvailable bool      `json:"reboot_check_available"`
}

func Apply(ctx context.Context, policy config.UpdatePolicy, runner Runner) (Result, error) {
	started := time.Now().UTC()
	if err := policy.Validate(); err != nil {
		return Result{}, err
	}
	packages := append([]string(nil), policy.PackageAllowlist...)
	sort.Strings(packages)
	agentPkg := policy.AgentPackage
	if agentPkg == "" {
		agentPkg = "layersentry-host-agent"
	}
	disruptive := false
	for _, pkg := range packages {
		if pkg == agentPkg {
			return Result{}, errors.New("agent package must use signed A/B self-update, not generic DNF maintenance")
		}
		if !policy.AllowKernelUpdates && (pkg == "kernel" || strings.HasPrefix(pkg, "kernel-")) {
			return Result{}, fmt.Errorf("kernel package %q is blocked by update policy", pkg)
		}
		if pkg == "opennebula-node-kvm" || pkg == "qemu-kvm" || pkg == "libvirt" || pkg == "libvirt-daemon-kvm" || pkg == "kernel" || strings.HasPrefix(pkg, "kernel-") {
			disruptive = true
		}
	}
	if disruptive {
		preCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		out, stderr, err := runner.Run(preCtx, "virsh", "list", "--state-running", "--name")
		if err != nil {
			return Result{}, fmt.Errorf("cannot prove host is drained before disruptive maintenance: %s", strings.TrimSpace(stderr))
		}
		if strings.TrimSpace(out) != "" {
			return Result{}, errors.New("disruptive maintenance is blocked while VMs are running; drain/disable the host first")
		}
	}
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	if _, stderr, err := runner.Run(checkCtx, "dnf", "-q", "check"); err != nil {
		return Result{}, fmt.Errorf("dnf check failed: %s", strings.TrimSpace(stderr))
	}
	args := []string{"-y", "--refresh", "--setopt=strict=1", "--disablerepo=*"}
	for _, id := range policy.NormalizedRepoIDs() {
		args = append(args, "--enablerepo="+id)
	}
	args = append(args, "upgrade")
	args = append(args, packages...)
	updateCtx, cancelUpdate := context.WithTimeout(ctx, 90*time.Minute)
	defer cancelUpdate()
	stdout, stderr, err := runner.Run(updateCtx, "dnf", args...)
	status := "SUCCEEDED"
	if err != nil {
		status = "FAILED"
	}
	log := redact(strings.TrimSpace(stdout + "\n" + stderr))
	if len(log) > 16*1024 {
		log = log[len(log)-16*1024:]
	}
	result := Result{Schema: "layersentry-agent-update-result/v2", StartedAt: started, FinishedAt: time.Now().UTC(), Status: status, RepoIDs: policy.NormalizedRepoIDs(), Packages: packages, TransactionLog: log}
	if out, stderr, rebootErr := runner.Run(context.Background(), "needs-restarting", "-r"); rebootErr == nil {
		result.RebootCheckAvailable = true
		result.RebootAdvised = false
		_ = out
		_ = stderr
	} else if !strings.Contains(strings.ToLower(stderr), "not found") {
		result.RebootCheckAvailable = true
		result.RebootAdvised = true
	}
	if err != nil {
		return result, fmt.Errorf("dnf update transaction failed")
	}
	return result, nil
}

func redact(s string) string {
	var v map[string]any
	if json.Unmarshal([]byte(s), &v) == nil {
		for _, k := range []string{"password", "token", "secret"} {
			if _, ok := v[k]; ok {
				v[k] = "[REDACTED]"
			}
		}
		if b, err := json.Marshal(v); err == nil {
			return string(b)
		}
	}
	return s
}
