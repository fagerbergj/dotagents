# Skill evals

Each directory under `skills/` measures one skill in `../skills/` using [promptfoo](https://www.promptfoo.dev) against a self-hosted llm-swap gateway.

The question every suite answers is narrow: **does loading this skill change the artifact the model produces?** Not whether the skill reads well or the model followed its steps—the artifact.

## Design

Rules and harness gotchas are in [AGENTS.md](AGENTS.md)—that is the file agents load when working here. In short: graders trace the skill's frontmatter `description`, cases never decide what the skill decides, deterministic checks run before judges, and arms are compared side by side.

## Running a suite

Set `OPENROUTER_API_KEY` (or put it in `evals/.env`):

```sh
./run.sh <suite>                    # self-test, full eval, per-metric report
./run.sh <suite> --filter-pattern 'quote|theme'   # or a subset first
```

`run.sh` reads the skill's `metadata.version` from frontmatter and writes results to `results/<suite>@<version>.json`. Free checks while authoring:

```sh
cd skills/<suite>
node assertions/*.test.cjs
npx promptfoo@latest validate config -c promptfooconfig.yaml
```

A full run is cases x 2 arms with a judge call and validators. Budget ~30 seconds per generation at concurrency 1. Filter to a handful of cases first.

## Reading results

`report.js <results.json>` prints one row per metric, one column per arm, and `skill-current` minus `no-skill` delta:

```text
metric            no-skill        skill-current   delta
--------------------------------------------------------
mermaid_renders   1.00            1.00            +0.00
semantic_quality  0.80            0.90            +0.10

latency (s avg)   6.2             13.2
tokens (avg)      300             5620
```

It also lists failed non-`select-best` assertions with the grader's reason—where diagnosis usually is.

It refuses (exit 1, no table) a result set that is not a measurement: no rows, only one arm, or arms whose row counts differ by more than 5%. Smaller imbalances and a run with no token usage still print, under a `CAUTION` banner. `eval-publish.yml` drops any suite whose report emits `CAUTION`, so a caveated run is reported to a human but never published as a baseline.

Read per-metric deltas, never aggregate pass rate. `select-best` marks every non-winning arm as failed by design, mixing it with unrelated metrics. Latency and token rows are the price of carrying the skill in context and usually the largest, most reliable difference.

## Suites

| Suite | What it tests | Grounded in |
| --- | --- | --- |
| `adr-authoring` | Standing a reader can tell without guessing, costs alongside benefits, one decision per record, and refusing to record what was never settled. | [ecADR and START](https://adr.github.io/ad-practices/#good-adrs--and-how-to-get-to-them), [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), [Fowler](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html), [AWS ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html) |
| `comment-authoring` | Code byte-identical, specific facts from the ask reaching the comments, doc comments attached where the tooling needs them, and self-evident code left alone. | [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html#Comments), [PEP 257](https://peps.python.org/pep-0257/), [go.dev/doc/comment](https://go.dev/doc/comment), [Pascarella and Bacchelli, MSR 2017](https://doi.org/10.1109/MSR.2017.63), [Wen et al., ICPC 2019](https://doi.org/10.1109/ICPC.2019.00019) |
| `commit-authoring` | Grammar conformance decided by the reference parser, a body carrying motivation the diff lacks, breaking changes marked, and a mixed diff recognised as two commits. | [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), [git-commit(1)](https://git-scm.com/docs/git-commit#_discussion) |
| `format-markdown` | Links, code and prose preserved through a real parse, heading hierarchy holding, a document returned rather than advice, and a clean document left alone. | [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/), [markdownlint MD001](https://github.com/DavidAnson/markdownlint/blob/main/doc/md001.md) |
| `issue-authoring` | A bounded behaviour change, completion conditions someone can settle by observation, slices that ship independently, and nothing invented. | [Dojo Consortium work decomposition](https://dojoconsortium.org/docs/work-decomposition/), [INVEST (Wake)](https://xp123.com/invest-in-good-stories-and-smart-tasks/), [Linear method](https://linear.app/method/write-issues-not-user-stories), [nat.io](https://nat.io/blog/what-a-good-engineering-ticket-looks-like) |
| `mermaid-authoring` | Renders under two validators, type defensible without hints, matches the facts asked for, rendered image legible, old renderers get a conservative choice. | Per diagram type: [UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/), [ISO 5807](https://www.iso.org/standard/11955.html), [C4](https://c4model.com/diagrams/system-context), [NN/g journey mapping](https://www.nngroup.com/articles/journey-mapping-101/), [Snowden and Boone, HBR 2007](https://hbr.org/2007/11/a-leaders-framework-for-decision-making), [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/), [SysML 1.6](https://www.omg.org/spec/SysML/1.6/), [Chen 1976](https://doi.org/10.1145/320434.320440), [Shneiderman 1992](https://doi.org/10.1145/102377.115768) |
| `pr-authoring` | What changed and why, a first line that stands alone, scaled to the real diff, and no identifier absent from the diff. | [Google eng-practices, CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html), [Linux kernel submitting-patches](https://docs.kernel.org/process/submitting-patches.html) |
| `rest-api-authoring` | Valid OpenAPI, methods and codes agreeing with HTTP semantics, auth declared *and* applied, and contracts evolving without breaking callers. | [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594.html), [RFC 9745](https://www.rfc-editor.org/rfc/rfc9745.html), [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [oasdiff](https://www.oasdiff.com/docs/breaking-changes), [AIP-122](https://google.aip.dev/122) |
| `rfc-authoring` | A concrete proposal rather than a restated problem, a named decider and deadline, an honest case against, and declining what is too small. | [Rust RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md), [Squarespace RFC template](https://engineering.squarespace.com/s/Squarespace-RFC-Template.pdf), [Go proposal process](https://go.googlesource.com/proposal/+/refs/heads/master/README.md), [Mozilla RFC template](https://github.com/mozilla-firefox/firefox/blob/main/mobile/android/docs/rfcs/0000-template.md) |
| `rfd-authoring` | Whether the document's declared openness matches its actual commitment, questions specific enough to answer, and catching a draft that claims to explore while having chosen. | [Oxide RFD 1](https://oxide.computer/blog/rfd-1-requests-for-discussion), [Joyent/MNX RFD process](https://github.com/TritonDataCenter/rfd), [RFC 3](https://www.rfc-editor.org/rfc/rfc3.html) |

Two criteria are house positions with no external ground, and their rubrics say so in their own text: `pr-authoring`'s requirement that a description state how the change was verified, and its scaling of length to diff size. Google's guidance never mentions testing, the kernel's `Tested-by:` records someone else's, and both push back on scaling length down.

`mermaid-authoring` is the reference implementation and the one to copy when adding another.

## Adding a suite

Copy `skills/mermaid-authoring/`. Replace `prompts/arms.js` with a one-line delegation to `lib/arms.js` naming your skill and task template, write `tests/cases.yaml` and `assertions/<name>.cjs` plus offline `<name>.test.cjs`. Keep the `transform` in `defaultTest.options`: the gateway returns reasoning as message content; without stripping it every rubric grades the leak instead of the answer.

If the skill ships `references/` or `assets/` its SKILL.md tells the reader to open, point the suite at `lib/skill-tools.js` instead of `openai:chat:*` and have the skill arm's prompt function return `{prompt, config: {skillDir: arms.skillDir}}`. The provider then serves those files through a scoped `load_resource` tool - only to the arm that names a directory, so the baseline is untouched. Inlining SKILL.md alone makes "read `references/<x>`" unfollowable and the skill arm answers from memory; on `mermaid-authoring` that cost it 0.16 of the render rate. See that suite's README.
