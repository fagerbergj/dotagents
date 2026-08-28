#!/usr/bin/env node
// Materialise fix-bug's pinned bug-commit fixtures before its eval runs.
//   fetch-bugfix-fixtures.js <suite-dir>
// Not wired into run.sh (which only knows evals/lib/fetch-fixtures.js, and
// that one no-ops here - see bugfix-fixtures.js). Run this by hand first:
//   node lib/fetch-bugfix-fixtures.js .
const { materialise, specs } = require('./bugfix-fixtures.js');
const dir = process.argv[2] || '.';
const list = specs(dir);
if (!list.length) process.exit(0);
console.log(`bugfix fixtures: ${list.length} commit(s)`);
for (const f of list) materialise(f, (m) => console.log(m));
