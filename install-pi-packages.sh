#!/bin/sh
# Merge pi-packages.json's package list into ~/.pi/agent/settings.json's
# "packages" array. Safe to re-run: union + sort, other settings keys untouched.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/pi-packages.json"
SETTINGS="$HOME/.pi/agent/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not found; install it to run this script" >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "error: $CONFIG not found" >&2
  exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "warn: pi CLI not found; skipping pi packages" >&2
  exit 0
fi

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

tmp=$(mktemp)
jq --slurpfile want "$CONFIG" \
  '.packages = ((.packages // []) + $want[0].packages | unique)' \
  "$SETTINGS" > "$tmp"
mv "$tmp" "$SETTINGS"
echo "Pi: packages merged into $SETTINGS"

# Personal llm-swap provider: its own local pi package (machine config, not
# part of the published dotagents surface). Path install, so no registry.
pi install "$SCRIPT_DIR/llm-swap" || echo "warn: llm-swap install failed" >&2
