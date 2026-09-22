package topology

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var ifaceRE = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,32}$`)

type Fabric struct {
	Role       string   `json:"role"`
	Interfaces []string `json:"interfaces,omitempty"`
	BondMode   string   `json:"bond_mode,omitempty"`
	SharedWith string   `json:"shared_with,omitempty"`
	Address    string   `json:"address,omitempty"`
	Gateway    string   `json:"gateway,omitempty"`
	DNS        []string `json:"dns,omitempty"`
	MTU        int      `json:"mtu,omitempty"`
	VLAN       int      `json:"vlan,omitempty"`
}

type Request struct {
	CheckpointOperationID string   `json:"checkpoint_operation_id,omitempty"`
	TimeoutSeconds        uint32   `json:"timeout_seconds,omitempty"`
	RequiredTargets       []string `json:"required_targets,omitempty"`
	Fabrics               []Fabric `json:"fabrics"`
}

type Rendered struct {
	Schema             string            `json:"schema"`
	Nmstate            json.RawMessage   `json:"nmstate"`
	PhysicalInterfaces []string          `json:"physical_interfaces"`
	ResultInterfaces   map[string]string `json:"result_interfaces"`
}

var allowedRoles = map[string]bool{
	"management": true, "workload": true, "migration": true,
	"storage_a": true, "storage_b": true, "backup": true,
}

func logicalName(role string) string {
	return map[string]string{
		"management": "ls-mgmt", "workload": "ls-vm",
		"migration": "ls-mig", "storage_a": "ls-sta",
		"storage_b": "ls-stb", "backup": "ls-bkp",
	}[role]
}

func Validate(req Request) error {
	if len(req.Fabrics) == 0 || len(req.Fabrics) > 6 {
		return errors.New("topology requires 1..6 fabrics")
	}
	seen := map[string]bool{}
	usedPhysical := map[string]string{}
	byRole := map[string]Fabric{}
	for _, fabric := range req.Fabrics {
		if !allowedRoles[fabric.Role] || seen[fabric.Role] {
			return fmt.Errorf("invalid or duplicate fabric role %q", fabric.Role)
		}
		seen[fabric.Role] = true
		byRole[fabric.Role] = fabric
		if fabric.MTU == 0 {
			fabric.MTU = 1500
		}
		if fabric.MTU < 1280 || fabric.MTU > 9216 {
			return fmt.Errorf("%s MTU outside 1280..9216", fabric.Role)
		}
		if fabric.VLAN < 0 || fabric.VLAN > 4094 {
			return fmt.Errorf("%s VLAN outside 1..4094", fabric.Role)
		}
		if fabric.SharedWith != "" {
			if fabric.Role == "management" || fabric.Role == "storage_a" || fabric.Role == "storage_b" {
				return fmt.Errorf("%s may not share another fabric", fabric.Role)
			}
			if len(fabric.Interfaces) != 0 {
				return fmt.Errorf("%s shared fabric must not also list interfaces", fabric.Role)
			}
		} else if len(fabric.Interfaces) < 1 || len(fabric.Interfaces) > 2 {
			return fmt.Errorf("%s requires one or two physical interfaces", fabric.Role)
		}

		for _, name := range fabric.Interfaces {
			if !ifaceRE.MatchString(name) || strings.HasPrefix(name, "-") {
				return fmt.Errorf("%s contains invalid interface", fabric.Role)
			}
			if prior := usedPhysical[name]; prior != "" {
				return fmt.Errorf("physical interface %s is reused by %s/%s", name, prior, fabric.Role)
			}
			usedPhysical[name] = fabric.Role
		}
		if len(fabric.Interfaces) == 2 && fabric.BondMode != "active-backup" && fabric.BondMode != "802.3ad" {
			return fmt.Errorf("%s two-port fabric requires active-backup or 802.3ad", fabric.Role)
		}
		if fabric.Role == "management" && fabric.BondMode == "802.3ad" {
			return errors.New("management fabric must not require LACP")
		}
		if fabric.Address != "" {
			ip, _, err := net.ParseCIDR(fabric.Address)
			if err != nil || ip.To4() == nil {
				return fmt.Errorf("%s has invalid IPv4 address/CIDR", fabric.Role)
			}
		}
		if fabric.Gateway != "" && fabric.Role != "management" {
			return fmt.Errorf("%s must not define a gateway", fabric.Role)
		}
		if fabric.Gateway != "" && net.ParseIP(fabric.Gateway).To4() == nil {
			return errors.New("management gateway is invalid")
		}
	}
	for role, fabric := range byRole {
		if fabric.SharedWith != "" {
			base, ok := byRole[fabric.SharedWith]
			if !ok || base.SharedWith != "" || fabric.SharedWith == role {
				return fmt.Errorf("%s shared_with target is invalid", role)
			}
			if fabric.VLAN == 0 {
				return fmt.Errorf("%s shared fabric requires a VLAN", role)
			}
		}
	}
	return nil
}

func ipv4State(address string) (map[string]any, error) {
	if address == "" {
		return map[string]any{"enabled": false, "dhcp": false}, nil
	}
	ip, network, err := net.ParseCIDR(address)
	if err != nil || ip.To4() == nil {
		return nil, errors.New("invalid IPv4 address")
	}
	prefix, _ := network.Mask.Size()
	return map[string]any{"enabled": true, "dhcp": false, "address": []any{map[string]any{"ip": ip.String(), "prefix-length": prefix}}}, nil
}

func baseInterface(name string, fabric Fabric) (map[string]any, []map[string]any) {
	ports := make([]map[string]any, 0, len(fabric.Interfaces))
	for _, port := range fabric.Interfaces {
		ports = append(ports, map[string]any{"name": port, "type": "ethernet", "state": "up", "mtu": fabric.MTU})
	}
	if len(fabric.Interfaces) == 1 {
		return ports[0], ports
	}
	bond := map[string]any{
		"name": name, "type": "bond", "state": "up", "mtu": fabric.MTU,
		"link-aggregation": map[string]any{"mode": fabric.BondMode, "port": fabric.Interfaces, "options": map[string]any{"miimon": 100}},
	}
	return bond, ports
}

func Render(req Request) (Rendered, error) {
	if err := Validate(req); err != nil {
		return Rendered{}, err
	}
	interfaces := []map[string]any{}
	physical := map[string]bool{}
	resolved := map[string]string{}
	byRole := map[string]Fabric{}
	for _, fabric := range req.Fabrics {
		byRole[fabric.Role] = fabric
	}
	for _, role := range []string{"management", "workload", "storage_a", "storage_b", "migration", "backup"} {
		fabric, ok := byRole[role]
		if !ok || fabric.SharedWith != "" {
			continue
		}
		name := logicalName(role)
		base, ports := baseInterface(name, fabric)
		for _, port := range ports {
			physical[port["name"].(string)] = true
		}
		if len(fabric.Interfaces) == 1 {
			name = fabric.Interfaces[0]
		}
		resolved[role] = name
		if fabric.VLAN > 0 {
			base["ipv4"], _ = ipv4State("")
		} else {
			base["ipv4"], _ = ipv4State(fabric.Address)
		}
		base["ipv6"] = map[string]any{"enabled": false, "dhcp": false, "autoconf": false}
		if len(fabric.Interfaces) == 2 {
			interfaces = append(interfaces, ports...)
			interfaces = append(interfaces, base)
		} else {
			interfaces = append(interfaces, base)
		}
	}
	if workload, ok := byRole["workload"]; ok && workload.SharedWith == "" {
		base := resolved["workload"]
		bridge := map[string]any{
			"name": "br-vm", "type": "linux-bridge", "state": "up", "mtu": workload.MTU,
			"ipv4":   map[string]any{"enabled": false, "dhcp": false},
			"ipv6":   map[string]any{"enabled": false, "dhcp": false, "autoconf": false},
			"bridge": map[string]any{"options": map[string]any{"stp": map[string]any{"enabled": false}}, "port": []any{map[string]any{"name": base}}},
		}
		interfaces = append(interfaces, bridge)
		resolved["workload"] = "br-vm"
	}

	for _, role := range []string{"management", "workload", "storage_a", "storage_b", "migration", "backup"} {
		fabric, ok := byRole[role]
		if !ok {
			continue
		}
		base := resolved[role]
		if fabric.SharedWith != "" {
			base = resolved[fabric.SharedWith]
			resolved[role] = base
		}
		if fabric.VLAN > 0 {
			name := logicalName(role) + "." + strconv.Itoa(fabric.VLAN)
			ipv4, _ := ipv4State(fabric.Address)
			interfaces = append(interfaces, map[string]any{"name": name, "type": "vlan", "state": "up", "mtu": fabric.MTU, "vlan": map[string]any{"base-iface": base, "id": fabric.VLAN}, "ipv4": ipv4, "ipv6": map[string]any{"enabled": false, "dhcp": false, "autoconf": false}})
			resolved[role] = name
		}
	}

	state := map[string]any{"interfaces": interfaces}
	if mgmt, ok := byRole["management"]; ok && mgmt.Gateway != "" {
		state["routes"] = map[string]any{"config": []any{map[string]any{"destination": "0.0.0.0/0", "next-hop-address": mgmt.Gateway, "next-hop-interface": resolved["management"], "metric": 100}}}
		if len(mgmt.DNS) > 0 {
			state["dns-resolver"] = map[string]any{"config": map[string]any{"server": mgmt.DNS}}
		}
	}
	body, err := json.Marshal(state)
	if err != nil {
		return Rendered{}, err
	}
	physicalNames := make([]string, 0, len(physical))
	for name := range physical {
		physicalNames = append(physicalNames, name)
	}
	sort.Strings(physicalNames)
	return Rendered{Schema: "layersentry-nmstate-topology/v1", Nmstate: body, PhysicalInterfaces: physicalNames, ResultInterfaces: resolved}, nil
}
