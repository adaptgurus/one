package opstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
)

const Root = "/var/lib/layersentry/agent-root/receipts"

type Record struct {
	Schema        string           `json:"schema"`
	OperationID   string           `json:"operation_id"`
	Action        string           `json:"action"`
	PayloadSHA256 string           `json:"payload_sha256"`
	Status        string           `json:"status"`
	Receipt       protocol.Receipt `json:"receipt"`
	UpdatedAt     time.Time        `json:"updated_at"`
}

type Guard struct {
	job      protocol.Job
	path     string
	lockFile *os.File
	Existing *protocol.Receipt
}

// Begin serializes root mutations and prevents replay after an uncertain crash.
// An existing RUNNING record is surfaced as UNKNOWN instead of being executed again.
func Begin(job protocol.Job) (*Guard, error) {
	if os.Geteuid() != 0 {
		return nil, errors.New("operation store requires root")
	}
	if err := os.MkdirAll(Root, 0o700); err != nil {
		return nil, err
	}
	if err := os.Chmod(filepath.Dir(Root), 0o700); err != nil {
		return nil, err
	}
	if err := os.Chmod(Root, 0o700); err != nil {
		return nil, err
	}
	lock, err := os.OpenFile(filepath.Join(Root, ".lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := lockExclusive(lock); err != nil {
		lock.Close()
		return nil, err
	}
	g := &Guard{job: job, path: filepath.Join(Root, job.OperationID+".json"), lockFile: lock}
	if data, err := os.ReadFile(g.path); err == nil {
		var record Record
		if err := json.Unmarshal(data, &record); err != nil {
			g.Close()
			return nil, fmt.Errorf("corrupt privileged operation receipt: %w", err)
		}
		if record.OperationID != job.OperationID || record.Action != job.Action || record.PayloadSHA256 != job.PayloadSHA256 {
			g.Close()
			return nil, errors.New("operation ID was already used for different signed intent")
		}
		receipt := record.Receipt
		if record.Status == "RUNNING" || record.Status == "UNKNOWN" {
			receipt.Status = "UNKNOWN"
			receipt.Detail = "previous privileged execution did not reach a durable terminal receipt; reconcile before retry"
		}
		g.Existing = &receipt
		return g, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		g.Close()
		return nil, err
	}
	started := protocol.Receipt{
		Schema:      "layersentry-agent-receipt/v1",
		OperationID: job.OperationID,
		Host:        job.Host,
		Action:      job.Action,
		Status:      "UNKNOWN",
		StartedAt:   time.Now().UTC(),
		Detail:      "privileged operation started; terminal result not yet durable",
	}
	record := Record{Schema: "layersentry-root-operation/v1", OperationID: job.OperationID, Action: job.Action, PayloadSHA256: job.PayloadSHA256, Status: "RUNNING", Receipt: started, UpdatedAt: time.Now().UTC()}
	if err := atomicWrite(g.path, record); err != nil {
		g.Close()
		return nil, err
	}
	return g, nil
}

func (g *Guard) Finish(receipt protocol.Receipt) error {
	if g == nil || g.lockFile == nil {
		return errors.New("operation guard is closed")
	}
	if receipt.OperationID != g.job.OperationID || receipt.Action != g.job.Action || receipt.Host != g.job.Host {
		return errors.New("terminal receipt identity mismatch")
	}
	if receipt.Status != "SUCCEEDED" && receipt.Status != "FAILED" && receipt.Status != "UNKNOWN" {
		return errors.New("invalid terminal receipt status")
	}
	record := Record{Schema: "layersentry-root-operation/v1", OperationID: g.job.OperationID, Action: g.job.Action, PayloadSHA256: g.job.PayloadSHA256, Status: receipt.Status, Receipt: receipt, UpdatedAt: time.Now().UTC()}
	return atomicWrite(g.path, record)
}

func (g *Guard) Close() {
	if g == nil || g.lockFile == nil {
		return
	}
	_ = unlock(g.lockFile)
	_ = g.lockFile.Close()
	g.lockFile = nil
}

func atomicWrite(path string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	f, err := os.CreateTemp(dir, ".receipt-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(append(data, '\n')); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	d, err := os.Open(dir)
	if err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}
