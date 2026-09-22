# eval results on `main`

Published by `.github/workflows/eval-publish.yml` on every push to the default branch.
`results/<suite>.csv` is the store; `results/<suite>.md` is rendered from it by `evals/rollup.js`.
Rows accumulate - a new model or a bumped skill version adds rows beside the old ones instead of replacing them.

## What each suite last measured

| suite | table | measured against | merged as | source |
|---|---|---|---|---|
| `adr-authoring` | [adr-authoring.md](results/adr-authoring.md) | `9195879` :warning: | `da6dc04` | reused |
| `agent-card-authoring` | [agent-card-authoring.md](results/agent-card-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `agent-skill-authoring` | [agent-skill-authoring.md](results/agent-skill-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `agents-md-authoring` | [agents-md-authoring.md](results/agents-md-authoring.md) | `f9bef38` :warning: | `b75b6d2` | reused |
| `comment-authoring` | [comment-authoring.md](results/comment-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `commit-authoring` | [commit-authoring.md](results/commit-authoring.md) | `dc17e84` :warning: | `19efdcd` | reused |
| `develop-feature` | [develop-feature.md](results/develop-feature.md) | `3aa20f9` :warning: | `68d1f14` | reused |
| `fix-bug` | [fix-bug.md](results/fix-bug.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `format-markdown` | [format-markdown.md](results/format-markdown.md) | `1c093c5` :warning: | `e71b94e` | reused |
| `issue-authoring` | [issue-authoring.md](results/issue-authoring.md) | `aa9785e` :warning: | `d90f8b2` | reused |
| `mermaid-authoring` | [mermaid-authoring.md](results/mermaid-authoring.md) | `172b59b` | `172b59b` | rerun |
| `pr-authoring` | [pr-authoring.md](results/pr-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `rest-api-authoring` | [rest-api-authoring.md](results/rest-api-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `review-code` | [review-code.md](results/review-code.md) | `ff444c2` :warning: | `7ccf646` | reused |
| `rfc-authoring` | [rfc-authoring.md](results/rfc-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `rfd-authoring` | [rfd-authoring.md](results/rfd-authoring.md) | `881ceab` :warning: | `3a3f00e` | reused |
| `slop-detection` | [slop-detection.md](results/slop-detection.md) | `d9ff088` :warning: | `9430e7c` | reused |

:warning: means the numbers were produced against a different commit than the one that merged.
That is the `reused` path: the PR's artifact was built from the PR head, and if `main` moved
underneath before the merge, these results describe a tree that never existed. Re-run the suite
on `main` before leaning on such a row.

Full history in [provenance.csv](provenance.csv).
