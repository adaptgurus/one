package config

import "testing"

func TestConfigValidation(t *testing.T) {
	cfg := Config{Schema: "layersentry-host-agent/v1", Site: "dc1", Host: "kvm01", ControllerURL: "https://controller.example", CAFile: "/etc/layersentry/ca.pem", SigningKeyFile: "/etc/layersentry/signing.pem", Update: UpdatePolicy{Mode: "online", RepoIDs: []string{"baseos", "appstream"}, PackageAllowlist: []string{"openssl", "systemd"}}}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	cfg.ControllerURL = "http://controller.example"
	if err := cfg.Validate(); err == nil {
		t.Fatal("insecure controller URL accepted")
	}
}

func TestSafeAbsolutePathUsesLinuxSemanticsOnAnyBuildHost(t *testing.T) {
	for _, valid := range []string{"/etc/layersentry/ca.pem", "/var/lib/layersentry/agent/pki/client.key"} {
		if !safeAbsolutePath(valid) {
			t.Fatalf("valid Linux absolute path rejected: %q", valid)
		}
	}
	for _, invalid := range []string{"C:\\layersentry\\ca.pem", "etc/layersentry/ca.pem", "/etc/layersentry/../shadow", "/"} {
		if safeAbsolutePath(invalid) {
			t.Fatalf("unsafe/non-Linux path accepted: %q", invalid)
		}
	}
}

func TestCustomRepoRejectsCredentialURL(t *testing.T) {
	u := UpdatePolicy{Mode: "custom", RepoIDs: []string{"layersentry"}, PackageAllowlist: []string{"openssl"}, CustomRepoID: "layersentry", CustomBaseURL: "https://user:pass@example/repo", CredentialsFile: "/etc/layersentry/repo.json"}
	if err := u.Validate(); err == nil {
		t.Fatal("embedded repo credentials accepted")
	}
}
