#!/usr/bin/env node
// Materialise fix-bug's pinned bug-commit fixtures before its eval runs.
//   fetch-bugfix-fixtures.js <suite-dir>
// run.sh calls this by the `lib/fetch-*.js` name; the shared
// evals/lib/fetch-fixtures.js no-ops here - see bugfix-fixtures.js. Run it by
// hand only for a bare `promptfoo eval` that skips run.sh:
//   node lib/fetch-bugfix-fixtures.js .
const { materialise, specs } = require('./bugfix-fixtures.js');
const dir = process.argv[2] || '.';
const list = specs(dir);
if (!list.length) process.exit(0);
console.log(`bugfix fixtures: ${list.length} commit(s)`);
for (const f of list) materialise(f, (m) => console.log(m));
