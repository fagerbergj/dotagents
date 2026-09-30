#!/usr/bin/env bash
# Build the one workspace every row and both arms are given, and the image that
# serves it. Run this once before the suite; nothing here happens per row.
#
#   ./prepare-workspace.sh /path/to/quack /path/to/workspace
#
# The split between image and workspace is not stylistic. The workspace is a
# tmpfs charged against the container's --memory, so bytes there cost RAM; the
# image is on disk and free. Everything that can be read-only lives in the image.
# The exception is GOCACHE: the rootfs is mounted --read-only and a read-only
# GOCACHE fails on the first miss, so it is warmed in the image and copied out
# to the writable workspace here. See the Dockerfile for the measurement.
set -euo pipefail

repo="${1:?usage: prepare-workspace.sh <quack-checkout> <workspace-dir>}"
ws="${2:?usage: prepare-workspace.sh <quack-checkout> <workspace-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The pinned SHAs. Both are recorded in tests/cases.yaml; changing either without
# changing that file makes the case comments describe a tree that is not here.
REPO_SHA="${REPO_SHA:-a19807d}"
BUG_FIX_SHA="${BUG_FIX_SHA:-8e81263}"   # its PARENT holds the un-fixed source
IMAGE="${IMAGE:-quack-eval:$REPO_SHA}"

echo "==> image $IMAGE (network is available here and nowhere else)"
docker build -f "$here/Dockerfile" -t "$IMAGE" "$repo"

echo "==> workspace $ws"
# git archive of the tracked tree with AGENTS.md and its CLAUDE.md symlink
# removed, committed AFTER the removal so the baseline arm cannot recover the
# treatment from the history either.
node -e '
  const { prepareRepo } = require(process.argv[1]);
  const out = prepareRepo(process.argv[2], process.argv[3], process.argv[4]);
  console.log("    removed:", out.removed.join(", ") || "(nothing - is this the right repo?)");
' "$here/../../lib/agents-md-effect.js" "$repo" "$REPO_SHA" "$ws"

# The bug the debug and report cases are about: the test from the fix commit
# stays, its source fix does not. One workspace, so this IS the state - it
# compiles, so the build cases are undisturbed.
git -C "$repo" show "$BUG_FIX_SHA:internal/dag/admission_test.go" > "$ws/internal/dag/admission_test.go"
git -C "$repo" show "$BUG_FIX_SHA^:internal/dag/admission.go"     > "$ws/internal/dag/admission.go"

# Local bare mirrors for the plugin pins, and plugins.yaml pointed at them.
# --network=none forbids `git clone` against GitHub but permits it against a
# local path, so `make plugins` still works and a fresh clone is still a fresh
# clone. Seeding .agents/vendor/dotagents directly instead would make bare
# `go test ./...` succeed and delete the point of the AGENTS.md line under test.
# The rewritten URL is the only infidelity in the whole workspace.
#
# WORKSPACE-RELATIVE, not "$ws". The workspace is streamed into the container at
# /workspace, so a host path baked in here does not exist where it is used, and
# every Go case died on "dotagents: clone failed and no tree on disk" - measured,
# not assumed. scripts/plugins.sh cds to the repo root before cloning, so a
# relative path resolves in both places and neither has to know the mount point.
mkdir -p "$ws/.plugin-mirror"
while IFS=$'\t' read -r name url; do
  [ -n "$name" ] || continue
  git clone --quiet --bare "$url" "$ws/.plugin-mirror/$name.git"
  # -i with a literal URL: the pins are full https URLs, so anchor on the whole
  # value rather than pattern-matching a substring of it.
  sed -i "s|url: $url\$|url: .plugin-mirror/$name.git|" "$ws/.agents/vendor/plugins.yaml"
done < <(awk '/^  - name:/{n=$3} /^    url:/{if(n)print n"\t"$2; n=""}' "$ws/.agents/vendor/plugins.yaml")

# Verified with a real YAML parser, not eyeballed: a sed over a structured file
# that silently matches nothing leaves the pins pointing at GitHub, and the
# failure would then surface as an unexplained `make plugins` failure inside a
# row rather than here. Checks both that every url is local and that the refs
# survived the edit, and that the path each one names is actually there.
python3 -c "
import os, sys, yaml
root = os.path.dirname(os.path.dirname(os.path.dirname(sys.argv[1])))
ps = yaml.safe_load(open(sys.argv[1]))['plugins']
bad = [p for p in ps
       if not p['url'].startswith('.plugin-mirror/')
       or not p.get('ref')
       or not os.path.isdir(os.path.join(root, p['url']))]
if bad or not ps:
    sys.exit('plugins.yaml rewrite did not take: %r' % (bad or 'no plugins parsed'))
print('    pins now local:', ', '.join(p['name'] for p in ps))
" "$ws/.agents/vendor/plugins.yaml"

# The prebuilt binary the L7 probe expects at the workspace root. quack's own
# .gitignore already lists /quack, so the commit below leaves it untracked and a
# case verifying with `git diff` never sees it.
docker run --rm "$IMAGE" cat /opt/quack-bin/quack > "$ws/quack"
chmod +x "$ws/quack"

# Excluded BEFORE the commit below, or `git add -A` would pull a ~1 GB build
# cache into .git and double the workspace. None of these is part of the repo
# under test, and none must show up as the model's own changes.
#
# .config/ is not created here: HOME is /workspace in the container and the go
# tool writes .config/go/env on first use, so `git status` shows `?? .config/`
# from a command the model did not think it was running. The rename control
# tells it to change nothing else, and untracked noise invites a tidy-up.
{ echo '.cache/'; echo '.plugin-mirror/'; echo '.config/'; } >> "$ws/.git/info/exclude"

# One clean commit covering every mutation above, so a case can verify itself
# with `git diff` against a tree that starts empty-handed. Amended rather than
# stacked: prepareRepo's commit is the only one, and a second would just be
# noise in a history no case reads. AGENTS.md is already gone at this point, so
# amending cannot reintroduce it.
git -C "$ws" add -A
git -C "$ws" -c user.email=eval@local -c user.name=eval commit -q --amend --no-edit
test -z "$(git -C "$ws" status --porcelain)" || { echo "workspace is not clean after prep" >&2; exit 1; }

# The warm build cache, out of the image rather than rebuilt here: it must match
# the image's Go toolchain exactly or every entry misses and the warmth is a lie.
# HOME=/workspace in the container, so this is where GOCACHE resolves with no env
# var of our own. Extracted AFTER the commit, so it can never be added by it.
echo "==> warm GOCACHE from the image"
mkdir -p "$ws/.cache/go-build"
docker run --rm "$IMAGE" tar -c -C /opt/gocache-seed . | tar -x -C "$ws/.cache/go-build"

du -sh "$ws" "$ws/.cache/go-build"
echo "workspace ready: $ws"
# All three vars are required. run.sh looks for suites under evals/skills/ and
# for a subject at ../skills/{suite}/SKILL.md; this suite lives under repo/ and
# its subject is a repository AGENTS.md, so both defaults are wrong and the run
# dies at "subject not found" before it reaches the workspace.
echo "run with:"
echo "  EVAL_SUITES_DIR=repo \\"
echo "  EVAL_SUBJECT=$repo/AGENTS.md \\"
echo "  EVAL_WORKSPACE_DIR=$ws \\"
echo "  ./run.sh agents-md --max-concurrency 1"
