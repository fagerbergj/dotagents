# dotagents

Instructions for agents working in this repository.

- `plugin.json`, `mcp.json`, and `skills/` are the source of truth. `.claude-plugin/`, `.mcp.json`, and `package.json` are generated: edit the sources, then run `node apc.mjs`. CI fails on drift (`node apc.mjs --check`).
- `AGENTS.user.md` is my personal writing ruleset, symlinked into each harness's global-instructions location by `setup-symlinks.sh`. It is user-level config, not this repo's instructions - don't add repo guidance there.
- A skill lives at `skills/<name>/SKILL.md`; its eval suite lives at `skills/<name>/evals/`. The eval framework is in `evals/` - read `evals/AGENTS.md` before writing or changing a suite.
- Root shell scripts are machine setup only (`bootstrap.sh` is the entry point); they are not part of the plugin surface consumers fetch.
- `llm-swap/` is a personal multi-harness provider package, separate from the dotagents plugin surface.
