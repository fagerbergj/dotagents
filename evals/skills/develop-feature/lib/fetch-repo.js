#!/usr/bin/env node
// Materialise this suite's one pinned repo before an eval runs. Idempotent, and
// run.sh calls it every time by the `lib/fetch-*.js` name: the shared
// evals/lib/fetch-fixtures.js no-ops here, since this suite has no per-case diff
// to materialise, only one shared tree.
const { materialise } = require('./repo.js');
materialise((m) => console.log(m));
