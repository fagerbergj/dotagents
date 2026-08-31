# dotagents

My portable agent home, two things in one repo: my personal writing ruleset (`AGENTS.user.md`) and a collection of skills with their eval suites and MCP servers I find generally useful (`skills/`, `mcp.json`). Root `AGENTS.md` is this repo's own agent instructions, not the ruleset.

Distribution is clone-first: this repo lives at `~/.agents`, and harnesses that look there (opencode, pi) pull skills automatically. For harnesses that don't, the repo doubles as an [agent plugin](https://github.com/agentplugins/agent-plugins-spec) and as harness-specific plugins (Claude Code, pi) bundling the same skills and MCPs - see [Install as a plugin](#install-as-a-plugin). The harness manifests are not hand-maintained: `plugin.json` (Agent Plugins 1.1.0) is the source of truth, per-harness overrides live in its `extensions` field, and `node apc.mjs` compiles the native manifests in place (`.claude-plugin/`, `.mcp.json`, `package.json`); CI fails on drift via `node apc.mjs --check`. `bootstrap.sh` and everything it calls is machine setup only - symlinks, plugin installs, pi packages, harness config under dotted dirs like `.pi/`.

## Use as ~/.agents

```sh
git clone https://github.com/fagerbergj/dotagents ~/.agents
~/.agents/bootstrap.sh
```

`bootstrap.sh` runs `setup-symlinks.sh`, `install-as-plugin.sh claude`, `install-plugins.sh`, `install-pi-packages.sh`, then `llm-swap/install.mjs`; each works standalone.

`setup-symlinks.sh` puts `AGENTS.user.md` in each harness's expected location:

| Harness | Instructions |
| --- | --- |
| Claude Code | `~/.claude/CLAUDE.md` |
| opencode | none - falls back to `~/.claude/CLAUDE.md` natively |
| pi | `~/.pi/agent/AGENTS.md` (pi reads `~/.agents/mcp.json` natively, but NOT `~/.agents/AGENTS.user.md`) |
| codex | `~/.codex/AGENTS.md` |

Existing real files are backed up to `<path>.bak` before linking; existing symlinks are replaced. The only other link is `.pi/lsp.json` -> `~/.pi/agent/lsp.json`: pi-lsp reads no other global location and a pi package can't ship it. Everything else that used to be symlinked now arrives as a plugin - skills via the generated manifests, the personal llm-swap provider via the local `llm-swap/` package that `install-pi-packages.sh` installs.

`install-as-plugin.sh` installs dotagents itself as a plugin (see [Install as a plugin](#install-as-a-plugin) - this is how the skills and MCPs reach Claude Code); `install-plugins.sh` installs the third-party plugins listed in `plugins.json`, currently just ponytail.

`install-pi-packages.sh` merges the package list in `pi-packages.json` into `~/.pi/agent/settings.json`'s `packages` array - a union, so packages added outside this repo and other settings keys (`theme`, `defaultModel`, ...) are left alone.

## Install as a plugin

The symlink flow above is still the intended way to use this as `~/.agents`. These are the alternate, per-harness install paths for pulling just the skills into a project or another machine without cloning to `~/.agents`.

Claude Code and pi get a real plugin install below. opencode doesn't - it auto-discovers the skills instead, so there's nothing to install. None of the three can ship `AGENTS.user.md` from inside an installed package: pi and opencode both read instructions from the project/global filesystem, never from package contents, and the Agent Plugins spec has no instructions field at all. The `~/.claude/CLAUDE.md` and `~/.pi/agent/AGENTS.md` symlinks from `setup-symlinks.sh` are the only way `AGENTS.user.md` reaches any of them (opencode rides the `~/.claude/CLAUDE.md` fallback) - not a legacy leftover, the actual mechanism.

### Agent Plugins standard

Root `plugin.json` follows the [Agent Plugins](https://agent-plugins.org) spec (1.1.0). The spec has no manifest field for skills - it declares identity, not contents - so any compliant host discovers `skills/` at the repo root by convention. Harness-specific data (Claude Code description/keywords/marketplace entry, pi package description) rides in the spec's `extensions` field under reverse-domain namespaces, and `apc.mjs` compiles it into each harness's native manifest. The spec has no field for an always-on instructions file, so `AGENTS.user.md` isn't part of this path; use the symlink flow above for that.

### Claude Code

```
/plugin marketplace add fagerbergj/dotagents
/plugin install dotagents-documentation@dotagents   # or dotagents-coding, dotagents-contributing
```

The marketplace splits the skills into three plugins - `dotagents-documentation`, `dotagents-coding`, `dotagents-contributing` - all rooted at this repo with an explicit skills subset each; the grouping lives in `plugin.json`'s claude-code extension and apc regenerates the marketplace from it. A Claude Code plugin has no place to ship a project-wide instructions file either - `CLAUDE.md` at a plugin root isn't loaded as context - so `AGENTS.user.md` still needs the `~/.claude/CLAUDE.md` symlink above if you want the writing ruleset applied globally.

### opencode

There's no install step. opencode's `plugin` field in `opencode.json` loads npm packages that provide JS tools/hooks - it's not a mechanism for shipping skills or instructions, and dotagents has no JS code to give it. Instead, opencode auto-discovers skills by searching `.agents/skills` upward from the project (global and project scope), so with dotagents cloned to `~/.agents` it finds every skill with zero configuration - that's already true today, plugin packaging or not.

### pi

```
pi install git:github.com/fagerbergj/dotagents
```

`package.json`'s `pi.skills` field declares `skills/` for pi's package installer - no extension code needed, just the manifest.

## Layout

Plugin surface (what consumers fetch):

- `skills/<name>/SKILL.md` - one skill per directory, with optional `references/`, `assets/`, and its eval suite in `evals/` (framework in the top-level `evals/`).
- `plugin.json` - [Agent Plugins](https://agent-plugins.org) 1.1.0 manifest, the source of truth; per-harness overrides live in `extensions`. Skills are discovered by convention, not declared here.
- `mcp.json` - MCP servers, spec format. pi reads it natively from `~/.agents`. opencode reads neither file: its MCPs live in `opencode.json` only.
- `apc.mjs` - compiles the files below from `plugin.json` + `skills/` + `mcp.json`. Edit the sources, run `node apc.mjs`; `node apc.mjs --check` runs in CI (`.github/workflows/apc.yml`).
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json` - generated Claude Code plugin manifest, marketplace, and MCP config (spec `streamable-http` translated to Claude's `http`).
- `package.json` - generated pi package manifest; declares `skills/` for pi's installer.

This machine's setup:

- `AGENTS.user.md` - writing ruleset, applied to prose the agent writes for me. `AGENTS.md` is this repo's own agent instructions.
- `bootstrap.sh` - entry point; runs the scripts below in order.
- `setup-symlinks.sh` - symlinks `AGENTS.user.md` (e.g. to `~/.claude/CLAUDE.md`) and dotted-dir harness config (`.pi/`) into place.
- `install-as-plugin.sh` - ask-gated: installs dotagents itself as a plugin. Bootstrap runs it for Claude Code only (the one harness that does not read `~/.agents`); run it with no argument to be offered the other harnesses.
- `install-plugins.sh` + `plugins.json` - ask-gated: installs the third-party plugins I like (e.g. ponytail).
- `install-pi-packages.sh` + `pi-packages.json` - merges my pi package list into `~/.pi/agent/settings.json`.
- `.pi/` - personal pi config that isn't a skill (`lsp.json`), symlinked into place by `setup-symlinks.sh`.
- `llm-swap/` - my llm-swap provider as its own local multi-harness package, not part of the dotagents plugin surface. `models.json` is the shared catalog. Two real plugins read it with live model discovery: `llm-swap.ts` for pi (`install-pi-packages.sh` installs it by path) and `opencode.mjs` for opencode (a `config`-hook plugin; `install.mjs` registers its path in `~/.config/opencode/opencode.json`'s `plugin` array). codex has no plugin/provider API, so `install.mjs` falls back to config: a marker-delimited `[model_providers.llm-swap]` block in `~/.codex/config.toml` (user-level only - codex ignores `model_providers` in project-scoped config). No Claude Code target: it has no custom-provider mechanism. `node llm-swap/install.mjs --check` self-tests the merges.

[ponytail](https://github.com/DietrichGebert/ponytail) is deliberately NOT vendored here - install it as a Claude Code plugin (`install-plugins.sh` does this) so it updates through the plugin system. Projects that need its skills on disk for other harnesses (e.g. quack's opencode agents) vendor it themselves.
