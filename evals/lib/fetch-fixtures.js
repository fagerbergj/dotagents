#!/usr/bin/env node
// Materialise a suite's PR fixtures before its eval runs.
//   fetch-fixtures.js <suite-dir>
// No-op for a suite with no tests/fixtures.json, which is every suite but one.
const { materialise, specs } = require('./fixtures.js');
const dir = process.argv[2] || '.';
const list = specs(dir);
if (!list.length) process.exit(0);
console.log(`fixtures: ${list.length} pull request(s)`);
for (const f of list) materialise(f, (m) => console.log(m));
