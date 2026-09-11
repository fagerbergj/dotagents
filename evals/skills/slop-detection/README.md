# slop-detection suite

Measures whether loading `skills/slop-detection/SKILL.md` changes the artifact when a colleague hands over a file the source material uses to illustrate one of its signals.

Five cases: three reconstructed from Listings 1-3 of the [SlopCodeBench paper](https://arxiv.org/html/2603.24755v1) that the [article](https://earendil.com/posts/measuring-code-sloppiness/) draws its metrics from, and two controls where the shape the skill objects to is the right one. Provenance and the per-case reasoning are in `tests/cases.yaml`.

Metrics:

| Metric | Cases | What it computes |
|---|---|---|
| `clone_ratio_reduced` | cli | Lines inside a repeated six-line run, as a share and as a count, answer against input. Lines in a literal table are excluded from both. |
| `single_use_vars_reduced` | search | Names assigned once and read once after, answer against input. |
| `names_defect` | matcher, search, cli | Judged: does the answer name a construct in this file and what replaces it. |
| `restraint` | lexer, dialcodes | Judged: does the answer ask for the structure to change. Scores 1 when it does not. |

The two measured metrics run the skill's own formulas over the answer and over the input with the same function, so what is scored is the change, not a threshold. Both sit behind an identifier floor: an answer that deleted or truncated the file wins every delta, and is failed for what did not survive instead. `assertions/slop.test.cjs` pins that floor along with padding, golfing, and the fix the skill actually asks for.

The skill arm gets `load_resource` over the skill's own directory, so its two "read `references/...`" instructions are followable; the baseline names no `skillDir` and is called without tools.

## First run: ef989f4, 5 cases x 2 arms

| Metric | no-skill | skill-current | Reading |
|---|---|---|---|
| `names_defect` | 0.00 | 0.67 | The only metric that separated the arms on its own terms. 3 rows. |
| `single_use_vars_reduced` | 0.00 | 1.00 | 1 row. One row is an anecdote. |
| `clone_ratio_reduced` | 1.00 | 0.00 | Void - see below. |
| `restraint` | 0.50 | 0.50 | Flat. 2 rows, and the controls are what this suite is short of. |
| `max_cc_reduced` | 1.00 | 1.00 | Ceiling in both arms, as predicted. Cut. |

Cost: 805 -> 8,149 tokens and 5.7s -> 24.5s per row. The harness printed "too few cases to make a reliable determination" against every metric, which is the honest summary of all five rows above.

**The clone row was the grader's fault, not the skill's.** The skill arm did what the skill asks - collapsed the four repeated argument-parsing blocks into one uniform table plus one parse loop - and the grader read `clone ratio 0.77 (66/86) -> 1.00 (82/82)`, because normalised rows of a uniform table are exact copies of each other. It scored the correct fix as total duplication, on the same "repetition that is data" shape `SKILL.md`'s own exclusion list names. `cloneRatio` now drops any run of six or more contiguous lines that carry data and no control flow, so a table costs nothing and four repeated procedural blocks still count 66 of 86. Both directions are pinned.

`max_cc_reduced` is gone: 1.00 in both arms, because a baseline asked to rewrite a CC-22 function splits it as readily as an instructed one does. The complexity counter went with it. A case with headroom on that signal would have to bring the counter back.

**Every case is still a hypothesis.** One run at one row per cell says nothing a rerun would have to agree with. A case earns its place by separating the arms or by failing an answer that deserved to fail; read the per-row `reason` strings before any mean, and before adding a sixth case. `names_defect` remains the one to watch - the three defect cases ask for a rewritten file, and an arm that obeys tends to explain what it did.

Free checks while authoring:

```sh
node assertions/slop.test.cjs
python3 ../../lib/check-suite.py .
python3 ../../lib/check-case-vars.py 'tests/*.yaml'
npx promptfoo@latest validate config -c promptfooconfig.yaml
```
