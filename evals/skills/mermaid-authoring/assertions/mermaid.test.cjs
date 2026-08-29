const assert = require('node:assert/strict');
const checks = require('./mermaid.cjs');

const flowchart = `\`\`\`mermaid
flowchart TD
    Start --> Decision{Valid?}
    Decision -->|yes| Done([Done])
    Decision -->|no| Failed([Failed])
\`\`\``;

assert.equal(checks.usesDiagramType(flowchart, { config: { allowed: ['flowchart'] } }).pass, true);

// Front matter, an `%%{init}%%` directive and a `%%` comment are all valid
// mermaid that renders, and each used to be read as the diagram type - two rows
// of a real baseline scored 0 on diagram_choice while mermaid_renders scored 1.
const typed = (body, allowed) => checks.usesDiagramType('```mermaid\n' + body + '\n```', { config: { allowed } });
assert.equal(typed('---\ntitle: Checkout\n---\nflowchart TD\n  A-->B', ['flowchart']).pass, true);
assert.equal(typed("%%{init: {'theme':'base'}}%%\nxychart-beta\n  line [1,2]", ['xychart-beta']).pass, true);
assert.equal(typed('%% payment flow\nflowchart TD\n  A-->B', ['flowchart']).pass, true);
assert.equal(typed('gitGraph:\n  commit', ['gitGraph']).pass, true);
// Skipping the preamble must not start accepting the wrong type.
assert.equal(typed('---\ntitle: x\n---\nxychart-beta\n  line [1]', ['radar-beta']).pass, false);
assert.match(typed('---\ntitle: x\n---\nxychart-beta\n  line [1]', ['radar-beta']).reason, /xychart-beta/);
// Every fenced block is still checked, not just the first.
assert.equal(typed('flowchart TD\n  A-->B\n```\n\n```mermaid\ninfo', ['flowchart']).pass, false);

// mermaid-cli exits 0 on an invalid diagram and draws its own error graphic, so
// this signature is the only thing separating a render from a rendered failure.
assert.equal(checks.isErrorSvg('<svg aria-roledescription="error"><g class="error-icon"/></svg>'), true);
assert.equal(checks.isErrorSvg('<svg aria-roledescription="flowchart-v2"><g class="node"/></svg>'), false);
// A valid diagram styling a node via `classDef error-icon` must not read as an error.
assert.equal(checks.isErrorSvg('<svg aria-roledescription="flowchart-v2"><g class="node default error-icon"/></svg>'), false);

// mermaid-lint prints one `<file>:<line>:<col>: <message>` per failure, buried in
// npx deprecation warnings and progress chatter.
const lintOutput = 'npm warn deprecated foo@1\n3-bad.md:3:25: parse error: expected `]`, found a quoted string\nchecked 1 diagram in 1 file - 1 failure';
assert.deepEqual(checks.lintFindings(lintOutput), ['3-bad.md:3:25: parse error: expected `]`, found a quoted string']);
assert.deepEqual(checks.lintFindings('npm warn deprecated foo@1\nall valid'), []);
assert.match(checks.trimLintPath(checks.lintFindings(lintOutput)[0]), /^3:25: parse error: expected/);
assert.equal(checks.trimLintPath(''), 'mermaid-lint reported a failure');

// The vision judge scores what it enumerated. The clamp is what stops a model
// that found no fault from hedging the number down anyway.
const clean = 'LABELS: Start | Done\nCLIPPED: NONE\nOVERLAP: NONE\nARTIFACTS: NONE\nSCORE: 3';
// Markdown bolding and bullets are the common reply shape and must still parse.
const dirty = '**LABELS:** Start | Deplo\n**CLIPPED:** "Deplo" runs outside its box\n**OVERLAP:** NONE\n**ARTIFACTS:** NONE\n**SCORE:** 2/5';

// --- config shape -----------------------------------------------------------
// One metric, one property. Only no_invented_elements may subtract, and its
// entire score is that subtraction - every other rubric awards and never fines.
// semantic_quality used to score "no invented element" as one of four items AND
// let each invented element cancel one of the others, so an invention cost the
// same number twice: "Three invented elements ... cancel item 1, leaving 0
// satisfied items", on a row whose item 1 the judge had just quoted as
// satisfied. Matched on the arithmetic word rather than on what is penalised;
// the phrasing differs per suite and a pattern keyed to "invent" misses half of
// them.
const { execFileSync } = require('node:child_process');
const nodePath = require('node:path');
const config = JSON.parse(execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  nodePath.join(__dirname, '..', 'promptfooconfig.yaml')], { encoding: 'utf8' }));
const graders = config.defaultTest.assert;

for (const grader of graders) {
  if (grader.type !== 'llm-rubric' || grader.metric === 'no_invented_elements') continue;
  assert.doesNotMatch(grader.value, /\b(subtract|subtracts|subtracting|cancel|cancels|cancelling|deduct|deducts)\b/i,
    `${grader.metric} subtracts inside its own score; only no_invented_elements may, and its whole score is that subtraction`);
}
assert.ok(graders.some((g) => g.metric === 'no_invented_elements'),
  'no_invented_elements is gone; invention would have nowhere to be scored');

console.log(`mermaid assertions: ok (${graders.length} shared graders)`);
