#!/bin/sh
# Single entry point for setting up THIS machine:
#   1. symlink AGENTS.md (+ dotted-dir harness config) into place
#   2. offer dotagents itself as a plugin to harnesses that don't read ~/.agents
#   3. offer the third-party plugins I like, then merge pi packages
# Not part of the plugin surface consumers fetch - see README.
set -eu
AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"
"$AGENTS_DIR/setup-symlinks.sh"
"$AGENTS_DIR/install-as-plugin.sh" claude
"$AGENTS_DIR/install-plugins.sh"
"$AGENTS_DIR/install-pi-packages.sh"
# llm-swap for opencode + codex: providers are config there, not plugins -
# merge into their configs (self-gates on which CLIs exist)
node "$AGENTS_DIR/llm-swap/install.mjs" || echo "warn: llm-swap config merge failed" >&2
"$AGENTS_DIR/install-lsp-servers.sh"
