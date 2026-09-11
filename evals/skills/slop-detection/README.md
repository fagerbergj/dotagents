# slop-detection suite

Measures whether loading `skills/slop-detection/SKILL.md` changes the artifact when a colleague hands over a file the source material uses to illustrate one of its signals.

Five cases, from Listings 1-3 of the [SlopCodeBench paper](https://arxiv.org/html/2603.24755v1) that the [article](https://earendil.com/posts/measuring-code-sloppiness/) draws its metrics from, plus two controls where the shape the skill objects to is the right one. Provenance and the per-case reasoning are in `tests/cases.yaml`.

Metrics:

| Metric | Cases | What it computes |
|---|---|---|
| `max_cc_reduced` | matcher, cli | Cyclomatic complexity of the worst function in the answer's code against the worst in the input. |
| `clone_ratio_reduced` | cli | Share of lines inside a repeated six-line run, answer against input. |
| `lines_reduced` | search | Non-blank, non-comment code lines, answer against input. |
| `names_defect` | matcher, search, cli | Judged: does the answer name a construct in this file and what replaces it. |
| `restraint` | lexer, test_radix | Judged: does the answer ask for the structure to change. Scores 1 when it does not. |

The three measured metrics run the skill's own formulas over the answer and over the input with the same function, so what is scored is the change, not a threshold.

**Every case is a hypothesis.** None has run. A case earns its place by separating the arms or by failing an answer that deserved to fail; until the first CI run reports per-metric `namedScores` per arm, nothing here is evidence. Read the per-row `reason` strings before any mean, and before adding a sixth case.

Free checks while authoring:

```sh
node assertions/slop.test.cjs
python3 ../../lib/check-suite.py .
npx promptfoo@latest validate config -c promptfooconfig.yaml
```
