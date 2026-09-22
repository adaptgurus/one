//go:build windows

package opstore

import (
	"errors"
	"os"
)

// Privileged host operations are Linux-only. This keeps controller/tooling
// builds portable while failing closed if the root operation store is invoked
// on Windows.
func lockExclusive(_ *os.File) error {
	return errors.New("privileged operation store is unsupported on Windows")
}

func unlock(_ *os.File) error { return nil }
