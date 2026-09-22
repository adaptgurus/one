package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	pathpkg "path"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	DefaultPath = "/etc/layersentry/host-agent.json"
	StateDir    = "/var/lib/layersentry/agent"
	PKIDir      = "/var/lib/layersentry/agent/pki"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$`)

// Config is intentionally small. Secrets are referenced by root-owned files and
// are never embedded in the cluster/site manifest or reported by inventory.
type Config struct {
	Schema         string       `json:"schema"`
	Site           string       `json:"site"`
	Host           string       `json:"host"`
	ControllerURL  string       `json:"controller_url"`
	CAFile         string       `json:"ca_file"`
	BootstrapFile  string       `json:"bootstrap_token_file,omitempty"`
	ClientCertFile string       `json:"client_cert_file,omitempty"`
	ClientKeyFile  string       `json:"client_key_file,omitempty"`
	SigningKeyFile string       `json:"controller_signing_key_file"`
	PollInterval   Duration     `json:"poll_interval"`
	Update         UpdatePolicy `json:"update"`
}

type Duration struct{ time.Duration }

func (d *Duration) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	v, err := time.ParseDuration(s)
	if err != nil {
		return err
	}
	d.Duration = v
	return nil
}

func (d Duration) MarshalJSON() ([]byte, error) { return json.Marshal(d.Duration.String()) }

type UpdatePolicy struct {
	Mode               string   `json:"mode"` // online or custom
	Schedule           string   `json:"schedule,omitempty"`
	RepoIDs            []string `json:"repo_ids"`
	PackageAllowlist   []string `json:"package_allowlist"`
	CustomRepoID       string   `json:"custom_repo_id,omitempty"`
	CustomBaseURL      string   `json:"custom_base_url,omitempty"`
	CredentialsFile    string   `json:"credentials_file,omitempty"`
	GPGKey             string   `json:"gpg_key,omitempty"`
	AgentPackage       string   `json:"agent_package,omitempty"`
	AllowKernelUpdates bool     `json:"allow_kernel_updates"`
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("decode agent config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Validate() error {
	if c.Schema != "layersentry-host-agent/v1" {
		return fmt.Errorf("unsupported schema %q", c.Schema)
	}
	if !safeID.MatchString(c.Site) || !safeID.MatchString(c.Host) {
		return errors.New("site and host must be safe identifiers")
	}
	u, err := url.Parse(c.ControllerURL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("controller_url must be a plain https URL without embedded credentials/query/fragment")
	}
	if c.PollInterval.Duration == 0 {
		c.PollInterval.Duration = 30 * time.Second
	}
	if c.PollInterval.Duration < 5*time.Second || c.PollInterval.Duration > 15*time.Minute {
		return errors.New("poll_interval must be between 5s and 15m")
	}
	for _, p := range []string{c.CAFile, c.SigningKeyFile} {
		if !safeAbsolutePath(p) {
			return fmt.Errorf("unsafe required path %q", p)
		}
	}
	for _, p := range []string{c.BootstrapFile, c.ClientCertFile, c.ClientKeyFile} {
		if p != "" && !safeAbsolutePath(p) {
			return fmt.Errorf("unsafe path %q", p)
		}
	}
	if err := c.Update.Validate(); err != nil {
		return err
	}
	return nil
}

func (u UpdatePolicy) Validate() error {
	if u.Mode != "online" && u.Mode != "custom" {
		return errors.New("update.mode must be online or custom")
	}
	if len(u.RepoIDs) == 0 {
		return errors.New("update.repo_ids must not be empty")
	}
	seen := map[string]bool{}
	for _, id := range u.RepoIDs {
		if !safeID.MatchString(id) || seen[id] {
			return fmt.Errorf("invalid or duplicate repo id %q", id)
		}
		seen[id] = true
	}
	if len(u.PackageAllowlist) == 0 {
		return errors.New("update.package_allowlist must not be empty")
	}
	for _, pkg := range u.PackageAllowlist {
		if !safePackage(pkg) {
			return fmt.Errorf("invalid package allowlist entry %q", pkg)
		}
	}
	if u.Mode == "custom" {
		if !safeID.MatchString(u.CustomRepoID) || u.CustomBaseURL == "" || u.CredentialsFile == "" {
			return errors.New("custom update mode requires custom_repo_id, custom_base_url and credentials_file")
		}
		v, err := url.Parse(u.CustomBaseURL)
		if err != nil || v.Scheme != "https" || v.Host == "" || v.User != nil {
			return errors.New("custom_base_url must be https and must not embed credentials")
		}
		if !safeAbsolutePath(u.CredentialsFile) {
			return errors.New("unsafe custom repository credentials path")
		}
	}
	return nil
}

func (u UpdatePolicy) NormalizedRepoIDs() []string {
	out := append([]string(nil), u.RepoIDs...)
	sort.Strings(out)
	return out
}

func safeAbsolutePath(value string) bool {
	// The host agent is a Linux-only component. Validate target paths with
	// POSIX semantics even when source tests run on Windows.
	if value == "" || !strings.HasPrefix(value, "/") || strings.Contains(value, "\x00") {
		return false
	}
	clean := pathpkg.Clean(value)
	return clean == value && clean != "/"
}

var packageRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9+_.:-]*$`)

func safePackage(value string) bool { return packageRE.MatchString(value) }
