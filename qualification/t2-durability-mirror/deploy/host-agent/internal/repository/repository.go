package repository

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const ManagedRepoPath = "/etc/yum.repos.d/layersentry-managed.repo"

var repoID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$`)

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Request struct {
	RepoID          string `json:"repo_id"`
	BaseURL         string `json:"base_url"`
	GPGKey          string `json:"gpg_key"`
	CredentialsFile string `json:"credentials_file"`
	Username        string `json:"username,omitempty"`
	Password        string `json:"password,omitempty"`
}

func Configure(req Request) error {
	if !repoID.MatchString(req.RepoID) {
		return errors.New("invalid repo id")
	}
	u, err := url.Parse(req.BaseURL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("base_url must be a plain https URL without credentials/query/fragment")
	}
	if req.GPGKey == "" {
		return errors.New("gpg_key is required")
	}
	gpg, err := url.Parse(req.GPGKey)
	if err != nil || (gpg.Scheme != "https" && gpg.Scheme != "file") {
		return errors.New("gpg_key must use https or file")
	}
	if !filepath.IsAbs(req.CredentialsFile) || filepath.Clean(req.CredentialsFile) != req.CredentialsFile {
		return errors.New("credentials_file must be an absolute clean path")
	}
	if req.Username == "" || req.Password == "" {
		return errors.New("repository username/password are required")
	}
	if strings.ContainsAny(req.Username, "\r\n") || strings.ContainsAny(req.Password, "\r\n") {
		return errors.New("repository credentials contain forbidden newline")
	}
	cred := Credentials{Username: req.Username, Password: req.Password}
	if err := atomicJSON(req.CredentialsFile, cred, 0o600); err != nil {
		return err
	}
	// DNF supports username/password repository options. Keep the repo file root-only
	// because DNF does not provide an external password_file option.
	content := fmt.Sprintf("[%s]\nname=LayerSentry managed repository\nbaseurl=%s\nenabled=0\ngpgcheck=1\nrepo_gpgcheck=1\nsslverify=1\ngpgkey=%s\nusername=%s\npassword=%s\n", req.RepoID, req.BaseURL, req.GPGKey, escapeValue(req.Username), escapeValue(req.Password))
	return atomicWrite(ManagedRepoPath, []byte(content), 0o600)
}

func LoadCredentials(path string) (Credentials, error) {
	f, err := os.Open(path)
	if err != nil {
		return Credentials{}, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return Credentials{}, err
	}
	if st.Mode().Perm()&0o077 != 0 {
		return Credentials{}, errors.New("credentials file must not be group/world accessible")
	}
	var c Credentials
	dec := json.NewDecoder(bufio.NewReader(f))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return Credentials{}, err
	}
	if c.Username == "" || c.Password == "" {
		return Credentials{}, errors.New("credentials file is incomplete")
	}
	return c, nil
}

func escapeValue(s string) string {
	// We already reject newline. DNF values may contain punctuation; quote to avoid
	// comment/whitespace ambiguity in the INI parser.
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}

func atomicJSON(path string, v any, mode os.FileMode) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return atomicWrite(path, append(b, '\n'), mode)
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".layersentry-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err := f.Chmod(mode); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(data); err != nil {
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
	return os.Rename(name, path)
}
