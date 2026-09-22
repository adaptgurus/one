package main

import "testing"

func TestControllerSelfTestAcceptsVersion(t *testing.T) {
	old := Version
	Version = "0.1.0-test"
	defer func() { Version = old }()
	if err := controllerSelfTest(); err != nil {
		t.Fatalf("controller self-test failed: %v", err)
	}
}

func TestControllerSelfTestRejectsEmptyVersion(t *testing.T) {
	old := Version
	Version = ""
	defer func() { Version = old }()
	if err := controllerSelfTest(); err == nil {
		t.Fatal("expected empty version to fail self-test")
	}
}
