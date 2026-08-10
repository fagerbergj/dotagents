#!/bin/sh
# Symlink this repo (cloned at ~/.agents) into each harness's config location.
# Safe to re-run: replaces stale symlinks, backs up real files to <path>.bak.
set -eu

AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"


link() {
  src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ]; then
    echo "backing up $dst -> $dst.bak"
    mv "$dst" "$dst.bak"
  fi
  ln -s "$src" "$dst"
  echo "linked $dst -> $src"
}

# Claude Code (skills arrive via the dotagents plugin, not a symlink - see README)
link "$AGENTS_DIR/AGENTS.md" "$HOME/.claude/CLAUDE.md"
link "$AGENTS_DIR/AGENTS.md" "$HOME/.claude/AGENTS.md"

# opencode needs no link: it falls back to ~/.claude/CLAUDE.md (linked above)
# for global rules, and reads skills from ~/.agents/skills natively.

# pi (skills arrive via the dotagents plugin, not a symlink - see README)
link "$AGENTS_DIR/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
# pi custom-provider extension (personal, not part of the plugin surface - see .pi/)
link "$AGENTS_DIR/.pi/extensions/llm-swap.ts" "$HOME/.pi/agent/extensions/llm-swap.ts"
# pi-lsp server declarations (bins installed by install-lsp-servers.sh)
link "$AGENTS_DIR/.pi/lsp.json" "$HOME/.pi/agent/lsp.json"

# codex
link "$AGENTS_DIR/AGENTS.md" "$HOME/.codex/AGENTS.md"
