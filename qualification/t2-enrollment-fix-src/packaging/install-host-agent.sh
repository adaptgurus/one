#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 --binary PATH --version VERSION --config PATH" >&2
  exit 2
}

BINARY=""; VERSION=""; CONFIG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --binary) BINARY="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --config) CONFIG="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -f "$BINARY" && -n "$VERSION" && -f "$CONFIG" ]] || usage
[[ "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$ ]] || { echo "invalid version" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
getent group layersentry-agent >/dev/null || groupadd --system layersentry-agent
getent passwd layersentry-agent >/dev/null || useradd --system --gid layersentry-agent --home-dir /var/lib/layersentry/agent --shell /sbin/nologin layersentry-agent
getent group layersentry-maint >/dev/null || groupadd --system layersentry-maint

install -d -o root -g layersentry-agent -m 0770 /var/lib/layersentry/agent /var/lib/layersentry/agent/pki
install -d -o root -g root -m 0755 /opt/layersentry/agent/releases/"$VERSION" /usr/local/libexec /usr/local/sbin
install -d -o root -g layersentry-agent -m 0750 /etc/layersentry
install -m 0755 "$BINARY" /opt/layersentry/agent/releases/"$VERSION"/layersentry-host-agent
ln -sfn /opt/layersentry/agent/releases/"$VERSION" /opt/layersentry/agent/current
install -o root -g layersentry-agent -m 0640 "$CONFIG" /etc/layersentry/host-agent.json

install -m 0755 "$ROOT/layersentry-agent-wrapper.sh" /usr/local/libexec/layersentry-agent-wrapper.sh
install -m 0755 "$ROOT/layersentry-agent-confirm.sh" /usr/local/libexec/layersentry-agent-confirm.sh
install -m 0755 "$ROOT/layersentry-repo-config.sh" /usr/local/sbin/layersentry-repo-config.sh
install -m 0440 "$ROOT/layersentry-host-agent.sudoers" /etc/sudoers.d/layersentry-host-agent
visudo -cf /etc/sudoers.d/layersentry-host-agent >/dev/null
install -m 0644 "$ROOT/layersentry-host-agent.service" /etc/systemd/system/layersentry-host-agent.service
install -m 0644 "$ROOT/layersentry-host-agent-update.service" /etc/systemd/system/layersentry-host-agent-update.service
install -m 0644 "$ROOT/layersentry-host-agent-update.timer" /etc/systemd/system/layersentry-host-agent-update.timer
systemctl daemon-reload
systemctl enable layersentry-host-agent.service layersentry-host-agent-update.timer

echo "Installed LayerSentry host agent $VERSION. Service starts after controller CA/signing key/bootstrap material is present."
