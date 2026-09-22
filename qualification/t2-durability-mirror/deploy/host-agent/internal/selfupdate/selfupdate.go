package selfupdate

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	InstallRoot    = "/opt/layersentry/agent"
	RootStateRoot  = "/var/lib/layersentry/agent-root"
	AgentStateRoot = "/var/lib/layersentry/agent"
)

var versionRE = regexp.MustCompile(`^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$`)

type Manifest struct {
	Version   string `json:"version"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature"`
	Username  string `json:"-"`
	Password  string `json:"-"`
}

type Pending struct {
	Schema   string `json:"schema"`
	Version  string `json:"version"`
	Previous string `json:"previous,omitempty"`
	Attempts int    `json:"attempts"`
}

func (m Manifest) Verify(key ed25519.PublicKey) error {
	if !versionRE.MatchString(m.Version) {
		return errors.New("invalid agent version")
	}
	if _, err := hex.DecodeString(m.SHA256); err != nil || len(m.SHA256) != 64 {
		return errors.New("invalid agent SHA-256")
	}
	u, err := url.Parse(m.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("agent update URL must be a plain https URL without embedded credentials/query/fragment")
	}
	sig, err := base64.StdEncoding.DecodeString(m.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return errors.New("invalid update signature")
	}
	payload := []byte(m.Version + "\n" + strings.ToLower(m.SHA256) + "\n" + m.URL + "\n")
	if !ed25519.Verify(key, payload, sig) {
		return errors.New("agent update signature verification failed")
	}
	return nil
}

func Stage(m Manifest, signingKey ed25519.PublicKey, caFile string, credentials *[2]string) error {
	if err := m.Verify(signingKey); err != nil {
		return err
	}
	roots, err := rootsFromFile(caFile)
	if err != nil {
		return err
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: roots}}
	client := &http.Client{Transport: transport, Timeout: 5 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, m.URL, nil)
	if err != nil {
		return err
	}
	if credentials != nil {
		req.SetBasicAuth(credentials[0], credentials[1])
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("agent artifact HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if err != nil {
		return err
	}
	if len(data) == 0 || len(data) >= 128<<20 {
		return errors.New("agent artifact size rejected")
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != strings.ToLower(m.SHA256) {
		return errors.New("agent artifact digest mismatch")
	}

	releaseDir := filepath.Join(InstallRoot, "releases", m.Version)
	if err := os.MkdirAll(releaseDir, 0o755); err != nil {
		return err
	}
	binary := filepath.Join(releaseDir, "layersentry-host-agent")
	if err := writeFile(binary, data, 0o755); err != nil {
		return err
	}
	trustedByFapolicyd := false
	if _, lookupErr := exec.LookPath("fapolicyd-cli"); lookupErr == nil {
		_ = exec.Command("fapolicyd-cli", "--file", "delete", binary, "--trust-file", "layersentry").Run()
		if out, trustErr := exec.Command("fapolicyd-cli", "--file", "add", binary, "--trust-file", "layersentry").CombinedOutput(); trustErr != nil {
			return fmt.Errorf("trust staged agent with fapolicyd: %w: %s", trustErr, strings.TrimSpace(string(out)))
		}
		if out, updateErr := exec.Command("fapolicyd-cli", "--update").CombinedOutput(); updateErr != nil {
			return fmt.Errorf("refresh fapolicyd trust database: %w: %s", updateErr, strings.TrimSpace(string(out)))
		}
		trustedByFapolicyd = true
	}
	cmd := exec.Command(binary, "self-test")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if trustedByFapolicyd {
			_ = exec.Command("fapolicyd-cli", "--file", "delete", binary, "--trust-file", "layersentry").Run()
			_ = exec.Command("fapolicyd-cli", "--update").Run()
		}
		return fmt.Errorf("new agent self-test failed: %s", strings.TrimSpace(stderr.String()))
	}
	if strings.TrimSpace(stdout.String()) != m.Version {
		return fmt.Errorf("new agent reports version %q, expected %q", strings.TrimSpace(stdout.String()), m.Version)
	}

	current, _ := filepath.EvalSymlinks(filepath.Join(InstallRoot, "current"))
	previous := ""
	if current != "" {
		previous = current
	}
	if previous != "" {
		if err := atomicSymlink(previous, filepath.Join(InstallRoot, "previous")); err != nil {
			return err
		}
	}
	if err := atomicSymlink(releaseDir, filepath.Join(InstallRoot, "current")); err != nil {
		return err
	}
	if err := os.MkdirAll(RootStateRoot, 0o700); err != nil {
		return err
	}
	if err := os.Chmod(RootStateRoot, 0o700); err != nil {
		return err
	}
	pending := Pending{Schema: "layersentry-agent-pending/v1", Version: m.Version, Previous: previous, Attempts: 0}
	body, _ := json.Marshal(pending)
	return writeFile(filepath.Join(RootStateRoot, "pending-release.json"), append(body, '\n'), 0o600)
}

// MarkHealthy writes only to the unprivileged state directory. The root wrapper
// compares this marker to its separate root-owned pending release transaction.
func MarkHealthy(version string) error {
	if !versionRE.MatchString(version) {
		return errors.New("invalid running version")
	}
	if err := os.MkdirAll(AgentStateRoot, 0o770); err != nil {
		return err
	}
	return writeFile(filepath.Join(AgentStateRoot, "healthy-version"), []byte(version+"\n"), 0o640)
}

func LoadSigningKey(path string) (ed25519.PublicKey, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(body)
	if block == nil {
		return nil, errors.New("invalid signing key PEM")
	}
	value, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := value.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("signing key is not Ed25519")
	}
	return key, nil
}

func rootsFromFile(path string) (*x509.CertPool, error) {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if !pool.AppendCertsFromPEM(body) {
		return nil, errors.New("no CA certificates in configured CA file")
	}
	return pool, nil
}

func atomicSymlink(target, link string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	tmp := link + ".new"
	_ = os.Remove(tmp)
	if err := os.Symlink(target, tmp); err != nil {
		return err
	}
	return os.Rename(tmp, link)
}

func writeFile(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".agent-*")
	if err != nil {
		return err
	}
	tmp := file.Name()
	defer os.Remove(tmp)
	if err = file.Chmod(mode); err != nil {
		file.Close()
		return err
	}
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
