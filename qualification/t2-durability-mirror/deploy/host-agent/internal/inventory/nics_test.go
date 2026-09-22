package inventory

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeNICRunner map[string]string

func (f fakeNICRunner) Run(_ context.Context, name string, args ...string) string {
	return f[name+" "+strings.Join(args, " ")]
}

func writeTestFile(t *testing.T, path, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(value), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCollectNICsNormalizesHardwareCapabilities(t *testing.T) {
	root := t.TempDir()
	base := filepath.Join(root, "class", "net", "eno1")
	writeTestFile(t, filepath.Join(base, "address"), "52:54:00:aa:bb:cc\n")
	writeTestFile(t, filepath.Join(base, "speed"), "25000\n")
	writeTestFile(t, filepath.Join(base, "duplex"), "full\n")
	writeTestFile(t, filepath.Join(base, "operstate"), "up\n")
	writeTestFile(t, filepath.Join(base, "carrier"), "1\n")
	writeTestFile(t, filepath.Join(base, "mtu"), "9000\n")
	writeTestFile(t, filepath.Join(base, "device", "uevent"), "PCI_SLOT_NAME=0000:65:00.0\nDRIVER=mlx5_core\n")
	writeTestFile(t, filepath.Join(base, "device", "numa_node"), "1\n")
	writeTestFile(t, filepath.Join(base, "device", "sriov_totalvfs"), "64\n")
	writeTestFile(t, filepath.Join(root, "class", "net", "bond0", "operstate"), "up\n")

	runner := fakeNICRunner{
		"rdma -j link show": `[{"netdev":"eno1"}]`,
		"ethtool -i eno1":   "driver: mlx5_core\nfirmware-version: 28.39.1002\n",
		"ethtool eno1":      "Speed: 25000Mb/s\nDuplex: Full\nLink detected: yes\n",
		"ethtool -i bond0":  "",
		"ethtool bond0":     "",
	}

	nics := collectNICs(context.Background(), root, runner)
	if len(nics) != 2 {
		t.Fatalf("expected 2 interfaces, got %d: %#v", len(nics), nics)
	}
	var eno1, bond0 NIC
	for _, nic := range nics {
		switch nic.Name {
		case "eno1":
			eno1 = nic
		case "bond0":
			bond0 = nic
		}
	}
	if eno1.PCIAddress != "0000:65:00.0" || eno1.Driver != "mlx5_core" || eno1.Firmware != "28.39.1002" {
		t.Fatalf("identity/driver inventory wrong: %#v", eno1)
	}
	if eno1.SpeedMbps != 25000 || !eno1.LinkUp || eno1.MTU != 9000 || eno1.NUMANode != 1 {
		t.Fatalf("link inventory wrong: %#v", eno1)
	}
	if !eno1.RDMA || eno1.SRIOVTotalVFs != 64 || !eno1.HardwareBacked || !eno1.EligibleForFabric {
		t.Fatalf("capabilities wrong: %#v", eno1)
	}
	if bond0.EligibleForFabric || bond0.HardwareBacked {
		t.Fatalf("software bond must not be a base fabric NIC: %#v", bond0)
	}
}

func TestCollectFCAdaptersReturnsStableIdentifiers(t *testing.T) {
	root := t.TempDir()
	base := filepath.Join(root, "class", "fc_host", "host6")
	writeTestFile(t, filepath.Join(base, "port_name"), "0x10000090fa123456\n")
	writeTestFile(t, filepath.Join(base, "node_name"), "0x20000090fa123456\n")
	writeTestFile(t, filepath.Join(base, "port_state"), "Online\n")
	writeTestFile(t, filepath.Join(base, "speed"), "32 Gbit\n")
	writeTestFile(t, filepath.Join(base, "supported_speeds"), "8 Gbit, 16 Gbit, 32 Gbit\n")

	adapters := collectFCAdapters(root)
	if len(adapters) != 1 {
		t.Fatalf("expected one FC adapter, got %#v", adapters)
	}
	got := adapters[0]
	if got.PortName != "0x10000090fa123456" || got.NodeName != "0x20000090fa123456" {
		t.Fatalf("stable FC identity missing: %#v", got)
	}
	if got.PortState != "Online" || got.Speed != "32 Gbit" {
		t.Fatalf("FC state wrong: %#v", got)
	}
}
