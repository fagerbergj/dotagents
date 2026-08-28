#!/usr/bin/env node
// Materialise this suite's one pinned repo before an eval runs. Idempotent -
// safe to call every time run.sh would (it won't: run.sh's fetch step is
// wired to evals/lib/fixtures.js's tests/fixtures.json shape, which this
// suite doesn't use since there's no per-case diff, only one shared tree).
const { materialise } = require('./repo.js');
materialise((m) => console.log(m));
