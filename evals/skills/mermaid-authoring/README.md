# mermaid-authoring eval

Measures whether loading `skills/mermaid-authoring` changes the diagram the model produces. See `../../README.md` for design shared by every suite.

## Cases

31 cases: one per diagram type in the skill's `references/`, plus two version-tolerance cases.

The two extra cases grade the claim that diagrams "actually render on the target platform". Each names an older renderer—a lagging GitLab wiki, an IDE preview stuck on mermaid 10—in scenarios where a recent type is obvious on current renderers but wrong here. Their `allowed` lists hold only what the stated version can draw, so types current renderers make attractive fail.

Where a case's `allowed` list is narrow enough that SKILL.md step 1 ("if two fit, prefer the older one") would push a competent author off it, the task names its render target instead of the suite widening the list. A case that names no target is fair game for any type its `allowed` list holds.

**No case names a diagram type.** Each describes something to be drawn; picking the form is graded: "protocol header layout" never says "packet", "order lifecycle" never says "state". Each case lists every type a competent author could defend, so several answers can be right where the scenario admits several.

## Grading

1. **Parses and renders**—two gates, neither subsumes the other. `@mermaid-lint/cli@0.53.1` is the syntax oracle: it parses as markdown and rejects bare `"` inside bracket labels with line/column. `SKILL.md` documents this as breaking GitHub "even when validators pass"; mermaid-cli renders it clean. `@mermaid-js/mermaid-cli@11.16.0` is the render gate: it proves mermaid actually draws, and produces the PNG check 4 needs. mermaid-cli exits 0 and draws error graphics for invalid diagrams, so SVG is inspected for error role. Unknown diagram types are inconclusive, not invalid; render gate still applies.
2. **Right diagram**—the declared type is in the case's `allowed` list.
3. **Says what was asked**—rubric judge scores accuracy against stated facts, readability for newcomers, and one per-case criterion. Each per-case criterion cites an external source for the form—UML, ISO 5807, Chen, BPMN, Tufte, C4—rather than SKILL.md, so a skill arm cannot win by reciting its own prescriptions.

Renders cache by content hash, so checks 1 and 4 share one mermaid-cli call per unique diagram.

## Resource loading

The skill arm gets a `load_resource(path)` tool over `skills/mermaid-authoring/` itself, served by `lib/skill-tools.js`. Without it, `SKILL.md` step 3 - "read `references/<diagramId>/README.md` for the type you picked, before writing" - was an instruction the model could not follow, so it wrote specialised syntax from memory and `mermaid_renders` came out *below* the baseline: six skill-arm diagrams failed to parse and every one was a long-tail type (`requirementDiagram`, `block`, `packet`, `venn-beta`, `cynefin-beta`, `railroad-ebnf-beta`) that the baseline had dodged by answering with a flowchart. That negative was a harness artifact.

- **Only the skill arm has the tool.** `prompts/arms.js` returns `{prompt, config: {skillDir}}` for the skill arm and a bare message list for the baseline; the provider offers the tool only when a `skillDir` arrives. The baseline has no skill and no resources, so the arms still differ by the skill and nothing else.
- **Scoped.** Paths resolve under the skill root and are checked against the real path of the deepest existing ancestor, so absolute paths, `..`, and symlinks out are refused - as a tool result the model can read, not a crash.
- **A wrong guess is not a dead end.** A missing path returns the entries at the nearest directory that does exist. This matters: the natural guess for the railroad case is `references/railroad-ebnf-beta/`, and the directory is `references/railroad/`.
- **Bounded.** 8 tool rounds and 64 KB of resources per row, both configurable. The byte budget refuses the next file with a message saying so; nothing is ever truncated. Exceeding the round cap throws, so a runaway loop is an error row, not an empty answer graded as a bad diagram - as is any HTTP or parse failure in the loop.
- **Caching.** Each round-trip is cached on its whole request body. The tool results live in `messages`, so editing a reference file changes the second call's key by itself; the first call carries no file content and is safe to reuse. `--no-cache` is honoured.
- **Token accounting** sums prompt/completion/total over every round-trip, so `tokens (avg)` and cost stay true.

Measured, one run each at concurrency 4, same cases and graders: `mermaid_renders` went **no-skill 0.97 / skill 0.81 (delta -0.16)** to **no-skill 0.93 / skill 0.97 (delta +0.04)**. Five of the six diagrams that had failed to parse now render, each after loading its own `references/` entry; the sixth row lost its verdict to a Chromium crash. `diagram_choice` also moved +0.08 to +0.21 and `semantic_quality` +0.08 to +0.11. It is not free: 27 of 31 skill rows loaded something, 50 files in all, and the skill arm's average row went 5,369 tokens to 15,713. Nothing came near the 8-round or 64 KB caps - the deepest row took 3 rounds.

Eight of the ten suites now use this provider. `commit-authoring` and `format-markdown` stay on `openai:chat:*`: neither skill ships `references/` or `assets/`, so there is nothing for the tool to serve.

## Running

```sh
export OPENROUTER_API_KEY=...
node assertions/mermaid.test.cjs                                    # free
npx promptfoo@latest validate config -c promptfooconfig.yaml        # free
npx promptfoo@latest eval -c promptfooconfig.yaml \
  -o /tmp/mermaid-eval.json --no-cache --no-share --max-concurrency 1
```

A full run is 31 cases x 2 arms, each with a render, a lint and a rubric call. That is long at concurrency 1; filter to a handful of cases first.


## What this suite does not measure

Whether the skill triggers. Both arms are handed their prompt; nothing measures retrieval or activation.

Reference *lookup* is now exercised (see Resource loading) but not separately scored: no metric reads `resourcesLoaded`. A model that loads the right README and still writes bad syntax and one that never loads anything score the same way - through the diagram.

`avoidsBetaTypes`, `hasLabeledBranches`, `hasMermaidFence`, `minimumParticipants`, `noLiteralBackslashN`, `noUnsafeBareQuotes`, and `themeSafeClassDefs` are deleted, not left unused. They graded the skill's prescribed technique rather than the diagram—the overfitting this suite avoids—and `mermaid_renders` plus `@mermaid-lint/cli` subsume what they caught.
