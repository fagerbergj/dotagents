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

# opencode (global rules; skills are read from ~/.agents/skills natively)
link "$AGENTS_DIR/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"

# pi (skills arrive via the dotagents plugin, not a symlink - see README)
link "$AGENTS_DIR/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
# pi custom-provider extension (personal, not part of the plugin surface - see machine/)
link "$AGENTS_DIR/.pi/extensions/llm-swap.ts" "$HOME/.pi/agent/extensions/llm-swap.ts"

# codex
link "$AGENTS_DIR/AGENTS.md" "$HOME/.codex/AGENTS.md"
