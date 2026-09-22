package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/appliance"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/client"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/config"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/hostops"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/opstore"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/recommendation"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/repository"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/selfupdate"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/supervision"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/tooling"
	updatepkg "github.com/layersentry/layersentry-platform/deploy/host-agent/internal/update"
)

var Version = "dev"

func main() {
	if len(os.Args) < 2 {
		fatal("usage: layersentry-host-agent <run|version|self-test|privileged|integrity-status|configure-repo|update|seal-host>")
	}
	var err error
	switch os.Args[1] {
	case "version":
		fmt.Println(Version)
		return
	case "self-test":
		err = selfTest()
		if err == nil {
			fmt.Println(Version)
		}
	case "run":
		err = runCommand(os.Args[2:])
	case "privileged":
		err = privilegedCommand(os.Args[2:])
	case "integrity-status":
		err = integrityStatusCommand(os.Args[2:])
	case "configure-repo":
		err = configureRepoCommand(os.Args[2:])
	case "update":
		err = updateCommand(os.Args[2:])
	case "seal-host":
		err = sealCommand(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fatal(err.Error())
	}
}

func selfTest() error {
	if Version == "" {
		return errors.New("empty version")
	}
	_, err := os.Executable()
	return err
}

func runCommand(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	configPath := fs.String("config", config.DefaultPath, "agent configuration")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	if err := client.EnrollIfNeeded(ctx, cfg); err != nil {
		return fmt.Errorf("enrollment: %w", err)
	}
	controller, err := client.New(cfg)
	if err != nil {
		return err
	}
	if err := selfupdate.MarkHealthy(Version); err != nil {
		return err
	}
	_ = supervision.Notify("READY=1\nSTATUS=LayerSentry host agent ready")

	interval := cfg.PollInterval.Duration
	if interval == 0 {
		interval = 30 * time.Second
	}
	watchdog := supervision.WatchdogInterval()
	var watchdogC <-chan time.Time
	if watchdog > 0 {
		ticker := time.NewTicker(watchdog)
		defer ticker.Stop()
		watchdogC = ticker.C
	}
	pollTicker := time.NewTicker(interval)
	defer pollTicker.Stop()
	pending := loadReceipts()

	poll := func() (bool, error) {
		jobs, err := controller.Poll(ctx, pending)
		if err != nil {
			return false, err
		}
		if len(pending) > 0 {
			pending = nil
			_ = saveReceipts(nil)
		}
		restart := false
		for _, job := range jobs {
			receipt := executeJob(ctx, *configPath, cfg, job)
			pending = append(pending, receipt)
			_ = saveReceipts(pending)
			if job.Action == "agent.self-update" && receipt.Status == "SUCCEEDED" {
				restart = true
			}
		}
		if restart {
			if _, err := controller.Poll(ctx, pending); err == nil {
				pending = nil
				_ = saveReceipts(nil)
				return true, nil
			}
		}
		return false, nil
	}

	if restart, _ := poll(); restart {
		return nil
	}
	for {
		select {
		case <-ctx.Done():
			_ = supervision.Notify("STOPPING=1")
			return nil
		case <-watchdogC:
			_ = supervision.Notify("WATCHDOG=1")
		case <-pollTicker.C:
			restart, err := poll()
			if err != nil {
				_ = supervision.Notify("STATUS=Controller unavailable; retaining local state")
				continue
			}
			if restart {
				return nil
			}
		}
	}
}

func executeJob(ctx context.Context, configPath string, cfg config.Config, job protocol.Job) protocol.Receipt {
	started := time.Now().UTC()
	receipt := protocol.Receipt{Schema: "layersentry-agent-receipt/v1", OperationID: job.OperationID, Host: cfg.Host, Action: job.Action, Status: "FAILED", StartedAt: started}
	switch job.Action {
	case "inventory.collect", "health.collect":
		receipt.Status = "SUCCEEDED"
		receipt.Evidence = inventory.Collect(ctx)
	case "network.recommend":
		var options recommendation.Options
		if len(job.Payload) > 0 && string(job.Payload) != "null" {
			decoder := json.NewDecoder(bytes.NewReader(job.Payload))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&options); err != nil {
				receipt.Detail = "invalid network recommendation request: " + bounded(err.Error())
				break
			}
		}
		snapshot := inventory.Collect(ctx)
		receipt.Status = "SUCCEEDED"
		receipt.Evidence = map[string]any{"inventory_schema": snapshot.Schema, "virtualization": snapshot.Virtualization, "recommendation": recommendation.Recommend(snapshot.NICs, options)}
	default:
		body, _ := json.Marshal(job)
		cmd := exec.CommandContext(ctx, "sudo", "-n", os.Args[0], "privileged", "--config", configPath)
		cmd.Stdin = bytes.NewReader(body)
		var stdout, stderr bytes.Buffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		if err := cmd.Run(); err != nil {
			receipt.Status = "UNKNOWN"
			receipt.Detail = "privileged outcome was not confirmed: " + bounded(stderr.String())
			break
		}
		var child protocol.Receipt
		if json.Unmarshal(stdout.Bytes(), &child) != nil || child.OperationID != job.OperationID {
			receipt.Status = "UNKNOWN"
			receipt.Detail = "invalid privileged receipt"
			break
		}
		receipt = child
	}
	receipt.FinishedAt = time.Now().UTC()
	return receipt
}

func privilegedCommand(args []string) error {
	if os.Geteuid() != 0 {
		return errors.New("privileged helper requires root")
	}
	fs := flag.NewFlagSet("privileged", flag.ContinueOnError)
	configPath := fs.String("config", config.DefaultPath, "config")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	key, err := selfupdate.LoadSigningKey(cfg.SigningKeyFile)
	if err != nil {
		return err
	}
	var job protocol.Job
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&job); err != nil {
		return err
	}
	if err := job.Verify(key, cfg.Site, cfg.Host, time.Now().UTC()); err != nil {
		return err
	}

	guard, err := opstore.Begin(job)
	if err != nil {
		return err
	}
	defer guard.Close()
	if guard.Existing != nil {
		return json.NewEncoder(os.Stdout).Encode(guard.Existing)
	}

	receipt := protocol.Receipt{Schema: "layersentry-agent-receipt/v1", OperationID: job.OperationID, Host: cfg.Host, Action: job.Action, Status: "FAILED", StartedAt: time.Now().UTC()}
	actionErr := executePrivilegedAction(cfg, key, job, &receipt)
	if actionErr != nil {
		receipt.Status = "FAILED"
		receipt.Detail = bounded(actionErr.Error())
	}
	receipt.FinishedAt = time.Now().UTC()
	if err := guard.Finish(receipt); err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(receipt)
}

func executePrivilegedAction(cfg config.Config, signingKey []byte, job protocol.Job, receipt *protocol.Receipt) error {
	switch job.Action {
	case "repo.configure":
		var request repository.Request
		if err := json.Unmarshal(job.Payload, &request); err != nil {
			return err
		}
		if err := repository.Configure(request); err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
	case "tools.ensure":
		if len(job.Payload) > 0 && string(job.Payload) != "null" && string(job.Payload) != "{}" {
			decoder := json.NewDecoder(bytes.NewReader(job.Payload))
			decoder.DisallowUnknownFields()
			var empty struct{}
			if err := decoder.Decode(&empty); err != nil {
				return err
			}
		}
		result, err := tooling.Ensure(context.Background(), cfg.Update, updatepkg.ExecRunner{})
		receipt.Evidence = result
		if err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
	case "updates.apply":
		result, err := updatepkg.Apply(context.Background(), cfg.Update, updatepkg.ExecRunner{})
		receipt.Evidence = result
		if err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
	case "host.seal":
		var request appliance.Request
		decoder := json.NewDecoder(bytes.NewReader(job.Payload))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			return err
		}
		result, err := appliance.Seal(context.Background(), request, hostops.ExecRunner{})
		receipt.Evidence = result
		if err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
	case "agent.self-update":
		var manifest selfupdate.Manifest
		if err := json.Unmarshal(job.Payload, &manifest); err != nil {
			return err
		}
		key := signingKey
		var credentials *[2]string
		if cfg.Update.Mode == "custom" {
			stored, err := repository.LoadCredentials(cfg.Update.CredentialsFile)
			if err != nil {
				return err
			}
			credentials = &[2]string{stored.Username, stored.Password}
		}
		if err := selfupdate.Stage(manifest, key, cfg.CAFile, credentials); err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
		receipt.Detail = "restart_required"
	case "diagnostics.collect", "nfs.verify", "block.verify", "nvme.verify", "ceph.verify", "network.topology.prepare", "network.topology.apply", "network.topology.verify", "network.topology.rollback",
		"network.preflight", "network.prepare", "network.apply", "network.verify", "network.rollback",
		"iscsi.inventory", "iscsi.configure", "iscsi.login", "iscsi.verify", "iscsi.logout",
		"multipath.inventory", "multipath.verify", "lvm.inventory", "lvmdevices.verify", "lvmdevices.configure", "lvm.system.initialize", "lvm.system.verify", "storage.verify":
		evidence, err := hostops.Execute(context.Background(), job.OperationID, job.Action, job.Payload, hostops.ExecRunner{})
		receipt.Evidence = evidence
		if err != nil {
			return err
		}
		receipt.Status = "SUCCEEDED"
	default:
		return errors.New("action cannot run in privileged helper")
	}
	return nil
}

func integrityStatusCommand(args []string) error {
	if os.Geteuid() != 0 {
		return errors.New("integrity-status requires root via the restricted sudo rule")
	}
	if len(args) != 0 {
		return errors.New("integrity-status accepts no arguments")
	}
	return json.NewEncoder(os.Stdout).Encode(appliance.VerifyIntegrity())
}

func configureRepoCommand(args []string) error {
	if os.Geteuid() != 0 {
		return errors.New("configure-repo requires root via the restricted sudo rule")
	}
	fs := flag.NewFlagSet("configure-repo", flag.ContinueOnError)
	lines := fs.Bool("lines", false, "read six newline-delimited fields")
	if err := fs.Parse(args); err != nil {
		return err
	}
	var request repository.Request
	if *lines {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 1024), 64*1024)
		values := make([]string, 0, 6)
		for scanner.Scan() {
			values = append(values, scanner.Text())
			if len(values) == 6 {
				break
			}
		}
		if err := scanner.Err(); err != nil {
			return err
		}
		if len(values) != 6 {
			return errors.New("expected repo id, base URL, GPG key, credentials path, username and password")
		}
		request = repository.Request{RepoID: values[0], BaseURL: values[1], GPGKey: values[2], CredentialsFile: values[3], Username: values[4], Password: values[5]}
	} else {
		decoder := json.NewDecoder(os.Stdin)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			return err
		}
	}
	return repository.Configure(request)
}

func updateCommand(args []string) error {
	if os.Geteuid() != 0 {
		return errors.New("update requires root")
	}
	fs := flag.NewFlagSet("update", flag.ContinueOnError)
	configPath := fs.String("config", config.DefaultPath, "config")
	scheduled := fs.Bool("scheduled", false, "scheduled invocation")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *scheduled {
		if _, err := os.Stat("/etc/layersentry/host-sealed.json"); err != nil {
			return errors.New("scheduled update refused until host sealing is complete")
		}
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	result, err := updatepkg.Apply(context.Background(), cfg.Update, updatepkg.ExecRunner{})
	_ = json.NewEncoder(os.Stdout).Encode(result)
	return err
}

func sealCommand(args []string) error {
	if os.Geteuid() != 0 {
		return errors.New("seal-host requires root")
	}
	fs := flag.NewFlagSet("seal-host", flag.ContinueOnError)
	role := fs.String("role", "", "platform or compute")
	managementCIDR := fs.String("management-cidr", "", "management IPv4 CIDR")
	managementInterface := fs.String("management-interface", "", "management logical interface")
	migrationCIDR := fs.String("migration-cidr", "", "migration IPv4 CIDR")
	migrationInterface := fs.String("migration-interface", "", "migration logical interface")
	storageInterfaces := fs.String("storage-interfaces", "", "comma-separated storage logical interfaces")
	controllerLocal := fs.Bool("controller-local", false, "host controller listens locally on TCP 9443")
	nfs := fs.Bool("nfs", false, "enable SELinux virt_use_nfs")
	if err := fs.Parse(args); err != nil {
		return err
	}
	var storage []string
	for _, value := range strings.Split(*storageInterfaces, ",") {
		if value = strings.TrimSpace(value); value != "" {
			storage = append(storage, value)
		}
	}
	result, err := appliance.Seal(context.Background(), appliance.Request{
		Role: *role, ManagementCIDR: *managementCIDR, ManagementInterface: *managementInterface,
		MigrationCIDR: *migrationCIDR, MigrationInterface: *migrationInterface,
		StorageInterfaces: storage, ControllerLocal: *controllerLocal, NFS: *nfs,
	}, hostops.ExecRunner{})
	if err == nil {
		_ = json.NewEncoder(os.Stdout).Encode(result)
	}
	return err
}

func receiptPath() string { return filepath.Join(config.StateDir, "pending-receipts.json") }

func loadReceipts() []protocol.Receipt {
	body, err := os.ReadFile(receiptPath())
	if err != nil {
		return nil
	}
	var receipts []protocol.Receipt
	_ = json.Unmarshal(body, &receipts)
	return receipts
}

func saveReceipts(receipts []protocol.Receipt) error {
	if err := os.MkdirAll(config.StateDir, 0o770); err != nil {
		return err
	}
	if len(receipts) == 0 {
		if err := os.Remove(receiptPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}
	body, _ := json.Marshal(receipts)
	return os.WriteFile(receiptPath(), body, 0o600)
}

func bounded(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 2048 {
		return value[len(value)-2048:]
	}
	return value
}

func fatal(message string) {
	fmt.Fprintln(os.Stderr, "ERROR:", message)
	os.Exit(1)
}
