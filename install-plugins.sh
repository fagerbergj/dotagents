#!/bin/sh
# Install the third-party plugins I like (plugins.json) into each harness.
# Safe to re-run. dotagents itself is install-as-plugin.sh's job.
# Fault tolerant: a missing harness CLI or failed install warns and moves on.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/plugins.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not found; install it to run this script" >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "error: $CONFIG not found" >&2
  exit 1
fi

# ask "question": yes only on an interactive y - pi and opencode load skills
# straight from ~/.agents, so their plugin installs are optional duplicates.
ask() {
  if [ ! -t 0 ]; then
    echo "non-interactive: skipping - $1 (run install-plugins.sh directly to be asked)"
    return 1
  fi
  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in y | Y | yes) return 0 ;; *) return 1 ;; esac
}

# === Third-party plugins from plugins.json ===

# --- Claude Code ---
if command -v claude >/dev/null 2>&1; then
  count=$(jq '.claude | length' "$CONFIG")
  if [ "$count" -gt 0 ]; then
    marketplace_seen=""
    for i in $(seq 0 $((count - 1))); do
      id=$(jq -r ".claude[$i].id" "$CONFIG")
      marketplace_url=$(jq -r ".claude[$i].marketplace_url" "$CONFIG")
      if ! claude plugin list 2>/dev/null | grep -q "$id"; then
        # Add marketplace if not already seen (simple substring dedup)
        case " $marketplace_seen " in
          *" $marketplace_url "*) ;;
          *)
            echo "Claude Code: adding marketplace $marketplace_url ..."
            claude plugin marketplace add "$marketplace_url" >/dev/null 2>&1 || true
            marketplace_seen="$marketplace_seen $marketplace_url"
            ;;
        esac
        echo "Claude Code: installing $id ..."
        if ! claude plugin install "$id"; then
          echo "warn: $id install failed; inside Claude Code run: /plugin install $id" >&2
        fi
      else
        echo "Claude Code: $id already installed"
      fi
    done
  fi
else
  echo "warn: claude CLI not found; skipping Claude Code plugins" >&2
fi

# --- OpenCode ---
if command -v opencode >/dev/null 2>&1 && ask "OpenCode: install plugins.json's opencode plugins?"; then
  count=$(jq '.opencode | length' "$CONFIG")
  for i in $(seq 0 $((count - 1))); do
    id=$(jq -r ".opencode[$i].id" "$CONFIG")
    echo "OpenCode: installing $id ..."
    if ! opencode plugin --global "$id"; then
      echo "warn: $id install failed" >&2
    fi
  done
else
  echo "OpenCode: plugins skipped"
fi

# --- Pi ---
if command -v pi >/dev/null 2>&1 && ask "Pi: install plugins.json's pi plugins?"; then
  count=$(jq '.pi | length' "$CONFIG")
  for i in $(seq 0 $((count - 1))); do
    id=$(jq -r ".pi[$i].id" "$CONFIG")
    echo "Pi: installing $id ..."
    if ! pi install "$id"; then
      echo "warn: $id install failed" >&2
    fi
  done
else
  echo "Pi: plugins skipped"
fi

echo "Done."
