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

# --- kotlin-lsp (Kotlin, JetBrains) ---
# Standalone build off their CDN; GitHub releases carry no assets and links
# rotate weekly, so the version is pinned - bump deliberately (RELEASES.md).
# Both Claude Code's kotlin-lsp plugin and .pi/lsp.json expect this binary.
KOTLIN_LSP_VERSION="262.9593.0"
if have kotlin-lsp; then
  echo "LSP: kotlin-lsp already installed"
elif have curl; then
  echo "LSP: installing kotlin-lsp $KOTLIN_LSP_VERSION ..."
  dest="$HOME/.local/share/kotlin-lsp"
  mkdir -p "$dest" "$HOME/.local/bin"
  curl -fsSL "https://download-cdn.jetbrains.com/language-server/kotlin-server/$KOTLIN_LSP_VERSION/kotlin-server-$KOTLIN_LSP_VERSION.tar.gz" |
    tar -xzf - -C "$dest"
  chmod +x "$dest/kotlin-server-$KOTLIN_LSP_VERSION/kotlin-lsp.sh"
  ln -sf "$dest/kotlin-server-$KOTLIN_LSP_VERSION/kotlin-lsp.sh" "$HOME/.local/bin/kotlin-lsp"
  have java || echo "warn: no java on PATH - kotlin-lsp needs a JRE 17+ to run" >&2
  have kotlin-lsp || echo "warn: ~/.local/bin is not on PATH" >&2
else
  echo "warn: curl not found; skipping kotlin-lsp" >&2
fi

echo "Done with LSP servers."
