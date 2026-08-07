#!/bin/sh
# Install dotagents itself as a plugin, then the third-party plugins listed in
# plugins.json. Safe to re-run.
# Fault tolerant: a missing harness CLI or failed install warns and moves on.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/plugins.json"
DOTAGENTS_REPO="https://github.com/fagerbergj/dotagents.git"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not found; install it to run this script" >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  echo "error: $CONFIG not found" >&2
  exit 1
fi

# === dotagents itself (this is how skills reach the harness now - see README) ===

# --- Claude Code ---
if command -v claude >/dev/null 2>&1; then
  if ! claude plugin list 2>/dev/null | grep -q "dotagents@dotagents"; then
    echo "Claude Code: adding dotagents marketplace ..."
    claude plugin marketplace add "$DOTAGENTS_REPO" >/dev/null 2>&1 || true
    echo "Claude Code: installing dotagents ..."
    if ! claude plugin install dotagents@dotagents; then
      echo "warn: dotagents install failed; inside Claude Code run: /plugin install dotagents@dotagents" >&2
    fi
  else
    echo "Claude Code: dotagents already installed"
  fi
else
  echo "warn: claude CLI not found; skipping dotagents for Claude Code" >&2
fi

# --- OpenCode: no install step. opencode auto-discovers skills upward from
# .agents/skills (global and project) - see README. Its `plugin` command only
# takes npm modules with a JS entrypoint, which dotagents has none of.
echo "OpenCode: skills load natively from ~/.agents/skills, no plugin install needed"

# --- Pi ---
if command -v pi >/dev/null 2>&1; then
  echo "Pi: installing dotagents ..."
  if ! pi install git:github.com/fagerbergj/dotagents; then
    echo "warn: dotagents install failed for pi" >&2
  fi
else
  echo "warn: pi CLI not found; skipping dotagents for pi" >&2
fi

echo "Done with dotagents."

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
if command -v opencode >/dev/null 2>&1; then
  count=$(jq '.opencode | length' "$CONFIG")
  for i in $(seq 0 $((count - 1))); do
    id=$(jq -r ".opencode[$i].id" "$CONFIG")
    echo "OpenCode: installing $id ..."
    if ! opencode plugin --global "$id"; then
      echo "warn: $id install failed" >&2
    fi
  done
else
  echo "warn: opencode CLI not found; skipping OpenCode plugins" >&2
fi

# --- Pi ---
if command -v pi >/dev/null 2>&1; then
  count=$(jq '.pi | length' "$CONFIG")
  for i in $(seq 0 $((count - 1))); do
    id=$(jq -r ".pi[$i].id" "$CONFIG")
    echo "Pi: installing $id ..."
    if ! pi install "$id"; then
      echo "warn: $id install failed" >&2
    fi
  done
else
  echo "warn: pi CLI not found; skipping Pi plugins" >&2
fi

echo "Done."
