#!/usr/bin/env bash
# Work out which eval suites a PR's changed files affect.
#
# A suite is affected if EITHER its subject (the file under test) or its own
# eval suite (evals/<suites-dir>/<name>/**) changed - a case/grader edit
# invalidates the baseline just as much as a subject edit does. Only names
# with a real evals/<suites-dir>/<name>/ directory are considered; a suite
# directory with no matching subject is silently skipped, not an error.
#
# Usage: detect-suites.sh <repo-root> [suites-dir] [subject-template] < changed-files.txt
#   repo-root:        absolute path to the checkout.
#   suites-dir:       where suites live. With a `{suite}` placeholder it is a
#                      repo-root-relative per-suite directory template, e.g.
#                      `skills/{suite}/evals` for suites beside their skills.
#                      Without one it is the legacy layout: a directory under
#                      evals/, e.g. `skills` for evals/skills/<name>/.
#                      Default: skills/{suite}/evals (this repo's layout).
#   subject-template: path to the file under test, relative to repo root,
#                      with `{suite}` standing in for the suite name, e.g.
#                      `skills/{suite}/SKILL.md`. A template with NO `{suite}`
#                      names one file shared by every suite (e.g. a repo-root
#                      AGENTS.md) - changing it affects every suite, the same
#                      fan-out already given to evals/lib. Default:
#                      skills/{suite}/SKILL.md (this repo's layout).
#                      When `{suite}` falls in the directory part (as in the
#                      default), a change ANYWHERE under that suite's directory
#                      counts, not just to the named file - a reference, an
#                      asset, etc. When `{suite}` falls in the filename part
#                      (e.g. `{suite}.md` or `prompts/{suite}.md`), only that
#                      exact file counts; there is no per-suite directory to
#                      widen the match to.
# changed-files.txt: one repo-relative path per line (e.g. `git diff --name-only`).
# Prints a JSON array: [{"name":..., "skill_paths":[...], "suite_paths":[...]}, ...]
set -euo pipefail
root="${1:?usage: detect-suites.sh <repo-root> [suites-dir] [subject-template] < changed-files.txt}"
# Two steps for the same `}`-in-default trap as subject_tpl below.
suites_dir="${2:-}"
[ -n "$suites_dir" ] || suites_dir='skills/{suite}/evals'
# Resolve the suites location to a prefix/suffix pair around the suite name,
# so enumeration and path matching below need no layout branches.
case "$suites_dir" in
  *'{suite}'*)
    suites_pre="${suites_dir%%\{suite\}*}"
    suites_post="${suites_dir#*\{suite\}}"
    ;;
  *)
    suites_pre="evals/${suites_dir}/"
    suites_post=""
    ;;
esac
# Two steps on purpose: a `}` inside a ${var:-default} closes the expansion
# early, so the inline default silently became "skills/{suite" (de72eb4 hit
# the same trap in run.sh's EVAL_SUBJECT default).
subject_tpl="${3:-}"
[ -n "$subject_tpl" ] || subject_tpl='skills/{suite}/SKILL.md'

changed_files="$(cat)"

# A change to the shared harness - the provider every suite calls, the prompt
# builder, the reporters, the pre-run gates - invalidates every suite's baseline
# just as much as editing one suite does. Without this, a PR touching only
# evals/lib/ matches no suite and the workflow reports "Nothing will run".
shared="$(printf '%s\n' "$changed_files" | grep -E '^evals/(lib/|run\.sh|report\.js|rollup\.js|package(-lock)?\.json)' || true)"

# A subject-template with no {suite} placeholder names a single file shared by
# every suite. grep -Fx (fixed string, whole line) needs no regex escaping.
has_suite_placeholder=false
case "$subject_tpl" in *'{suite}'*) has_suite_placeholder=true ;; esac
if ! "$has_suite_placeholder"; then
  subject_shared="$(printf '%s\n' "$changed_files" | grep -Fx "$subject_tpl" || true)"
  shared="$(printf '%s\n%s\n' "$shared" "$subject_shared" | sed '/^$/d')"
fi

# Whether {suite} falls in the template's filename (vs. its directory) decides
# how a suite's subject match is scoped below: dirname of `{suite}.md` is `.`,
# not the per-suite directory the original design assumed, so a placeholder
# confined to the filename must match the exact substituted path instead of a
# directory prefix - a prefix there would be "." (matches everything) or, for
# `dir/{suite}.md`, the shared parent `dir` (matches every suite in it).
suite_in_filename=false
case "$(basename "$subject_tpl")" in *'{suite}'*) suite_in_filename=true ;; esac

first=true
echo -n '['
for suite_dir in "$root"/${suites_pre}*${suites_post}/; do
  [ -d "$suite_dir" ] || continue
  name="${suite_dir#"$root/$suites_pre"}"
  name="${name%"$suites_post"/}"
  if "$has_suite_placeholder"; then
    subject_path="${subject_tpl//\{suite\}/$name}"
    if "$suite_in_filename"; then
      skill_paths="$(printf '%s\n' "$changed_files" | grep -Fx "$subject_path" || true)"
    else
      # Original behaviour matched the whole skill directory (skills/<name>/**),
      # not just the one subject file - a plain prefix of the substituted
      # subject path reproduces that for any per-suite layout. awk's
      # index(), not grep -E, because subject_prefix is user input and a `.`
      # or other regex metacharacter in it must not become a wildcard.
      subject_prefix="$(dirname "$subject_path")/"
      skill_paths="$(printf '%s\n' "$changed_files" | awk -v p="$subject_prefix" 'index($0, p) == 1')"
    fi
  else
    skill_paths=""
  fi
  # index(), not grep -E, for the same reason: suites_dir and name are user/
  # filesystem input, not a pattern.
  suite_prefix="${suites_pre}${name}${suites_post}/"
  suite_paths="$(printf '%s\n' "$changed_files" | awk -v p="$suite_prefix" 'index($0, p) == 1')"
  [ -z "$skill_paths" ] && [ -z "$suite_paths" ] && [ -z "$shared" ] && continue
  $first || echo -n ','
  first=false
  skill_json="$(printf '%s\n' "$skill_paths" | sed '/^$/d' | jq -R . | jq -s -c .)"
  suite_json="$(printf '%s\n' "$suite_paths$([ -n "$shared" ] && printf '\n%s' "$shared")" | sed '/^$/d' | jq -R . | jq -s -c .)"
  printf '{"name":%s,"skill_paths":%s,"suite_paths":%s}' \
    "$(printf '%s' "$name" | jq -R .)" "$skill_json" "$suite_json"
done
echo ']'
