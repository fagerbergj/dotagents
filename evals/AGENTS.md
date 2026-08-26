# Eval suites

Each directory under `skills/` measures one skill in `../../skills/`. The question a suite answers is narrow: does loading this skill change the artifact the model produces?

## Design rules

- Grade what the skill's frontmatter `description` claims. Never grade the SKILL.md body; a grader keyed to its prescribed headings makes the skill arm win for reciting itself.
- Never let the case do the skill's job. Anything the skill decides, the case leaves undecided.
- Write cases as a person typing: partial, casual, out of order. Where the input is structured—a diff, a source file, a contract—use the real thing and make only the ask conversational.
- **Never assert on format.** A deterministic check is legitimate only for conformance to external standards (Conventional Commits, OpenAPI, JSON Schema, agent-skill spec), when a real validator accepts or rejects the artifact, or when it computes against input (content preserved, identifiers in output present in source). Required headings, label words, whitespace, and keyword presence are all format policing; the subject is output quality.
- **Never pattern-match prose.** A regex or wordlist over natural language is format policing wearing a deterministic costume: saying the word passes, padding never fails, and the words get drawn from the skill under test, so the delta is tautological. `criteria_present` accepted the heading vocabulary from issue-authoring's own Default Shape; `SETTLED` accepted `accepted`, which the adr SKILL.md says four times. Both scored a delta for recitation. Patterns are legitimate against machine-readable syntax (JSON, YAML, a diff, a Conventional Commits subject) and against the input (identifiers in output present in source). Against prose, use a rubric.
- Reserve `javascript` graders for what genuinely computes: validators, diffs, cross-references, other models.
- Syntax checks are table stakes. If most graders check structural presence, the suite is measuring the wrong thing.
- Include negative controls wherever the description implies a boundary—cases where the right answer is to push back or write almost nothing.
- **Earn the case before adding it.** A suite is worth more small and proven than large and plausible. A case earns its place by having run and separated the arms, or by having failed a real answer that deserved to fail. Until then it is a hypothesis, and hypotheses go in a list, not in the suite. Cut anything sitting at the ceiling in both arms: it costs a run and reports nothing. Prefer deleting a grader over rewording it.
- Attack magic numbers. A character count standing in for substance, or keyword lists standing in for a stance, pass padding and fail precision.

## The rule for a null or negative result

**A skill scoring same or worse than `no-skill` is a claim about the suite before it is a claim about the skill.** Two 2026 papers found context files did not improve task success while adding ~20% inference cost; an A/B of a 755-line instruction file found 25 of 26 assertions passed identically with and without it. The usual reason: the baseline model already complies, making the eval a measurement of existing behavior.

Before recording "no effect", attack the suite on all seven:

- **Too easy.** Did every deterministic grader pass both arms? If the base model clears every bar unaided, cases cannot separate arms. Look for harder cases.
- **Measuring what the model already knows.** Generic cases measure training data. Signal concentrates in non-standard practice and facts the model cannot have: version-specific behavior, repo conventions, documented failure modes.
- **Measuring the wrong claim.** Do graders trace to frontmatter `description`, or did skill body wording leak into them? Graders keyed to prescribed headings make the arm win for reciting itself.
- **Judge noise.** At one sample per cell, subjective metrics move by more than effect size. Confirm deltas exceed variance—identical prompts scoring differently is the tell.
- **Blind oracle.** Does the check actually detect failure? `mermaid-cli` exits 0 and draws error graphics for invalid diagrams; "renders" passed broken output until SVG was inspected for error role.

- **Dead metric.** Did every row of a metric score 0 for the same non-substantive reason? `what_and_why` scored 0.00 on 18/18 rows with reason "Could not extract JSON from llm-rubric response" while the suite reported success. Read per-row `reason` strings before reading any mean.
- **Foreclosed by the prompt.** Does the prompt ask for the opposite of what the metric grades? `splits_mixed_change` asked whether the model splits a mixed diff while the prompt said "give me **the commit message**", singular. A mermaid case punished a choice its own task text had steered toward by naming a renderer that draws no mermaid at all.

Only when all seven are answered does a null result belong in the table below. Record the answers, not just the verdict.

## Harness facts

These cost a wasted run each to discover.

- `select-best` does not inherit `defaultTest.options.provider`. Give it its own `provider:` block or it falls through to default OpenAI and 401s.
- Assertion-level provider config is not interpolated. Use `apiKeyEnvar: OPENROUTER_API_KEY`, never `apiKey: '{{env.OPENROUTER_API_KEY}}'`.
- Node 24 rejects inline regex modifiers. Write `[Dd]one`, never `(?i)done`.
- **Set `showThinking: false` on every provider, including judges.** promptfoo defaults to `true` and prepends `Thinking: ${reasoning_content}` to output. The gateway separates reasoning correctly; the harness glues it back on. Left unset it corrupts results asymmetrically because longer skill prompts make reasoning more likely, penalizing the arm under test. A `transform` is a net for stray prose, not a substitute.
- A colon-space in an unquoted YAML list item turns it into a dict, not a string. `- Everything is explicit: fields, formats` becomes a mapping, `validate config` passes, and rows die at runtime with "G-Eval assertion type must have a string or array of strings value". Quote any criterion containing a colon.
- **A rubric only sees `{{output}}` and `{{rubric}}` unless you give the assertion its own `rubricPrompt`.** `llm-rubric`'s stock user message is literally `<Output>...</Output><Rubric>...</Rubric>`; the case's own vars are never passed. A rubric clause that says "supported by the source note" or "copied from the request" is then inert, and the judge *guesses* rather than complaining - cached replies read "I think 'source note' refers to the document being judged". Sweep by interpolation, not by whether the judge protested. Fix with a `{role,content}` list on the assertion that wraps the case var in its own tag. **The vars are spread under `output` and `rubric`, so a case var named `rubric` is silently shadowed by the rubric text** - name it something else.
- `rubricPrompt` at `defaultTest.options` / `test.options` must be string, string list, or `{role,content}` list—promptfoo's schema rejects a bare object there. The `{evaluate, steps}` object is accepted **only on individual assertions**, where the schema is unrestricted.
- g-eval parses verdicts with `/\{.+\}/`, which cannot match newlines, so pretty-printed JSON is discarded and rows score **0**—indistinguishable from genuine zero. It corrupted ~11% of rows in one run, asymmetrically. `llm-rubric` is unaffected: it brace-matches instead.
- **Judge rows can die with the judge's own verdict intact, and the cause is not `response_format`.** On mermaid, twelve g-eval rows where the judge awarded 10/10 recorded 0.00 ("not in JSON format"); on pr-authoring, `Could not extract JSON from llm-rubric response` killed 18/18 rows of one metric. `response_format: json_object` was blamed and is innocent: an isolated A/B (with, without, plus `omitDefaults`, plus the `stripReasoning` transform, against both a one-line and a full multi-paragraph rubric) reproduced nothing - every variant passed. The cause is still unidentified and may be a promptfoo version difference. **Always check per-row `reason` strings for extraction failures before reading a delta**; a metric can be entirely dead while the suite reports success.
- **A g-eval criterion must be a property of the artifact, never an instruction to the judge.** g-eval scores each criterion separately, so "judge it as delivered, ignore how it was built" gets graded as though it were a claim about the output and returns something unscorable. Meta-instructions belong in the rubric preamble.
- **Case vars are rendered as nunjucks templates, and a real diff can contain nunjucks.** A Go table-driven test - `}{{MsgQueued, false}, {MsgForwarded, true}}` - parsed as an interpolation and killed the whole case with `Template render error: (unknown path) [Line 41, Column 15] expected variable end`. Both arms returned empty output, and the comparative assertion still ran on two empty strings and awarded a winner. **`env: PROMPTFOO_DISABLE_TEMPLATING: "1"` in the suite config fixes it** (verified: with it the diff reaches the prompt byte-identical, without it the render throws). Graders are exempt - promptfoo checks `!isGrader` - so rubric prompts still render `{{output}}`/`{{criteria}}`. What it does turn off is var interpolation into assertion values, so a suite using `{{task}}` or `{{rubric}}` inside an assertion cannot take this flag. `lib/check-case-vars.py`, which `run.sh` runs before every eval, fails the run if a case var holds `{{` or `{%` and the suite has not opted out.
- **`reasoning: {enabled: false}` under `config` is silently dropped; nest it under `passthrough`.** Identical request by curl returns `reasoning_tokens: 0`; through promptfoo it returned 92. Across one full baseline it burned up to 29,112 reasoning tokens on a single row and truncated 15 rows to empty output, asymmetrically - the longer skill prompt provokes more reasoning, so the arm under test pays. A truncated row records `namedScores: {}` and the rollup then averages that arm over a smaller denominator without saying so. `passthrough` forwards the object verbatim and returns reasoning to 0.
- `cost` reads 0 unless the provider declares nominal per-token price, so undeclared `cost` assertions pass trivially and measure nothing.
- **A prompt function can hand its own provider config to a custom provider, which is how one arm gets a capability the other must not have.** Returning `{prompt, config}` instead of a bare message list merges that config into `prompt.config`, and `callApi` reads it back as `context.prompt.config`. mermaid's skill arm returns `{skillDir}` this way and gets a `load_resource` tool over the skill's own directory; the baseline returns a message list, names nothing, and is called exactly as before. Detecting the arm from `context.prompt.label` would work too and couples the provider to a YAML label string.
- **A `file://` provider's `id()` goes into the results as the provider id, and `rollup.js` derives the model label from it.** Return the `openai:chat:<model>` shape or every run through that provider is labelled with the filename instead of the model.
- Keep `skill-next` arm out until `SKILL.next.md` exists. `lib/arms.js` falls back to current skill, making it a duplicate that costs a third of the run.

## Running

```sh
npm install                                                     # once, in evals/
export OPENROUTER_API_KEY=...
node assertions/*.test.cjs                                      # free
npx promptfoo@latest validate config -c promptfooconfig.yaml    # free
npx promptfoo@latest eval -c promptfooconfig.yaml \
  -o /tmp/<suite>-eval.json --no-cache --no-share --max-concurrency 1
```

Filter with `--filter-pattern` before running a whole suite; a full run is cases x arms, each with a judge call and any validators.

Read per-metric `namedScores` per arm. Never read aggregate pass rate: `select-best` fails every non-winning arm by design, making suite score meaningless.
