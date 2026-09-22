#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
OUTPUT="${2:-dist/layersentry-host-agent}"
[[ "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$ ]] || { echo "Usage: $0 VERSION [OUTPUT]" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
mkdir -p "$(dirname "$OUTPUT")"
export CGO_ENABLED=0 GOOS=linux GOARCH=amd64

go test ./...
go vet ./...
go build -trimpath -buildvcs=true \
  -ldflags="-s -w -X main.Version=$VERSION" \
  -o "$OUTPUT" ./cmd/layersentry-host-agent
"$OUTPUT" self-test | grep -Fx "$VERSION" >/dev/null
sha256sum "$OUTPUT" >"${OUTPUT}.sha256"
printf 'Built %s\n' "$OUTPUT"
