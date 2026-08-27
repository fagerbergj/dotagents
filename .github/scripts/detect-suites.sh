#!/usr/bin/env bash
# Work out which evals/skills/<name> suites a PR's changed files affect.
#
# A suite is affected if EITHER the skill itself (skills/<name>/**) or its own
# eval suite (evals/skills/<name>/**) changed - a case/grader edit invalidates
# the baseline just as much as a SKILL.md edit does. Only names with a real
# evals/skills/<name>/ directory are considered; a skill with no suite yet is
# silently skipped, not an error.
#
# Usage: detect-suites.sh <repo-root> < changed-files.txt
# changed-files.txt: one repo-relative path per line (e.g. `git diff --name-only`).
# Prints a JSON array: [{"name":..., "skill_paths":[...], "suite_paths":[...]}, ...]
set -euo pipefail
root="${1:?usage: detect-suites.sh <repo-root> < changed-files.txt}"

changed_files="$(cat)"

# A change to the shared harness - the provider every suite calls, the prompt
# builder, the reporters, the pre-run gates - invalidates every suite's baseline
# just as much as editing one suite does. Without this, a PR touching only
# evals/lib/ matches no suite and the workflow reports "Nothing will run".
shared="$(printf '%s\n' "$changed_files" | grep -E '^evals/(lib/|run\.sh|report\.js|rollup\.js|package(-lock)?\.json)' || true)"

first=true
echo -n '['
for suite_dir in "$root"/evals/skills/*/; do
  [ -d "$suite_dir" ] || continue
  name="$(basename "$suite_dir")"
  skill_paths="$(printf '%s\n' "$changed_files" | grep -E "^skills/${name}/" || true)"
  suite_paths="$(printf '%s\n' "$changed_files" | grep -E "^evals/skills/${name}/" || true)"
  [ -z "$skill_paths" ] && [ -z "$suite_paths" ] && [ -z "$shared" ] && continue
  $first || echo -n ','
  first=false
  skill_json="$(printf '%s\n' "$skill_paths" | sed '/^$/d' | jq -R . | jq -s -c .)"
  suite_json="$(printf '%s\n' "$suite_paths$([ -n "$shared" ] && printf '\n%s' "$shared")" | sed '/^$/d' | jq -R . | jq -s -c .)"
  printf '{"name":%s,"skill_paths":%s,"suite_paths":%s}' \
    "$(printf '%s' "$name" | jq -R .)" "$skill_json" "$suite_json"
done
echo ']'
