#!/usr/bin/env bash
# Deliberately pinned. Update version and checksum together after validation.
# https://nodejs.org/en/blog/release/v22.23.3
set -euo pipefail
version=22.23.3
sha=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de
destination=${1:-/opt/fathom-pvp/runtime}
test "$(uname -m)" = x86_64 || { echo 'This pinned runtime is Linux x86_64 only' >&2; exit 1; }
archive="node-v${version}-linux-x64.tar.xz"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/v${version}/${archive}" -o "$scratch/$archive"
printf '%s  %s\n' "$sha" "$scratch/$archive" | sha256sum --check --status
mkdir -p "$destination"
test ! -e "$destination/node-v${version}-linux-x64"
tar -xJf "$scratch/$archive" -C "$destination" --no-same-owner
"$destination/node-v${version}-linux-x64/bin/node" --version
