package inventory

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type NIC struct {
	Name              string `json:"name"`
	MAC               string `json:"mac,omitempty"`
	PCIAddress        string `json:"pci_address,omitempty"`
	Driver            string `json:"driver,omitempty"`
	Firmware          string `json:"firmware,omitempty"`
	SpeedMbps         int    `json:"speed_mbps,omitempty"`
	Duplex            string `json:"duplex,omitempty"`
	LinkUp            bool   `json:"link_up"`
	MTU               int    `json:"mtu,omitempty"`
	NUMANode          int    `json:"numa_node"`
	RDMA              bool   `json:"rdma"`
	SRIOVTotalVFs     int    `json:"sriov_total_vfs,omitempty"`
	HardwareBacked    bool   `json:"hardware_backed"`
	EligibleForFabric bool   `json:"eligible_for_fabric"`
}

type FCAdapter struct {
	Host            string `json:"host"`
	PortName        string `json:"port_name,omitempty"`
	NodeName        string `json:"node_name,omitempty"`
	PortState       string `json:"port_state,omitempty"`
	Speed           string `json:"speed,omitempty"`
	SupportedSpeeds string `json:"supported_speeds,omitempty"`
}
type nicCommandRunner interface {
	Run(context.Context, string, ...string) string
}

type defaultNICRunner struct{}

func (defaultNICRunner) Run(ctx context.Context, name string, args ...string) string {
	return command(ctx, name, args...)
}

func CollectNICs(ctx context.Context) []NIC {
	return collectNICs(ctx, "/sys", defaultNICRunner{})
}

func collectNICs(ctx context.Context, sysRoot string, runner nicCommandRunner) []NIC {
	root := filepath.Join(sysRoot, "class", "net")
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	rdma := rdmaNetdevs(ctx, runner)
	result := make([]NIC, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && entry.Type()&os.ModeSymlink == 0 {
			continue
		}
		name := entry.Name()
		if name == "lo" {
			continue
		}
		base := filepath.Join(root, name)
		device := filepath.Join(base, "device")
		_, deviceErr := os.Stat(device)
		nic := NIC{
			Name:              name,
			MAC:               readAt(filepath.Join(base, "address")),
			SpeedMbps:         readInt(filepath.Join(base, "speed"), 0),
			Duplex:            strings.ToLower(readAt(filepath.Join(base, "duplex"))),
			LinkUp:            readAt(filepath.Join(base, "operstate")) == "up" || readAt(filepath.Join(base, "carrier")) == "1",
			MTU:               readInt(filepath.Join(base, "mtu"), 0),
			NUMANode:          readInt(filepath.Join(device, "numa_node"), -1),
			SRIOVTotalVFs:     readInt(filepath.Join(device, "sriov_totalvfs"), 0),
			HardwareBacked:    deviceErr == nil,
			EligibleForFabric: deviceErr == nil,
			RDMA:              rdma[name],
		}
		uevent := keyValueFile(filepath.Join(device, "uevent"))
		nic.PCIAddress = uevent["PCI_SLOT_NAME"]
		nic.Driver = uevent["DRIVER"]
		if info := runner.Run(ctx, "ethtool", "-i", name); info != "" {
			fields := colonFields(info)
			if fields["driver"] != "" {
				nic.Driver = fields["driver"]
			}
			nic.Firmware = fields["firmware-version"]
		}
		if status := runner.Run(ctx, "ethtool", name); status != "" {
			fields := colonFields(status)
			if nic.SpeedMbps <= 0 {
				nic.SpeedMbps = parseSpeedMbps(fields["speed"])
			}
			if nic.Duplex == "" {
				nic.Duplex = strings.ToLower(fields["duplex"])
			}
			if strings.EqualFold(fields["link detected"], "yes") {
				nic.LinkUp = true
			}
		}
		result = append(result, nic)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result
}
func CollectFCAdapters() []FCAdapter {
	return collectFCAdapters("/sys")
}

func collectFCAdapters(sysRoot string) []FCAdapter {
	matches, _ := filepath.Glob(filepath.Join(sysRoot, "class", "fc_host", "host*"))
	result := make([]FCAdapter, 0, len(matches))
	for _, base := range matches {
		result = append(result, FCAdapter{
			Host:            filepath.Base(base),
			PortName:        readAt(filepath.Join(base, "port_name")),
			NodeName:        readAt(filepath.Join(base, "node_name")),
			PortState:       readAt(filepath.Join(base, "port_state")),
			Speed:           readAt(filepath.Join(base, "speed")),
			SupportedSpeeds: readAt(filepath.Join(base, "supported_speeds")),
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Host < result[j].Host })
	return result
}

func readAt(path string) string {
	body, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(body))
}

func readInt(path string, fallback int) int {
	value, err := strconv.Atoi(readAt(path))
	if err != nil {
		return fallback
	}
	return value
}
func keyValueFile(path string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(readAt(path), "\n") {
		if !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		out[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	return out
}

func colonFields(value string) map[string]string {
	out := map[string]string{}
	for _, line := range strings.Split(value, "\n") {
		if !strings.Contains(line, ":") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		out[strings.ToLower(strings.TrimSpace(parts[0]))] = strings.TrimSpace(parts[1])
	}
	return out
}

func parseSpeedMbps(value string) int {
	value = strings.TrimSpace(strings.TrimSuffix(value, "Mb/s"))
	value = strings.TrimSuffix(value, "Mbps")
	value = strings.TrimSpace(value)
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return n
}
func rdmaNetdevs(ctx context.Context, runner nicCommandRunner) map[string]bool {
	out := map[string]bool{}
	raw := runner.Run(ctx, "rdma", "-j", "link", "show")
	if raw == "" {
		return out
	}
	var rows []map[string]any
	if json.Unmarshal([]byte(raw), &rows) != nil {
		return out
	}
	for _, row := range rows {
		for _, key := range []string{"netdev", "netdev_name"} {
			if value, ok := row[key].(string); ok && value != "" {
				out[value] = true
			}
		}
	}
	return out
}
