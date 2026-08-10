#!/bin/sh
# Install the language-server binaries .pi/lsp.json declares (pi-lsp resolves
# bare names through PATH and never installs anything itself). Idempotent:
# a binary already on PATH is skipped.
set -eu

have() { command -v "$1" >/dev/null 2>&1; }

# --- gopls (Go) ---
if have gopls; then
  echo "LSP: gopls already installed"
elif have go; then
  echo "LSP: installing gopls ..."
  go install golang.org/x/tools/gopls@latest
  have gopls || echo "warn: gopls installed to \$(go env GOPATH)/bin - add it to PATH" >&2
else
  echo "warn: go not found; skipping gopls" >&2
fi

# --- typescript-language-server (TypeScript/JavaScript) ---
if have typescript-language-server; then
  echo "LSP: typescript-language-server already installed"
elif have npm; then
  echo "LSP: installing typescript-language-server ..."
  npm install -g typescript-language-server typescript
else
  echo "warn: npm not found; skipping typescript-language-server" >&2
fi

# --- kotlin-language-server (Kotlin) ---
# fwcd/kotlin-language-server ships a server.zip release; needs a JRE at runtime.
if have kotlin-language-server; then
  echo "LSP: kotlin-language-server already installed"
elif have curl && have unzip; then
  echo "LSP: installing kotlin-language-server ..."
  dest="$HOME/.local/share/kotlin-language-server"
  mkdir -p "$dest" "$HOME/.local/bin"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/server.zip" https://github.com/fwcd/kotlin-language-server/releases/latest/download/server.zip
  unzip -qo "$tmp/server.zip" -d "$dest"
  rm -rf "$tmp"
  ln -sf "$dest/server/bin/kotlin-language-server" "$HOME/.local/bin/kotlin-language-server"
  have java || echo "warn: no java on PATH - kotlin-language-server needs a JRE to run" >&2
  have kotlin-language-server || echo "warn: ~/.local/bin is not on PATH" >&2
else
  echo "warn: curl/unzip not found; skipping kotlin-language-server" >&2
fi

echo "Done with LSP servers."
