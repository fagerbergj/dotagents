#!/bin/sh
# Install the Claude Code plugins this setup expects. Safe to re-run.
set -eu

install() {
  plugin="$1" marketplace="$2"
  if claude plugin list 2>/dev/null | grep -q "$plugin"; then
    echo "$plugin already installed"
    return
  fi
  claude plugin marketplace add "$marketplace"
  claude plugin install "$plugin"
}

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found; inside Claude Code run:" >&2
  echo "  /plugin marketplace add https://github.com/DietrichGebert/ponytail.git" >&2
  echo "  /plugin install ponytail@ponytail" >&2
  exit 1
fi

install ponytail@ponytail https://github.com/DietrichGebert/ponytail.git
