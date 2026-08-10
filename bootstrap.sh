#!/bin/sh
# Single entry point for setting up THIS machine (symlinks, harness plugins, pi
# packages). Not part of the plugin surface consumers fetch - see README.
set -eu
AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"
"$AGENTS_DIR/setup-symlinks.sh"
"$AGENTS_DIR/install-plugins.sh"
"$AGENTS_DIR/install-pi-packages.sh"
"$AGENTS_DIR/install-mcp-servers.sh"
