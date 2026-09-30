# Image for the quack AGENTS.md-effect suite. Build context is a checkout of
# quack at the SHA tests/cases.yaml pins.
#
# WHY AN IMAGE AT ALL: rows run with --network=none, so nothing can be fetched at
# run time, and the workspace is a tmpfs charged against --memory, so every byte
# put there costs container RAM. An image layer is on disk and free at runtime.
# Everything that can live here does.
#
# WHAT CANNOT LIVE HERE: the Go build cache. The sandbox mounts the rootfs
# --read-only, and a read-only GOCACHE fails on the first miss - measured, not
# assumed:
#     open /opt/gocache/c8/c892...-d: permission denied
# Every row misses (the debug case edits a source file; `make test` compiles test
# binaries), so GOCACHE has to sit on the writable tmpfs. It is warmed HERE and
# exported to the workspace by prepare-workspace.sh, which keeps one source of
# truth and guarantees it matches this image's Go toolchain.
#
# GOMODCACHE, the bigger of the two at ~1.5 GB, IS read-only-safe - verified by
# building against it with `chmod -R a-w` applied - so it stays in the image and
# costs no container memory at all.
#
# PROVENANCE: a suite that names an image is trusted and nothing checks what the
# image holds, so this file is committed beside the cases and the tag carries the
# quack SHA it was built from. A stale image silently measures a stale dependency
# set against a current AGENTS.md.
#
#   docker build -f Dockerfile -t quack-eval:a19807d /path/to/quack
#
# prepare-workspace.sh runs exactly that line, so rebuilding is rerunning it.
# Cold it takes ~13 min and the image is 3.6 GB on disk; with the base image and
# the module download already cached, ~5 min.
#
# WHAT GOES STALE, and what to do:
#   * the quack SHA - retag. The tag, the `image:` in promptfooconfig.yaml and
#     REPO_SHA in prepare-workspace.sh must move together, and tests/cases.yaml
#     describes the tree at that SHA.
#   * go.mod - GOMODCACHE is baked, so a dependency bump needs a rebuild or the
#     row builds against the old one. There is no network at run time to notice.
#   * go.mod's `go` directive - the golang: tag two lines below is pinned and
#     GOTOOLCHAIN=local, so a toolchain bump fails the build loudly. Bump both.
#   * .agents/vendor/plugins.yaml pins - the mirrors are cloned fresh by
#     prepare-workspace.sh every time, so those follow the workspace, not this.
#
# The build context is the WORKING TREE, not `git archive` of the tag: whatever
# is untracked in the checkout rides along. Only the caches survive `rm -rf /src`
# below, so this is harmless, but it does mean the tag is a label rather than a
# guarantee. Build from a clean checkout at the pinned SHA if that matters.
FROM debian:bookworm-slim

# The Go toolchain, copied rather than apt-installed: Debian's Go trails quack's
# go.mod (go 1.26.5) and GOTOOLCHAIN would try to download the right one, which
# --network=none forbids at run time. GOTOOLCHAIN=local makes that failure loud
# at build time instead of mysterious inside a row.
COPY --from=golang:1.26.5-bookworm /usr/local/go /usr/local/go
ENV PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin \
    GOTOOLCHAIN=local \
    GOMODCACHE=/opt/gomodcache \
    GOFLAGS=-mod=mod

# make and git are the suite's own subject matter - the cases run `make test` and
# `make plugins`, and prepareRepo hands over a git repo the verify commands diff
# against. coreutils brings timeout(1), which lib/sandbox.js probes for at start
# and refuses the image without.
RUN apt-get update \
 && apt-get install -y --no-install-recommends make git ca-certificates coreutils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . /src

# Network is available HERE and only here. `make plugins` fetches the vendored
# skill trees from GitHub so the root package's go:embed resolves and the caches
# below can be warmed at all; nothing in quack compiles without them.
RUN make plugins && go mod download

# The build cache, warmed against the real workload rather than one package:
# `go test` compiles test binaries that `go build` never touches, and `make test`
# is what the cases actually run.
#
# `-run '^$'` COMPILES AND LINKS every test binary and runs no test. That is the
# whole of what the cache needs, and it is deliberately not a full `go test`:
# gating the image on quack's test RESULTS made the build fail, measured, in
# `internal/vetting`. deriveChecks() calls toolchainPresent() -> LookPath("npm"),
# so five of its tests assert `npm run build` is derived and get [] wherever npm
# is absent - they pass on a dev box and fail in any clean container. Installing
# node to satisfy them is worse, also measured: the mermaid tests then stop
# skipping on "node not on PATH" and reach EnsureMermaidValidatorDeps, whose
# `npm ci` under --network=none did not return inside 600s. The image therefore
# stays node-free and `make test` inside a row fails those five vetting tests on
# top of the planted internal/dag one. See tests/cases.yaml.
RUN GOCACHE=/opt/gocache-seed go build ./... \
 && GOCACHE=/opt/gocache-seed go test -count=1 -run '^$' ./...

# The `quack` binary, for the L7 probe: `quack sandbox check` has to be runnable
# without the row spending minutes on a build first. `go build ./cmd/quack`
# rather than `make build` - the frontend embed is satisfied by the tracked
# internal/serve/web/dist/.gitkeep placeholder, and building the SPA would need
# a registry. The probe measures whether the model RUNS the command; the check
# then reports bwrap missing, which is a true answer about this container.
#
# GOCACHE is named and thrown away rather than left to default: unset, it lands
# in /root/.cache/go-build and put 759 MB of dead build cache in the image
# (measured). Pointing it at /opt/gocache-seed instead would be free here but
# would grow the seed by this link's output - and the seed is copied to the
# workspace tmpfs, where bytes are charged to --memory.
RUN mkdir -p /opt/quack-bin \
 && GOCACHE=/tmp/qb-cache go build -o /opt/quack-bin/quack ./cmd/quack \
 && rm -rf /tmp/qb-cache

# The source copy goes. It is build scaffolding, and leaving it would put a
# readable AGENTS.md inside the image - which is the treatment, and would hand it
# to the baseline arm through a channel nothing in the suite checks.
RUN rm -rf /src

# uid 1000 is what lib/sandbox.js runs as, and the rootfs is read-only, so
# everything it must read has to be world-readable already.
RUN chmod -R a+rX /opt/gomodcache /opt/gocache-seed /opt/quack-bin

# HOME=/workspace is set by the sandbox, so GOCACHE resolves to
# /workspace/.cache/go-build with no env var of our own - which is exactly where
# prepare-workspace.sh puts the warm copy.
WORKDIR /workspace
