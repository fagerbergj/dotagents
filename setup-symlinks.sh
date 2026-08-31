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
link "$AGENTS_DIR/AGENTS.user.md" "$HOME/.claude/CLAUDE.md"
link "$AGENTS_DIR/AGENTS.user.md" "$HOME/.claude/AGENTS.md"

# opencode needs no link: it falls back to ~/.claude/CLAUDE.md (linked above)
# for global rules, and reads skills from ~/.agents/skills natively.

# pi (skills arrive via the dotagents plugin, not a symlink - see README)
link "$AGENTS_DIR/AGENTS.user.md" "$HOME/.pi/agent/AGENTS.md"
# llm-swap moved to the llm-swap package (install-pi-packages.sh); drop the old link
if [ -L "$HOME/.pi/agent/extensions/llm-swap.ts" ]; then rm "$HOME/.pi/agent/extensions/llm-swap.ts"; fi
# pi-lsp server declarations stay a symlink: pi-lsp reads only ~/.pi/agent/lsp.json
# (or project .pi/lsp.json), a pi package cannot ship it. Bins: install-lsp-servers.sh.
link "$AGENTS_DIR/.pi/lsp.json" "$HOME/.pi/agent/lsp.json"

# codex
link "$AGENTS_DIR/AGENTS.user.md" "$HOME/.codex/AGENTS.md"
