#!/usr/bin/env bash
# Run one suite's baseline. Results are stamped with the version of the SUBJECT
# under test - the file whose effect the arms measure.
set -euo pipefail
suite="${1:?usage: run.sh <suite> [extra promptfoo args...]}"; shift || true
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Gateway key lives beside the results, gitignored
[ -f "$here/.env" ] && { set -a; . "$here/.env"; set +a; }
# Assertion-level providers ignore apiKeyEnvar and fall back to OPENAI_API_KEY, so
# both must point at the same key or judges 401 while generations succeed. Which
# variable holds it is configurable: a repo on another gateway should not have to
# name its secret OPENROUTER_API_KEY.
key_envar="${EVAL_API_KEY_ENVAR:-OPENROUTER_API_KEY}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-${!key_envar:-}}"

# The subject under test. `{suite}` expands to the suite name, so the default
# keeps this repo's one-skill-per-suite layout while a repo testing a single
# shared file (an AGENTS.md, say) sets EVAL_SUBJECT to that one path.
# Assigned in two steps on purpose: a `}` inside a ${var:-default} closes the
# expansion early, so the inline default silently became "../skills/{suite".
subject_tpl="${EVAL_SUBJECT:-}"
[ -n "$subject_tpl" ] || subject_tpl='../skills/{suite}/SKILL.md'
subject="$here/${subject_tpl//\{suite\}/$suite}"
[ -f "$subject" ] || { echo "run.sh: subject not found: $subject" >&2; exit 2; }
subject="$(cd "$(dirname "$subject")" && pwd)/$(basename "$subject")"
export EVAL_SUBJECT_PATH="$subject"

# Where the suites live, relative to this script. Separate from the subject: a
# repo can keep suites anywhere without moving the files under test.
suites_dir="$here/${EVAL_SUITES_DIR:-skills}"

# Frontmatter version where there is one; otherwise the file's own blob hash, so
# a subject without frontmatter still gets a stable per-content label instead of
# collapsing every run into "unversioned" and losing the accumulating columns.
version="$(sed -n 's/^[[:space:]]*version:[[:space:]]*"\?\([^"]*\)"\?[[:space:]]*$/\1/p' "$subject" | head -1)"
if [ -z "$version" ]; then
  version="$(git -C "$here" hash-object "$subject" 2>/dev/null | cut -c1-7)"
  version="${version:+blob-$version}"
fi
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

cd "$suites_dir/$suite"
# Three arms only when there is a second skill version to compare against.
# SKILL_CURRENT names the shipped copy; the checkout is then the new one, and the
# third prompt is appended to a throwaway config so the ten committed ones stay
# two-arm. Parsed and re-emitted rather than text-appended: the configs carry
# anchors, and a sed would sit inside one.
config=promptfooconfig.yaml
if [ -n "${SKILL_CURRENT:-}" ]; then
  export SKILL_NEXT="$subject"
  config=".promptfooconfig.3arm.yaml"
  python3 - "$config" <<'PYCFG'
import sys, yaml
c = yaml.safe_load(open('promptfooconfig.yaml'))
labels = {p.get('label') for p in c['prompts']}
if 'skill-next' not in labels:
    c['prompts'].append({'id': 'file://prompts/arms.js:skillNext', 'label': 'skill-next'})
yaml.safe_dump(c, open(sys.argv[1], 'w'), sort_keys=False, width=10**6)
PYCFG
  trap 'rm -f "$suites_dir/$suite/.promptfooconfig.3arm.yaml"' EXIT
fi
node assertions/*.test.cjs
# The load_resource provider is shared harness code, so its self-check runs for
# every suite even though only mermaid uses it yet.
node "$here/lib/skill-tools.test.cjs"
# Fixture materialisation has its own offline check - a local repo stands in for
# GitHub, so the diff range and the archived tree are exercised without network.
node "$here/lib/fixtures.test.cjs"
# Unwrapping a fenced answer is shared harness code too: it decides what every
# format-markdown grader actually sees.
node "$here/lib/strip-reasoning.test.cjs"
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
