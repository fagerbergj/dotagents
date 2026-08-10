#!/bin/sh
# Compile the canonical agent-plugins mcp.json into harness-native MCP configs.
# Today that is only Claude Code's .mcp.json (it reads its own schema from the
# plugin root, not the spec file - verified empirically). Authoring-time, not
# bootstrap: the Claude plugin installs from the pushed repo, so run this after
# editing mcp.json and commit both files.
set -eu
cd "$(dirname "$0")"

jq '{mcpServers: (.mcpServers | map_values(
  if .type == "streamable-http" then
    {type: "http", url} + (if .headers then {headers} else {} end)
  elif .type == "sse" then
    {type: "sse", url} + (if .headers then {headers} else {} end)
  else
    {type: "stdio", command}
    + (if .args then {args} else {} end)
    + (if .env then {env} else {} end)
  end
))}' mcp.json > .mcp.json
echo "compiled mcp.json -> .mcp.json (claude)"
