# eval results on `main`

Published by `.github/workflows/eval-publish.yml` on every push to the default branch.
`results/<suite>.csv` is the store; `results/<suite>.md` is rendered from it by `evals/rollup.js`.
Rows accumulate - a new model or a bumped skill version adds rows beside the old ones instead of replacing them.

## What each suite last measured

| suite | table | measured against | merged as | source |
|---|---|---|---|---|
| `adr-authoring` | [adr-authoring.md](results/adr-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `agent-card-authoring` | [agent-card-authoring.md](results/agent-card-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `agent-skill-authoring` | [agent-skill-authoring.md](results/agent-skill-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `agents-md-authoring` | [agents-md-authoring.md](results/agents-md-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `comment-authoring` | [comment-authoring.md](results/comment-authoring.md) | `047ae38` | `047ae38` | rerun |
| `commit-authoring` | [commit-authoring.md](results/commit-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `format-markdown` | [format-markdown.md](results/format-markdown.md) | `dfc73ca` | `dfc73ca` | rerun |
| `issue-authoring` | [issue-authoring.md](results/issue-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `mermaid-authoring` | [mermaid-authoring.md](results/mermaid-authoring.md) | `172b59b` | `172b59b` | rerun |
| `pr-authoring` | [pr-authoring.md](results/pr-authoring.md) | `172b59b` | `172b59b` | rerun |
| `rest-api-authoring` | [rest-api-authoring.md](results/rest-api-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `review-code` | [review-code.md](results/review-code.md) | `172b59b` | `172b59b` | rerun |
| `rfc-authoring` | [rfc-authoring.md](results/rfc-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |
| `rfd-authoring` | [rfd-authoring.md](results/rfd-authoring.md) | `dfc73ca` | `dfc73ca` | rerun |

:warning: means the numbers were produced against a different commit than the one that merged.
That is the `reused` path: the PR's artifact was built from the PR head, and if `main` moved
underneath before the merge, these results describe a tree that never existed. Re-run the suite
on `main` before leaning on such a row.

Full history in [provenance.csv](provenance.csv).
