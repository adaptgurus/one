package controller

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/inventory"
	"github.com/layersentry/layersentry-platform/deploy/host-agent/internal/protocol"
)

const maxBody = 4 << 20

const bootstrapAuditRetention = 24 * time.Hour
const jobAuditRetention = 30 * 24 * time.Hour

type Bootstrap struct {
	TokenSHA256           string    `json:"token_sha256"`
	Site                  string    `json:"site"`
	Host                  string    `json:"host"`
	ExpectedManagementIP  string    `json:"expected_management_ip,omitempty"`
	ExpiresAt             time.Time `json:"expires_at"`
	ConsumedAt            time.Time `json:"consumed_at,omitempty"`
	EnrollmentKeySHA256   string    `json:"enrollment_key_sha256,omitempty"`
	EnrollmentMachineID   string    `json:"enrollment_machine_id,omitempty"`
	EnrollmentCertificate string    `json:"enrollment_certificate,omitempty"`
}

type Host struct {
	Site                   string             `json:"site"`
	Host                   string             `json:"host"`
	MachineID              string             `json:"machine_id,omitempty"`
	CertificateSerial      string             `json:"certificate_serial,omitempty"`
	CertificateExpiry      time.Time          `json:"certificate_expiry,omitempty"`
	EnrolledAt             time.Time          `json:"enrolled_at,omitempty"`
	BootstrapConsumedAt    time.Time          `json:"bootstrap_consumed_at,omitempty"`
	EnrollmentManagementIP string             `json:"enrollment_management_ip,omitempty"`
	LastSeen               time.Time          `json:"last_seen,omitempty"`
	LastPollAt             time.Time          `json:"last_poll_at,omitempty"`
	AgentRestartObservedAt time.Time          `json:"agent_restart_observed_at,omitempty"`
	RebootObservedAt       time.Time          `json:"reboot_observed_at,omitempty"`
	Inventory              inventory.Snapshot `json:"inventory"`
	Disabled               bool               `json:"disabled,omitempty"`
}

type JobRecord struct {
	Job       protocol.Job      `json:"job"`
	State     string            `json:"state"`
	UpdatedAt time.Time         `json:"updated_at"`
	Receipt   *protocol.Receipt `json:"receipt,omitempty"`
}

type diskState struct {
	Bootstraps map[string]Bootstrap `json:"bootstraps"`
	Hosts      map[string]Host      `json:"hosts"`
	Jobs       map[string]JobRecord `json:"jobs"`
}

type Store struct {
	mu    sync.Mutex
	path  string
	state diskState
}

func OpenStore(path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("empty controller state path")
	}
	s := &Store{path: path, state: diskState{Bootstraps: map[string]Bootstrap{}, Hosts: map[string]Host{}, Jobs: map[string]JobRecord{}}}
	body, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(body, &s.state); err != nil {
			return nil, fmt.Errorf("decode controller state: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if s.state.Bootstraps == nil {
		s.state.Bootstraps = map[string]Bootstrap{}
	}
	if s.state.Hosts == nil {
		s.state.Hosts = map[string]Host{}
	}
	if s.state.Jobs == nil {
		s.state.Jobs = map[string]JobRecord{}
	}
	return s, nil
}

func hostKey(site, host string) string { return site + "/" + host }

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

var errEnrollmentBootstrapRejected = errors.New("enrollment bootstrap rejected")

func (s *Store) pruneLocked(now time.Time) bool {
	changed := false
	bootstrapCutoff := now.UTC().Add(-bootstrapAuditRetention)
	for key, value := range s.state.Bootstraps {
		removeConsumed := !value.ConsumedAt.IsZero() && value.ConsumedAt.Before(bootstrapCutoff)
		removeExpired := value.ConsumedAt.IsZero() && value.ExpiresAt.Before(bootstrapCutoff)
		if removeConsumed || removeExpired {
			delete(s.state.Bootstraps, key)
			changed = true
		}
	}
	jobCutoff := now.UTC().Add(-jobAuditRetention)
	for key, value := range s.state.Jobs {
		if value.UpdatedAt.Before(jobCutoff) && value.Job.ExpiresAt.Before(jobCutoff) {
			delete(s.state.Jobs, key)
			changed = true
		}
	}
	return changed
}

func (s *Store) Prune(now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.pruneLocked(now) {
		return nil
	}
	return s.persistLocked()
}

func (s *Store) persistLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".controller-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(append(body, '\n')); err != nil {
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
	return os.Rename(tmp, s.path)
}

func (s *Store) AddBootstrap(site, host, token string, expires time.Time) error {
	return s.AddBootstrapForIP(site, host, token, "", expires)
}

func (s *Store) AddBootstrapForIP(site, host, token, expectedIP string, expires time.Time) error {
	now := time.Now().UTC()
	if site == "" || host == "" || len(token) < 32 || !expires.After(now) {
		return errors.New("invalid bootstrap")
	}
	if expectedIP != "" && net.ParseIP(expectedIP) == nil {
		return errors.New("invalid expected management IP")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(now)
	hash := tokenHash(token)
	s.state.Bootstraps[hash] = Bootstrap{TokenSHA256: hash, Site: site, Host: host, ExpectedManagementIP: expectedIP, ExpiresAt: expires.UTC()}
	return s.persistLocked()
}

func (s *Store) ConsumeBootstrap(token, site, host string, now time.Time) error {
	return s.ConsumeBootstrapForIP(token, site, host, "", now)
}

func (s *Store) ConsumeBootstrapForIP(token, site, host, observedIP string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	hash := tokenHash(token)
	bootstrap, ok := s.state.Bootstraps[hash]
	if !ok || bootstrap.Site != site || bootstrap.Host != host {
		return errors.New("bootstrap token rejected")
	}
	if bootstrap.ExpectedManagementIP != "" && bootstrap.ExpectedManagementIP != observedIP {
		return errors.New("bootstrap management IP mismatch")
	}
	if !bootstrap.ConsumedAt.IsZero() || !now.Before(bootstrap.ExpiresAt) {
		return errors.New("bootstrap token expired or already consumed")
	}
	bootstrap.ConsumedAt = now.UTC()
	s.state.Bootstraps[hash] = bootstrap
	return s.persistLocked()
}

func (s *Store) CommitEnrollment(token, site, host, observedIP, machineID, keySHA256, certPEM string, record Host, now time.Time) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	hash := tokenHash(token)
	bootstrap, ok := s.state.Bootstraps[hash]
	if !ok || bootstrap.Site != site || bootstrap.Host != host {
		return "", errEnrollmentBootstrapRejected
	}
	if bootstrap.ExpectedManagementIP != "" && bootstrap.ExpectedManagementIP != observedIP {
		return "", fmt.Errorf("%w: management IP mismatch", errEnrollmentBootstrapRejected)
	}
	if !bootstrap.ConsumedAt.IsZero() {
		if bootstrap.EnrollmentKeySHA256 == keySHA256 &&
			bootstrap.EnrollmentMachineID == machineID &&
			bootstrap.EnrollmentCertificate != "" {
			return bootstrap.EnrollmentCertificate, nil
		}
		return "", fmt.Errorf("%w: token already consumed by different enrollment identity", errEnrollmentBootstrapRejected)
	}
	if !now.Before(bootstrap.ExpiresAt) {
		return "", fmt.Errorf("%w: token expired", errEnrollmentBootstrapRejected)
	}
	if machineID == "" || keySHA256 == "" || certPEM == "" {
		return "", errors.New("incomplete enrollment commit")
	}
	bootstrap.ConsumedAt = now.UTC()
	bootstrap.EnrollmentKeySHA256 = keySHA256
	bootstrap.EnrollmentMachineID = machineID
	bootstrap.EnrollmentCertificate = certPEM
	record.BootstrapConsumedAt = now.UTC()
	s.state.Bootstraps[hash] = bootstrap
	s.state.Hosts[hostKey(site, host)] = record
	if err := s.persistLocked(); err != nil {
		return "", err
	}
	return certPEM, nil
}

func (s *Store) UpsertHost(host Host) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Hosts[hostKey(host.Site, host.Host)] = host
	return s.persistLocked()
}

func (s *Store) HostAllowed(site, host string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	h, ok := s.state.Hosts[hostKey(site, host)]
	return ok && !h.Disabled
}

func (s *Store) SetHostDisabled(site, host string, disabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := hostKey(site, host)
	h, ok := s.state.Hosts[key]
	if !ok {
		return errors.New("host not found")
	}
	h.Disabled = disabled
	s.state.Hosts[key] = h
	return s.persistLocked()
}

func (s *Store) UpdatePoll(site, host string, inv inventory.Snapshot, receipts []protocol.Receipt, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := hostKey(site, host)
	h, ok := s.state.Hosts[key]
	if !ok || h.Disabled {
		return errors.New("host disabled or unknown")
	}
	oldBoot, newBoot := strings.TrimSpace(h.Inventory.BootID), strings.TrimSpace(inv.BootID)
	oldInvocation, newInvocation := strings.TrimSpace(h.Inventory.AgentSystemd["InvocationID"]), strings.TrimSpace(inv.AgentSystemd["InvocationID"])
	sealedBeforeAndAfter := h.Inventory.Sealed && inv.Sealed && h.Inventory.SealIntegrityOK && inv.SealIntegrityOK
	if sealedBeforeAndAfter && oldBoot != "" && oldBoot == newBoot && oldInvocation != "" && newInvocation != "" && oldInvocation != newInvocation {
		h.AgentRestartObservedAt = now.UTC()
	}
	if sealedBeforeAndAfter && oldBoot != "" && newBoot != "" && oldBoot != newBoot {
		h.RebootObservedAt = now.UTC()
	}
	h.MachineID, h.LastSeen, h.LastPollAt, h.Inventory = inv.MachineID, now.UTC(), now.UTC(), inv
	s.state.Hosts[key] = h
	for i := range receipts {
		receipt := receipts[i]
		record, ok := s.state.Jobs[receipt.OperationID]
		if !ok || record.Job.Site != site || record.Job.Host != host || record.Job.Action != receipt.Action {
			continue
		}
		copyReceipt := receipt
		record.Receipt = &copyReceipt
		record.State = normalizeReceiptState(receipt.Status)
		record.UpdatedAt = now.UTC()
		s.state.Jobs[receipt.OperationID] = record
	}
	s.pruneLocked(now)
	return s.persistLocked()
}

func normalizeReceiptState(value string) string {
	switch value {
	case "RUNNING", "VERIFYING", "SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED":
		return value
	default:
		return "UNKNOWN"
	}
}

func (s *Store) Queue(job protocol.Job, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(now)
	if _, exists := s.state.Jobs[job.OperationID]; exists {
		return errors.New("operation ID already exists")
	}
	s.state.Jobs[job.OperationID] = JobRecord{Job: job, State: "QUEUED", UpdatedAt: now.UTC()}
	return s.persistLocked()
}

func (s *Store) Deliver(site, host string, now time.Time) ([]protocol.Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var jobs []protocol.Job
	changed := s.pruneLocked(now)
	for id, record := range s.state.Jobs {
		if record.Job.Site != site || record.Job.Host != host {
			continue
		}
		if record.State != "QUEUED" && record.State != "DELIVERED" {
			continue
		}
		if !now.Before(record.Job.ExpiresAt) {
			if record.State == "QUEUED" {
				record.State = "CANCELLED"
			} else {
				record.State = "UNKNOWN"
			}
			record.UpdatedAt = now.UTC()
			s.state.Jobs[id] = record
			changed = true
			continue
		}
		jobs = append(jobs, record.Job)
		if record.State == "QUEUED" {
			record.State = "DELIVERED"
			record.UpdatedAt = now.UTC()
			s.state.Jobs[id] = record
			changed = true
		}
	}
	if changed {
		return jobs, s.persistLocked()
	}
	return jobs, nil
}

func (s *Store) Snapshot() diskState {
	s.mu.Lock()
	defer s.mu.Unlock()
	body, _ := json.Marshal(s.state)
	var out diskState
	_ = json.Unmarshal(body, &out)
	return out
}

type Config struct {
	Store      *Store
	CA         *x509.Certificate
	CAKey      ed25519.PrivateKey
	SigningKey ed25519.PrivateKey
	AdminToken string
	CertTTL    time.Duration
}

type Server struct{ cfg Config }

func New(cfg Config) (*Server, error) {
	if cfg.Store == nil || cfg.CA == nil || len(cfg.CAKey) != ed25519.PrivateKeySize || len(cfg.SigningKey) != ed25519.PrivateKeySize {
		return nil, errors.New("controller key/store configuration incomplete")
	}
	if cfg.CertTTL == 0 {
		cfg.CertTTL = 30 * 24 * time.Hour
	}
	if cfg.CertTTL < time.Hour || cfg.CertTTL > 90*24*time.Hour {
		return nil, errors.New("certificate TTL outside allowed range")
	}
	return &Server{cfg: cfg}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/agent/enroll", s.enroll)
	mux.HandleFunc("POST /v1/agent/poll", s.poll)
	mux.HandleFunc("POST /v1/admin/bootstrap", s.adminBootstrap)
	mux.HandleFunc("POST /v1/admin/jobs", s.adminJob)
	mux.HandleFunc("POST /v1/admin/hosts/disable", s.adminDisableHost)
	mux.HandleFunc("POST /v1/admin/hosts/enable", s.adminEnableHost)
	mux.HandleFunc("GET /v1/admin/state", s.adminState)
	mux.HandleFunc("GET /v1/admin/enrollment-self-test", s.adminEnrollmentSelfTest)
	return mux
}

type enrollRequest struct {
	Schema    string             `json:"schema"`
	Site      string             `json:"site"`
	Host      string             `json:"host"`
	CSRPEM    string             `json:"csr_pem"`
	Inventory inventory.Snapshot `json:"inventory"`
}

func inventoryManagementIPv4(snapshot inventory.Snapshot) string {
	if len(snapshot.Network) == 0 {
		return ""
	}
	var rows []struct {
		IfName   string `json:"ifname"`
		AddrInfo []struct {
			Family string `json:"family"`
			Local  string `json:"local"`
			Scope  string `json:"scope"`
		} `json:"addr_info"`
	}
	if json.Unmarshal(snapshot.Network, &rows) != nil {
		return ""
	}
	for _, row := range rows {
		if row.IfName == "lo" {
			continue
		}
		for _, address := range row.AddrInfo {
			if address.Family == "inet" && address.Scope == "global" && net.ParseIP(address.Local) != nil {
				return address.Local
			}
		}
	}
	return ""
}

type pollRequest struct {
	Schema    string             `json:"schema"`
	Site      string             `json:"site"`
	Host      string             `json:"host"`
	Inventory inventory.Snapshot `json:"inventory"`
	Receipts  []protocol.Receipt `json:"receipts,omitempty"`
}

func decode(r *http.Request, out any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return errors.New("multiple JSON values rejected")
	}
	return nil
}

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func identityMatches(name pkix.Name, site, host string) bool {
	if name.CommonName != host {
		return false
	}
	hasProduct, hasSite := false, false
	for _, value := range name.Organization {
		if value == "LayerSentry" {
			hasProduct = true
		}
		if value == site {
			hasSite = true
		}
	}
	return hasProduct && hasSite
}

func (s *Server) enroll(w http.ResponseWriter, r *http.Request) {
	var req enrollRequest
	if err := decode(r, &req); err != nil || req.Schema != "layersentry-agent-enroll/v1" || req.Site == "" || req.Host == "" || req.Inventory.MachineID == "" {
		http.Error(w, "invalid enrollment request", http.StatusBadRequest)
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if token == "" || len(token) > 4096 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	csrBlock, _ := pem.Decode([]byte(req.CSRPEM))
	if csrBlock == nil || csrBlock.Type != "CERTIFICATE REQUEST" {
		http.Error(w, "invalid CSR", http.StatusBadRequest)
		return
	}
	csr, err := x509.ParseCertificateRequest(csrBlock.Bytes)
	if err != nil || csr.CheckSignature() != nil {
		http.Error(w, "invalid CSR", http.StatusBadRequest)
		return
	}
	if !identityMatches(csr.Subject, req.Site, req.Host) {
		http.Error(w, "CSR identity mismatch", http.StatusBadRequest)
		return
	}
	pub, ok := csr.PublicKey.(ed25519.PublicKey)
	if !ok || len(pub) != ed25519.PublicKeySize {
		http.Error(w, "CSR key type rejected", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	keyDigest := sha256.Sum256(pub)
	keySHA256 := hex.EncodeToString(keyDigest[:])
	serialBytes := make([]byte, 16)
	if _, err := rand.Read(serialBytes); err != nil {
		http.Error(w, "certificate issuance failed", http.StatusInternalServerError)
		return
	}
	serial := new(big.Int).SetBytes(serialBytes)
	tmpl := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: req.Host, Organization: []string{"LayerSentry", req.Site}}, NotBefore: now.Add(-2 * time.Minute), NotAfter: now.Add(s.cfg.CertTTL), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}, BasicConstraintsValid: true}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, s.cfg.CA, pub, s.cfg.CAKey)
	if err != nil {
		http.Error(w, "certificate issuance failed", http.StatusInternalServerError)
		return
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	managementIP := inventoryManagementIPv4(req.Inventory)
	record := Host{Site: req.Site, Host: req.Host, MachineID: req.Inventory.MachineID, CertificateSerial: serial.Text(16), CertificateExpiry: tmpl.NotAfter, EnrolledAt: now, EnrollmentManagementIP: managementIP, LastSeen: now, Inventory: req.Inventory}
	persistedCert, err := s.cfg.Store.CommitEnrollment(token, req.Site, req.Host, managementIP, req.Inventory.MachineID, keySHA256, string(certPEM), record, now)
	if err != nil {
		if errors.Is(err, errEnrollmentBootstrapRejected) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		} else {
			http.Error(w, "state persistence failed", http.StatusInternalServerError)
		}
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"schema": "layersentry-agent-enroll-result/v1", "cert_pem": persistedCert})
}

func (s *Server) poll(w http.ResponseWriter, r *http.Request) {
	var req pollRequest
	if err := decode(r, &req); err != nil || req.Schema != "layersentry-agent-poll/v1" {
		http.Error(w, "invalid poll request", http.StatusBadRequest)
		return
	}
	if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		http.Error(w, "client certificate required", http.StatusUnauthorized)
		return
	}
	if !identityMatches(r.TLS.PeerCertificates[0].Subject, req.Site, req.Host) {
		http.Error(w, "certificate identity mismatch", http.StatusForbidden)
		return
	}
	now := time.Now().UTC()
	if err := s.cfg.Store.UpdatePoll(req.Site, req.Host, req.Inventory, req.Receipts, now); err != nil {
		http.Error(w, "host disabled or state persistence failed", http.StatusForbidden)
		return
	}
	jobs, err := s.cfg.Store.Deliver(req.Site, req.Host, now)
	if err != nil {
		http.Error(w, "state persistence failed", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"schema": "layersentry-agent-poll-result/v1", "jobs": jobs})
}

type bootstrapRequest struct {
	Site         string `json:"site"`
	Host         string `json:"host"`
	ManagementIP string `json:"management_ip,omitempty"`
	TTLSeconds   int    `json:"ttl_seconds"`
}

func (s *Server) adminBootstrap(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req bootstrapRequest
	if decode(r, &req) != nil || req.Site == "" || req.Host == "" || (req.ManagementIP != "" && net.ParseIP(req.ManagementIP) == nil) {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.TTLSeconds == 0 {
		req.TTLSeconds = 900
	}
	if req.TTLSeconds < 60 || req.TTLSeconds > 3600 {
		http.Error(w, "invalid TTL", http.StatusBadRequest)
		return
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(w, "token generation failed", http.StatusInternalServerError)
		return
	}
	token := hex.EncodeToString(raw)
	expires := time.Now().UTC().Add(time.Duration(req.TTLSeconds) * time.Second)
	if err := s.cfg.Store.AddBootstrapForIP(req.Site, req.Host, token, req.ManagementIP, expires); err != nil {
		http.Error(w, "state persistence failed", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]any{"schema": "layersentry-agent-bootstrap/v1", "site": req.Site, "host": req.Host, "management_ip": req.ManagementIP, "token": token, "expires_at": expires})
}

type jobRequest struct {
	OperationID string          `json:"operation_id"`
	Site        string          `json:"site"`
	Host        string          `json:"host"`
	Action      string          `json:"action"`
	Payload     json.RawMessage `json:"payload"`
	TTLSeconds  int             `json:"ttl_seconds"`
}

func (s *Server) adminJob(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req jobRequest
	if decode(r, &req) != nil || req.OperationID == "" || req.Site == "" || req.Host == "" || !protocol.AllowedAction(req.Action) {
		http.Error(w, "invalid job", http.StatusBadRequest)
		return
	}
	if !s.cfg.Store.HostAllowed(req.Site, req.Host) {
		http.Error(w, "host disabled or unknown", http.StatusConflict)
		return
	}
	if req.TTLSeconds == 0 {
		req.TTLSeconds = 600
	}
	if req.TTLSeconds < 30 || req.TTLSeconds > 1800 {
		http.Error(w, "invalid TTL", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	job := protocol.Job{Schema: "layersentry-agent-job/v1", OperationID: req.OperationID, Site: req.Site, Host: req.Host, Action: req.Action, IssuedAt: now, ExpiresAt: now.Add(time.Duration(req.TTLSeconds) * time.Second), Payload: req.Payload}
	if err := job.Sign(s.cfg.SigningKey); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if err := s.cfg.Store.Queue(job, now); err != nil {
		http.Error(w, "operation already exists", http.StatusConflict)
		return
	}
	jsonResponse(w, http.StatusCreated, map[string]any{"schema": "layersentry-agent-job-result/v1", "operation_id": job.OperationID, "state": "QUEUED"})
}

type hostControlRequest struct {
	Site string `json:"site"`
	Host string `json:"host"`
}

func (s *Server) adminDisableHost(w http.ResponseWriter, r *http.Request) { s.adminSetHost(w, r, true) }
func (s *Server) adminEnableHost(w http.ResponseWriter, r *http.Request)  { s.adminSetHost(w, r, false) }
func (s *Server) adminSetHost(w http.ResponseWriter, r *http.Request, disabled bool) {
	if !s.adminAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req hostControlRequest
	if decode(r, &req) != nil || req.Site == "" || req.Host == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := s.cfg.Store.SetHostDisabled(req.Site, req.Host, disabled); err != nil {
		http.Error(w, "host not found", http.StatusNotFound)
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"site": req.Site, "host": req.Host, "disabled": disabled})
}

func (s *Server) adminState(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := s.cfg.Store.Prune(time.Now().UTC()); err != nil {
		http.Error(w, "state retention maintenance failed", http.StatusInternalServerError)
		return
	}
	state := s.cfg.Store.Snapshot()
	// Never return bootstrap hashes and never return job payloads from the admin
	// read model. Operation metadata/receipts are sufficient for status UI.
	jobs := map[string]any{}
	for id, record := range state.Jobs {
		jobs[id] = map[string]any{"operation_id": record.Job.OperationID, "site": record.Job.Site, "host": record.Job.Host, "action": record.Job.Action, "payload_sha256": record.Job.PayloadSHA256, "issued_at": record.Job.IssuedAt, "expires_at": record.Job.ExpiresAt, "state": record.State, "updated_at": record.UpdatedAt, "receipt": record.Receipt}
	}
	jsonResponse(w, http.StatusOK, map[string]any{"hosts": state.Hosts, "jobs": jobs})
}

func (s *Server) adminEnrollmentSelfTest(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	dir, err := os.MkdirTemp("", "layersentry-enrollment-selftest-")
	if err != nil {
		http.Error(w, "self-test setup failed", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(dir)
	store, err := OpenStore(filepath.Join(dir, "state.json"))
	if err != nil {
		http.Error(w, "self-test store failed", http.StatusInternalServerError)
		return
	}
	now := time.Now().UTC()
	token := strings.Repeat("ab", 32)
	if err := store.AddBootstrapForIP("selftest", "host01", token, "192.0.2.10", now.Add(5*time.Minute)); err != nil {
		http.Error(w, "self-test bootstrap failed", http.StatusInternalServerError)
		return
	}
	wrongSite := store.ConsumeBootstrapForIP(token, "wrong", "host01", "192.0.2.10", now) != nil
	wrongHost := store.ConsumeBootstrapForIP(token, "selftest", "wrong", "192.0.2.10", now) != nil
	wrongIP := store.ConsumeBootstrapForIP(token, "selftest", "host01", "192.0.2.11", now) != nil
	consumed := store.ConsumeBootstrapForIP(token, "selftest", "host01", "192.0.2.10", now) == nil
	replay := store.ConsumeBootstrapForIP(token, "selftest", "host01", "192.0.2.10", now.Add(time.Second)) != nil
	expiredToken := strings.Repeat("cd", 32)
	expiredReady := store.AddBootstrapForIP("selftest", "host02", expiredToken, "192.0.2.12", now.Add(time.Minute)) == nil
	expired := expiredReady && store.ConsumeBootstrapForIP(expiredToken, "selftest", "host02", "192.0.2.12", now.Add(2*time.Minute)) != nil
	jsonResponse(w, http.StatusOK, map[string]any{
		"schema":                       "layersentry-enrollment-security-self-test/v1",
		"wrong_site_rejected":          wrongSite,
		"wrong_host_rejected":          wrongHost,
		"wrong_management_ip_rejected": wrongIP,
		"correct_token_consumed":       consumed,
		"token_replay_rejected":        replay,
		"expired_token_rejected":       expired,
		"executed_at":                  now,
	})
}

func (s *Server) adminAuthorized(r *http.Request) bool {
	if len(s.cfg.AdminToken) < 32 {
		return false
	}
	got := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	return subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.AdminToken)) == 1
}
