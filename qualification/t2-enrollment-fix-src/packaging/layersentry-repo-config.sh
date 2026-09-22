#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 || ! -t 1 ]]; then
  echo "This command must be run from an interactive terminal." >&2
  exit 2
fi

read -r -p "Repository ID: " repo_id
read -r -p "HTTPS base URL: " base_url
read -r -p "GPG key URL (https:// or file://): " gpg_key
read -r -p "Repository username: " username
read -r -s -p "Repository password: " password
echo

cred_file=/etc/layersentry/repo-credentials.json
{
  printf '%s\n' "$repo_id"
  printf '%s\n' "$base_url"
  printf '%s\n' "$gpg_key"
  printf '%s\n' "$cred_file"
  printf '%s\n' "$username"
  printf '%s\n' "$password"
} | sudo -n /opt/layersentry/agent/current/layersentry-host-agent configure-repo --lines

unset password
printf 'LayerSentry repository configuration updated. Credentials are root-only.\n'
