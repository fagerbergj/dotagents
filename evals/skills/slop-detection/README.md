# slop-detection suite

Measures whether loading `skills/slop-detection/SKILL.md` changes the artifact when a colleague hands over a file the source material uses to illustrate one of its signals.

Five cases: three reconstructed from Listings 1-3 of the [SlopCodeBench paper](https://arxiv.org/html/2603.24755v1) that the [article](https://earendil.com/posts/measuring-code-sloppiness/) draws its metrics from, and two controls where the shape the skill objects to is the right one. Provenance and the per-case reasoning are in `tests/cases.yaml`.

Metrics:

| Metric | Cases | What it computes |
|---|---|---|
| `max_cc_reduced` | matcher, cli | Cyclomatic complexity of the worst function in the answer's code against the worst in the input. |
| `clone_ratio_reduced` | cli | Lines inside a repeated six-line run, as a share and as a count, answer against input. |
| `single_use_vars_reduced` | search | Names assigned once and read once after, answer against input. |
| `names_defect` | matcher, search, cli | Judged: does the answer name a construct in this file and what replaces it. |
| `restraint` | lexer, dialcodes | Judged: does the answer ask for the structure to change. Scores 1 when it does not. |

The three measured metrics run the skill's own formulas over the answer and over the input with the same function, so what is scored is the change, not a threshold. Each sits behind an identifier floor: an answer that deleted or truncated the file wins every delta, and is failed for what did not survive instead. `assertions/slop.test.cjs` pins that floor along with padding, golfing and a `match`/`case` rewrite - the four answers that beat an earlier revision of these graders.

The skill arm gets `load_resource` over the skill's own directory, so its two "read `references/...`" instructions are followable; the baseline names no `skillDir` and is called without tools.

**Every case is a hypothesis.** None has run. A case earns its place by separating the arms or by failing an answer that deserved to fail; until the first CI run reports per-metric `namedScores` per arm, nothing here is evidence. Read the per-row `reason` strings before any mean, and before adding a sixth case.

Two predictions worth checking first, both of which would mean cutting something rather than keeping it: `names_defect` may sit at the ceiling in both arms, since the three defect cases ask for a rewritten file and any arm that obeys tends to explain it; `max_cc_reduced` may do the same, since a baseline asked to rewrite a CC-22 function will usually split it. If either reads flat, `restraint` is carrying the suite and needs more rows.

Free checks while authoring:

```sh
node assertions/slop.test.cjs
python3 ../../lib/check-suite.py .
python3 ../../lib/check-case-vars.py 'tests/*.yaml'
npx promptfoo@latest validate config -c promptfooconfig.yaml
```
