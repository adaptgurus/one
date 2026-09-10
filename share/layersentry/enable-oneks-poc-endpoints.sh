#!/usr/bin/env bash
# Run as root on rocky-01 only. Enables native OneKS prerequisites for the two POC hosts.
set -euo pipefail
[[ $(id -u) == 0 && $(hostname -s) == rocky-01 ]] || exit 1
systemctl is-active --quiet firewalld
conf=/etc/one/onegate-server.conf
backup=/var/tmp/ls-poc-oneks-prerequisites
install -d -m 0700 "$backup"
[[ -e "$backup/onegate-server.conf" ]] || cp -p "$conf" "$backup/onegate-server.conf"
zone=$(firewall-cmd --get-zone-of-interface=eth0)
[[ -n "$zone" && "$zone" != 'no zone' ]] || zone=$(firewall-cmd --get-default-zone)
firewall-cmd --zone="$zone" --list-all > "$backup/firewall-before.txt"
for source in 10.10.10.22/32 10.10.10.23/32; do
    for port in 2633 5030 4124; do
        rule="rule family=ipv4 source address=$source port port=$port protocol=tcp accept"
        firewall-cmd --zone="$zone" --add-rich-rule="$rule"
        firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule"
    done
    rule="rule family=ipv4 source address=$source port port=4124 protocol=udp accept"
    firewall-cmd --zone="$zone" --add-rich-rule="$rule"
    firewall-cmd --permanent --zone="$zone" --add-rich-rule="$rule"
done
python3 - "$conf" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); s = p.read_text()
old = '  :bind: 127.0.0.1'
new = '  :bind: 0.0.0.0'
if old not in s and new not in s:
    raise SystemExit('Unexpected OneGate bind; inspect before changing')
p.write_text(s.replace(old, new, 1))
PY
systemctl restart opennebula-gate
systemctl is-active opennebula-gate
firewall-cmd --zone="$zone" --list-rich-rules
ss -lnt '( sport = :2633 or sport = :5030 )'
