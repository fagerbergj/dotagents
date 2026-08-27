#!/usr/bin/env bash
# Run one suite's baseline. Results are stamped with the skill version they
# measured, read from the skill's own frontmatter.
set -euo pipefail
suite="${1:?usage: run.sh <suite> [extra promptfoo args...]}"; shift || true
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# OpenRouter key lives beside the results, gitignored
[ -f "$here/.env" ] && { set -a; . "$here/.env"; set +a; }
# Assertion-level providers ignore apiKeyEnvar, so judges 401 while generations
# succeed on the same key. Every provider here is `openai:chat:*`, which falls back
# to OPENAI_API_KEY - so point that at the OpenRouter key and the judges authenticate.
export OPENAI_API_KEY="${OPENAI_API_KEY:-$OPENROUTER_API_KEY}"
version="$(sed -n 's/^[[:space:]]*version:[[:space:]]*"\?\([^"]*\)"\?[[:space:]]*$/\1/p' \
  "$here/../skills/$suite/SKILL.md" | head -1)"
version="${version:-unversioned}"
out="$here/results/$suite@$version.json"
mkdir -p "$here/results"
# rollup.js runs again at publish time, off the uploaded artifact and without this
# job's env, so the shipped version has to travel with the results or both skill
# arms collapse into one column and the older one is filed under the newer name.
[ -n "${SKILL_BASE_VERSION:-}" ] && printf '%s' "$SKILL_BASE_VERSION" > "${out%.json}.base-version"

# The no-skill arm's prompt never changes, so its results stay valid until the
# case text or the model does - promptfoo keys the cache on both. Bumping a
# skill's version only invalidates the skill-current arm and the judges that
# read it. Pass --fresh to bypass.
# promptfoo writes every run to one shared SQLite db, so parallel suites deadlock
# on it with "database is locked". Each suite gets its own config dir; the cache
# stays shared so generation hits still work across suites.
export PROMPTFOO_CONFIG_DIR="${PROMPTFOO_CONFIG_DIR:-/tmp/pf-$suite}"
mkdir -p "$PROMPTFOO_CONFIG_DIR"
export PROMPTFOO_CACHE_PATH="${PROMPTFOO_CACHE_PATH:-$here/.cache}"
export PROMPTFOO_CACHE_TTL="${PROMPTFOO_CACHE_TTL:-7776000}"   # 90 days
cache_flag=""
args=()
for arg in "$@"; do
  if [ "$arg" = "--fresh" ]; then cache_flag="--no-cache"; else args+=("$arg"); fi
done
set -- "${args[@]+"${args[@]}"}"

cd "$here/skills/$suite"
# Three arms only when there is a second skill version to compare against.
# SKILL_CURRENT names the shipped copy; the checkout is then the new one, and the
# third prompt is appended to a throwaway config so the ten committed ones stay
# two-arm. Parsed and re-emitted rather than text-appended: the configs carry
# anchors, and a sed would sit inside one.
config=promptfooconfig.yaml
if [ -n "${SKILL_CURRENT:-}" ]; then
  export SKILL_NEXT="$here/../skills/$suite/SKILL.md"
  config=".promptfooconfig.3arm.yaml"
  python3 - "$config" <<'PYCFG'
import sys, yaml
c = yaml.safe_load(open('promptfooconfig.yaml'))
labels = {p.get('label') for p in c['prompts']}
if 'skill-next' not in labels:
    c['prompts'].append({'id': 'file://prompts/arms.js:skillNext', 'label': 'skill-next'})
yaml.safe_dump(c, open(sys.argv[1], 'w'), sort_keys=False, width=10**6)
PYCFG
  trap 'rm -f "$here/skills/$suite/.promptfooconfig.3arm.yaml"' EXIT
fi
node assertions/*.test.cjs
# The load_resource provider is shared harness code, so its self-check runs for
# every suite even though only mermaid uses it yet.
node "$here/lib/skill-tools.test.cjs"
# A case var containing {{ or {% renders through nunjucks and can throw, which
# empties the output in every arm while the run still reports success.
python3 "$here/lib/check-case-vars.py" tests/*.yaml
# `validate config` reports "Configuration is valid" for a case whose last
# assertion was deleted, and for an assertion with no metric or a dangling
# file://...:fn. This walks the parsed tree instead.
python3 "$here/lib/check-suite.py" .
# Real pull requests as input: clone the repo at the pinned SHAs and materialise
# the diff plus the tree the change was opened against. No-op for a suite with no
# tests/fixtures.json, which is every suite but review-code. Network, so it runs
# after the free checks and before a single token is bought.
node "$here/lib/fetch-fixtures.js" .
npx -y promptfoo@latest eval -c "$config" -o "$out" \
  $cache_flag --no-share --max-concurrency "${EVAL_CONCURRENCY:-8}" "$@" || true
node "$here/report.js" "$out" --md "${out%.json}.md"
echo "results: $out"
