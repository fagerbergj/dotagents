#!/bin/sh
# Install dotagents itself as a plugin, ask-gated per harness. Needed only for
# harnesses that don't read ~/.agents natively (Claude Code); for the rest the
# clone IS the install, so saying no here costs nothing.
set -eu

DOTAGENTS_REPO="https://github.com/fagerbergj/dotagents.git"
AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"
# The marketplace splits the skills into these; apc generates the list's
# source (.claude-plugin/marketplace.json) from plugin.json's grouping.
PLUGINS="dotagents-documentation dotagents-coding dotagents-contributing"

# Optional arg limits to one harness. bootstrap passes "claude" - the only
# harness that needs the plugin; run with no arg to be offered the rest.
only="${1:-}"
want() { [ -z "$only" ] || [ "$only" = "$1" ]; }

ask() {
  if [ ! -t 0 ]; then
    echo "non-interactive: skipping - $1 (run install-as-plugin.sh directly to be asked)"
    return 1
  fi
  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in y | Y | yes) return 0 ;; *) return 1 ;; esac
}

# --- Claude Code (does NOT read ~/.agents: the plugin is how skills + mcp.json arrive) ---
if want claude && command -v claude >/dev/null 2>&1; then
  if claude plugin list 2>/dev/null | grep -q "dotagents-.*@dotagents"; then
    echo "Claude Code: dotagents plugins already installed"
  elif ask "Claude Code: install the dotagents plugins? (Claude doesn't read ~/.agents natively)"; then
    # The local clone IS the marketplace, so its plugin list always matches
    # the checked-out branch; the git URL would serve main's copy instead.
    echo "Claude Code: adding dotagents marketplace ..."
    claude plugin marketplace add "$AGENTS_DIR" >/dev/null 2>&1 || true
    for p in $PLUGINS; do
      echo "Claude Code: installing $p ..."
      if ! claude plugin install "$p@dotagents"; then
        echo "warn: $p install failed; inside Claude Code run: /plugin install $p@dotagents" >&2
      fi
    done
  fi
else
  echo "warn: claude CLI not found; skipping dotagents for Claude Code" >&2
fi

# --- OpenCode: no install step. opencode auto-discovers skills upward from
# .agents/skills (global and project). Its `plugin` command only takes npm
# modules with a JS entrypoint, which dotagents has none of.
want opencode && echo "OpenCode: skills load natively from ~/.agents/skills, no plugin install needed"

# --- Pi (reads ~/.agents natively; installing as a package is an optional duplicate) ---
if want pi && command -v pi >/dev/null 2>&1; then
  if ask "Pi: install dotagents as a pi package? (pi already loads ~/.agents skills natively)"; then
    echo "Pi: installing dotagents ..."
    if ! pi install git:github.com/fagerbergj/dotagents; then
      echo "warn: dotagents install failed for pi" >&2
    fi
  fi
else
  echo "warn: pi CLI not found; skipping dotagents for pi" >&2
fi
