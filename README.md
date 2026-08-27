# eval results on `main`

Published by `.github/workflows/eval-publish.yml` on every push to the default branch.
`results/<suite>.csv` is the store; `results/<suite>.md` is rendered from it by `evals/rollup.js`.
Rows accumulate - a new model or a bumped skill version adds rows beside the old ones instead of replacing them.

## What each suite last measured

| suite | table | measured against | merged as | source |
|---|---|---|---|---|
| `adr-authoring` | [adr-authoring.md](results/adr-authoring.md) | `8aec313` :warning: | `52387aa` | reused |
| `commit-authoring` | [commit-authoring.md](results/commit-authoring.md) | `1463d6a` :warning: | `bdf07db` | reused |
| `format-markdown` | [format-markdown.md](results/format-markdown.md) | `c80a6ae` :warning: | `86334f5` | reused |
| `rest-api-authoring` | [rest-api-authoring.md](results/rest-api-authoring.md) | `d84b1b4` :warning: | `1dfd6c8` | reused |

:warning: means the numbers were produced against a different commit than the one that merged.
That is the `reused` path: the PR's artifact was built from the PR head, and if `main` moved
underneath before the merge, these results describe a tree that never existed. Re-run the suite
on `main` before leaning on such a row.

Full history in [provenance.csv](provenance.csv).
