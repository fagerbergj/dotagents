#!/bin/sh
# Register my MCP servers with each harness that supports them. Safe to
# re-run: registration is skipped when the server name is already present.
set -eu

# name|transport|url - one server per line (grow into a manifest at 3+).
SERVERS="deepwiki|http|http://jason-server:3008/mcp"

if command -v claude >/dev/null 2>&1; then
  existing=$(claude mcp list 2>/dev/null || true)
  echo "$SERVERS" | while IFS='|' read -r name transport url; do
    if printf '%s' "$existing" | grep -q "^$name:"; then
      echo "Claude Code: $name already registered"
    else
      claude mcp add --scope user --transport "$transport" "$name" "$url"
    fi
  done
else
  echo "warn: claude CLI not found; skipping Claude Code MCP servers" >&2
fi
