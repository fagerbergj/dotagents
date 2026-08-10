# dotagents

My portable agent home, two things in one repo: my personal writing ruleset (`AGENTS.md`) and a collection of skills and MCP servers I find generally useful (`skills/`, `mcp.json`).

Distribution is clone-first: this repo lives at `~/.agents`, and harnesses that look there (opencode, pi) pull skills automatically. For harnesses that don't, the repo doubles as an [agent plugin](https://github.com/agentplugins/agent-plugins-spec) and as harness-specific plugins (Claude Code, pi, opencode) bundling the same skills and MCPs - see [Install as a plugin](#install-as-a-plugin). `bootstrap.sh` and everything it calls is machine setup only - symlinks, plugin installs, pi packages, harness config under dotted dirs like `.pi/`.

## Use as ~/.agents

```sh
git clone https://github.com/fagerbergj/dotagents ~/.agents
~/.agents/bootstrap.sh
```

`bootstrap.sh` runs `setup-symlinks.sh`, `install-plugins.sh`, then `install-pi-packages.sh`; all three work standalone.

`setup-symlinks.sh` puts `AGENTS.md` in each harness's expected location:

| Harness | Instructions |
| --- | --- |
| Claude Code | `~/.claude/CLAUDE.md` |
| opencode | `~/.config/opencode/AGENTS.md` |
| pi | `~/.pi/agent/AGENTS.md` |
| codex | `~/.codex/AGENTS.md` |

Existing real files are backed up to `<path>.bak` before linking; existing symlinks are replaced. It also symlinks personal machine config, e.g. from `.pi/` (e.g. the pi `llm-swap` provider extension) to where each harness expects it.

`install-plugins.sh` installs dotagents itself as a plugin (see [Install as a plugin](#install-as-a-plugin) - this is how the skills reach Claude Code and pi now), then the third-party plugins listed in `plugins.json`, currently just ponytail.

`install-pi-packages.sh` merges the package list in `pi-packages.json` into `~/.pi/agent/settings.json`'s `packages` array - a union, so packages added outside this repo and other settings keys (`theme`, `defaultModel`, ...) are left alone.

## Install as a plugin

The symlink flow above is still the intended way to use this as `~/.agents`. These are the alternate, per-harness install paths for pulling just the skills into a project or another machine without cloning to `~/.agents`.

Claude Code and pi get a real plugin install below. opencode doesn't - it auto-discovers the skills instead, so there's nothing to install. None of the three can ship `AGENTS.md` from inside an installed package: pi and opencode both read instructions from the project/global filesystem, never from package contents, and the Agent Plugins spec has no instructions field at all. The `~/.claude/CLAUDE.md` / `~/.pi/agent/AGENTS.md` / `~/.config/opencode/AGENTS.md` symlinks from `setup-symlinks.sh` are the only way `AGENTS.md` reaches any of them - not a legacy leftover, the actual mechanism.

### Agent Plugins standard

Root `plugin.json` follows the [Agent Plugins](https://agent-plugins.org) spec. The spec has no manifest field for skills - it declares identity, not contents - so any compliant host discovers `skills/` at the repo root by convention, the same way this repo already lays it out. The spec also has no field for an always-on instructions file, so `AGENTS.md` isn't part of this path; use the symlink flow above for that.

### Claude Code

```
/plugin marketplace add fagerbergj/dotagents
/plugin install dotagents@dotagents
```

`skills/` is auto-discovered by the plugin loader; nothing else to declare. A Claude Code plugin has no place to ship a project-wide instructions file either - `CLAUDE.md` at a plugin root isn't loaded as context - so `AGENTS.md` still needs the `~/.claude/CLAUDE.md` symlink above if you want the writing ruleset applied globally.

### opencode

There's no install step. opencode's `plugin` field in `opencode.json` loads npm packages that provide JS tools/hooks - it's not a mechanism for shipping skills or instructions, and dotagents has no JS code to give it. Instead, opencode auto-discovers skills by searching `.agents/skills` upward from the project (global and project scope), so with dotagents cloned to `~/.agents` it finds all ten skills with zero configuration - that's already true today, plugin packaging or not.

### pi

```
pi install git:github.com/fagerbergj/dotagents
```

`package.json`'s `pi.skills` field declares `skills/` for pi's package installer - no extension code needed, just the manifest.

## Layout

Plugin surface (what consumers fetch):

- `skills/<name>/SKILL.md` - one skill per directory, with optional `references/` and `assets/`.
- `plugin.json` - [Agent Plugins](https://agent-plugins.org) manifest; skills are discovered by convention, not declared here.
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` - Claude Code plugin manifest and self-hosted marketplace.
- `package.json` - pi package manifest; declares `skills/` for pi's installer.

This machine's setup:

- `AGENTS.md` - writing ruleset, applied to prose the agent writes for me.
- `bootstrap.sh` - entry point; runs the three scripts below in order.
- `setup-symlinks.sh` - symlinks `AGENTS.md` and personal machine config (`.pi/`) into each harness's expected location.
- `install-plugins.sh` + `plugins.json` - installs dotagents itself and third-party harness plugins.
- `install-pi-packages.sh` + `pi-packages.json` - merges my pi package list into `~/.pi/agent/settings.json`.
- `.pi/` - personal pi config that isn't a skill (`extensions/llm-swap.ts`, my custom-provider extension), symlinked into place by `setup-symlinks.sh`.

[ponytail](https://github.com/DietrichGebert/ponytail) is deliberately NOT vendored here - install it as a Claude Code plugin (`install-plugins.sh` does this) so it updates through the plugin system. Projects that need its skills on disk for other harnesses (e.g. quack's opencode agents) vendor it themselves.
