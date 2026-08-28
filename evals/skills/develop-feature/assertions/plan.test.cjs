// Offline checks on the one grader left here. Fully offline: namesExistingSolution
// is a substring check on output against context.vars, so unlike the cut
// noInventedCitations it needs no materialised tree and this file no longer
// does a network fetch on a cold cache. lib/fetch-repo.js is still what puts
// the tree in place for the eval itself.
const assert = require('node:assert');
const { namesExistingSolution } = require('./plan.cjs');

assert.deepEqual(
  namesExistingSolution('use the cenkalti/backoff package already in go.mod', { vars: { existingIdentifier: 'cenkalti/backoff' } }),
  { pass: true, score: 1, reason: 'Plan names the existing mechanism: "cenkalti/backoff".' },
);
assert.equal(namesExistingSolution('add a manual retry loop with time.Sleep', { vars: { existingIdentifier: 'cenkalti/backoff' } }).score, 0);
// The exact false positive this guard exists to catch: a judge awarded the
// plan_quality rubric's item 1 while writing "the literal name appears in
// <ExistingMechanism>", i.e. quoting its own prompt variable. Describing the
// same strategy in the plan's own words is not naming it.
assert.equal(namesExistingSolution('reset the cached version and compare semver properly', { vars: { existingIdentifier: 'versionGreaterThan' } }).score, 0);
assert.equal(namesExistingSolution('anything', { vars: {} }).score, 1, 'no existingIdentifier on the case means nothing to check');

console.log('ok   plan assertions (existing-mechanism naming)');
