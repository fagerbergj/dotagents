const assert = require('node:assert/strict');
const checks = require('./issue.cjs');

const single = `# Export button silently fails for CSV files over 10 MB

## Context
Support has three reports this week. The browser shows no error.

## Why this matters
People are exporting by hand instead.

## Acceptance criteria
- [ ] Exporting a 12 MB CSV downloads a complete file
- [ ] A failed export shows an error message naming the reason`;

assert.equal(checks.oneBoundedIssue(single, {}).pass, true);
assert.equal(checks.noInventedFacts(single, { vars: { report: 'export dies on a 12 MB csv, 10 MB seems to be the line' } }).pass, true);

// Facts that never appeared in the report.
const fabricated = `# Upload fails on large files

## Acceptance criteria
- [ ] Uploading succeeds on v2.14.3
- [ ] src/api/upload.ts returns 413 instead of 500`;
const missed = checks.noInventedFacts(fabricated, { vars: { report: 'uploads break sometimes, no idea why' } });
assert.equal(missed.pass, false);
assert.match(missed.reason, /2\.14\.3/);
assert.equal(checks.noInventedFacts(fabricated, { vars: { report: 'log says src/api/upload.ts, 500 not 413, on v2.14.3' } }).pass, true);

// The source string is the report and its provenance only. A rubric naming an
// identifier must not launder it into the output.
const laundered = checks.noInventedFacts(fabricated, {
  vars: {
    report: 'uploads break sometimes, no idea why',
    rubric: 'The reply must not claim v2.14.3 or src/api/upload.ts.',
  },
});
assert.equal(laundered.pass, false);
assert.match(laundered.reason, /2\.14\.3/);
assert.match(laundered.reason, /upload\.ts/);

// `source` and `tracker` are handed to the model, so they do count as given.
assert.equal(checks.noInventedFacts('# T\n\nSeen on v3.7.1.', {
  vars: { report: 'it broke', source: 'Support forwarded the v3.7.1 log.', tracker: 'Jira' },
}).pass, true);

// Standard technical vocabulary is not an invented fact.
const constants = `# Session tokens survive a password change

## Acceptance criteria
- [ ] Tokens are hashed with SHA-256 before storage
- [ ] Expiry is serialised as ISO-8601 in UTC-8 over HTTP/1.1 with TLS 1.2`;
assert.equal(checks.noInventedFacts(constants, { vars: { report: 'changing my password did not log out my other browser' } }).pass, true);

// An ALL-CAPS observed/expected pair is not an errno.
assert.equal(checks.noInventedFacts('# T\n\nEXPECTED: a file. ACTUAL: nothing.', { vars: { report: 'nothing downloads' } }).pass, true);

// Three asks split into three heading-titled items, no `Title:` labels anywhere.
const threeHeadings = `## Add a dark mode toggle
### Acceptance criteria
- [ ] a
- [ ] b

## Editor crashes pasting an image in Safari
### Acceptance criteria
- [ ] a
- [ ] b

## Install page still names the deleted bootstrap script
### Acceptance criteria
- [ ] a
- [ ] b`;
assert.equal(checks.oneBoundedIssue(threeHeadings, { config: { min: 2, max: 3 } }).pass, true);
assert.equal(checks.oneBoundedIssue(threeHeadings, {}).pass, false);
assert.equal(checks.oneBoundedIssue(single, { config: { min: 2, max: 3 } }).pass, false);



console.log('issue assertions: ok');
