#!/usr/bin/env bash
# Merge eval runs into the `eval-results` orphan branch and push.
#
# Usage: publish-results.sh <manifest.tsv> <merge-sha> <model-label> [skipped-note]
#   manifest.tsv: one line per publishable suite, tab-separated:
#     <suite> <abs path to promptfoo results json> <source-sha> <reused|rerun>
#   skipped-note: free text naming suites deliberately not published (errored runs).
#
# Requires GITHUB_TOKEN, GITHUB_REPOSITORY, and REPO_DIR (the checkout holding
# evals/rollup.js). Run it from anywhere; it works in its own temp clone.
set -euo pipefail

manifest="${1:?usage: publish-results.sh <manifest.tsv> <merge-sha> <model-label> [skipped-note]}"
merge_sha="${2:?merge sha}"
model_label="${3:?model label}"
skipped_note="${4:-}"
branch="${PUBLISH_BRANCH:-eval-results}"
repo_dir="${REPO_DIR:?REPO_DIR must point at the main checkout}"
rollup="$repo_dir/evals/rollup.js"

[ -s "$manifest" ] || { echo "nothing publishable; leaving $branch alone"; exit 0; }
manifest="$(cd "$(dirname "$manifest")" && pwd)/$(basename "$manifest")"

work="$(mktemp -d)"
# A fresh `git init` gives the branch no history to share, which is all "orphan"
# means. `git checkout --orphan` reaches the same place but only after
# `git rm -rf .` wipes the working tree we still need rollup.js out of.
git init -q -b "$branch" "$work"
cd "$work"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}.git"
# Same shape actions/checkout uses: keeps the token out of the remote URL, so it
# cannot leak through a git error message that echoes it.
[ -n "${GITHUB_TOKEN:-}" ] && git config http.extraheader \
  "AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"

# README.md is what GitHub renders when someone opens the branch, so the staleness
# caveat lives here and not only in provenance.csv. A reused artifact was produced
# against the PR head; if main moved underneath before the merge, the numbers
# describe a tree that never existed. That is not detectable, so it is disclosed.
# GitHub Pages serves this branch. Without a config the .md files download as raw
# text; with one, Jekyll renders them and jekyll-relative-links - on by default for
# Pages - rewrites the `results/<suite>.md` links to their generated URLs, so the
# same README works both in the GitHub file view and on the site.
render_pages_config() {
  cat > _config.yml <<'YML'
title: dotagents eval results
description: Does loading a skill change the artifact the model produces?
theme: jekyll-theme-primer
YML
}

render_readme() {
  {
    echo "# eval results on \`main\`"
    echo
    echo "Published by \`.github/workflows/eval-publish.yml\` on every push to the default branch."
    echo "\`results/<suite>.csv\` is the store; \`results/<suite>.md\` is rendered from it by \`evals/rollup.js\`."
    echo "Rows accumulate - a new model or a bumped skill version adds rows beside the old ones instead of replacing them."
    echo
    echo "## What each suite last measured"
    echo
    echo "| suite | table | measured against | merged as | source |"
    echo "|---|---|---|---|---|"
    # Last row wins per suite; mawk on the runners has no asorti, hence sort(1).
    awk -F, 'NR>1 && $2 != "" { last[$2] = $0 } END { for (s in last) print last[s] }' provenance.csv \
      | sort -t, -k2,2 \
      | while IFS=, read -r _when suite source src_sha mrg_sha; do
          stale=""
          [ "$src_sha" != "$mrg_sha" ] && stale=' :warning:'
          printf '| `%s` | [%s.md](results/%s.md) | `%s`%s | `%s` | %s |\n' \
            "$suite" "$suite" "$suite" "${src_sha:0:7}" "$stale" "${mrg_sha:0:7}" "$source"
        done
    echo
    echo ":warning: means the numbers were produced against a different commit than the one that merged."
    echo "That is the \`reused\` path: the PR's artifact was built from the PR head, and if \`main\` moved"
    echo "underneath before the merge, these results describe a tree that never existed. Re-run the suite"
    echo "on \`main\` before leaning on such a row."
    echo
    echo "Full history in [provenance.csv](provenance.csv)."
  } > README.md
}

build_and_commit() {
  mkdir -p results
  [ -f provenance.csv ] || echo 'published_at,suite,source,source_sha,merge_sha' > provenance.csv
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local suite json source_sha source_kind
  while IFS=$'\t' read -r suite json source_sha source_kind; do
    [ -n "${suite:-}" ] || continue
    # rollup.js writes results/<suite>.csv and .md next to the json it is handed,
    # so the run has to land in this tree first. The raw json is megabytes and is
    # removed again - the CSV store is the durable record.
    cp "$json" "results/$(basename "$json")"
    node "$rollup" "results/$(basename "$json")" "$model_label"
    rm -f "results/$(basename "$json")"
    printf '%s,%s,%s,%s,%s\n' "$now" "$suite" "$source_kind" "$source_sha" "$merge_sha" >> provenance.csv
  done < "$manifest"

  render_readme
  render_pages_config
  git add -A
  git commit -q -F - <<EOF
eval results for ${merge_sha:0:7}

Suites: $(cut -f1 "$manifest" | paste -sd' ' -)
Source: $(cut -f4 "$manifest" | sort -u | paste -sd'/' -) (results measured against $(cut -f3 "$manifest" | sort -u | cut -c1-7 | paste -sd' ' -))
${skipped_note:+
$skipped_note}
EOF
}

# A concurrent push means someone else's rows landed first. Rebuilding on top of
# the newer store is safe: rollup.js merges by (model,mode,metric), so re-running
# against the fetched CSV keeps both results. Retry, then fail loudly - a lost run
# that nobody is told about is the one failure mode worth spending code on.
for attempt in 1 2 3; do
  if git fetch -q --depth=1 origin "$branch" 2>/dev/null; then
    git checkout -q -B "$branch" FETCH_HEAD
    git reset -q --hard FETCH_HEAD
    git clean -qfd
  else
    echo "branch $branch does not exist yet; creating it"
  fi
  build_and_commit
  if git push -q origin "HEAD:refs/heads/$branch"; then
    echo "pushed $(git rev-parse --short HEAD) to $branch (attempt $attempt)"
    exit 0
  fi
  echo "push rejected - refetching and re-merging (attempt $attempt)" >&2
done

echo "could not push to $branch after 3 attempts; results NOT published" >&2
exit 1
