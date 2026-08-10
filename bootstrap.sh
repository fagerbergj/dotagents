#!/bin/sh
# Single entry point for setting up THIS machine:
#   1. symlink AGENTS.md (+ dotted-dir harness config) into place
#   2. offer dotagents itself as a plugin to harnesses that don't read ~/.agents
#   3. offer the third-party plugins I like, then merge pi packages
# Not part of the plugin surface consumers fetch - see README.
set -eu
AGENTS_DIR="$(cd "$(dirname "$0")" && pwd)"
"$AGENTS_DIR/setup-symlinks.sh"
"$AGENTS_DIR/install-as-plugin.sh"
"$AGENTS_DIR/install-plugins.sh"
"$AGENTS_DIR/install-pi-packages.sh"
