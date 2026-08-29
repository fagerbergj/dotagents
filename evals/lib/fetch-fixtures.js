#!/usr/bin/env node
// Materialise a suite's PR fixtures before its eval runs.
//   fetch-fixtures.js <suite-dir>
// No-op for a suite with no tests/fixtures.json - only pr-authoring and
// review-code carry one. It is not the only fetcher: fix-bug and
// develop-feature bring their own (skills/fix-bug/lib/fetch-bugfix-fixtures.js,
// skills/develop-feature/lib/fetch-repo.js), which run.sh does not call, so
// those two still need their fetcher run by hand before an eval.
const { materialise, specs } = require('./fixtures.js');
const dir = process.argv[2] || '.';
const list = specs(dir);
if (!list.length) process.exit(0);
console.log(`fixtures: ${list.length} pull request(s)`);
for (const f of list) materialise(f, (m) => console.log(m));
