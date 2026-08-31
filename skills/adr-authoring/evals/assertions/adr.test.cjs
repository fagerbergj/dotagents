const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checks = require('./adr.cjs');

const good = `# 0007. Store events in Postgres

## Status

Accepted

## Context

Ops already runs Postgres; nobody has run DynamoDB in production. Peak is 4k/s
and a load test on the current box held 9k/s.

## Decision

We will keep the event log in the existing Postgres cluster. We will partition
by month. We will revisit if a single box stops holding peak.

## Consequences

Reads stay in one place. The cost is that we lose horizontal write scaling and
will have to partition by month once the table passes 200M rows.
`;

// Benefits alone are not consequences.

// One decision. Repeated "We will" is the idiom the skill body recommends and
// must not be penalised; repeated Decision sections must be.
// MADR heading, not a second decision.

// A superseding record reproduces its predecessor's status. That is the point
// of supersession, not a second decision being authored.
const supersession = `# 0012. Move the queue to SQS FIFO

## Status

Accepted, supersedes 0004

## Decision

We will run the job queue on SQS FIFO.

## Consequences

We lose the routing topology and pay per message.

## The record this replaces

0004 - Self-host RabbitMQ. Status: Superseded on 2026-03-20.
`;

// Negative controls. Hedging must not rescue a document that then records
// settled decisions anyway.
const hedgedButConfident = `# Offsite outcomes

This offsite covered several unrelated decisions, so here they are.

## Queue

Status: Accepted

## Auth

Status: Accepted

## Frontend

Status: Accepted
`;

// Context: the document has to carry the note's own names and numbers.
const vars = { task: 'ok so the event log argument is over. Postgres, monthly partitions. Ravi wanted Dynamo, we were touching 4k/s at peak and the box we already pay for did 9k/s.' };
assert.equal(checks.carriesTaskSpecifics(good, { vars }).pass, true);
assert.equal(checks.carriesTaskSpecifics('We picked a database. It has upsides and downsides.', { vars }).pass, false);
assert.equal(checks.carriesTaskSpecifics('Postgres and Dynamo were compared.', { vars, config: { minimum: 2 } }).pass, true);

// --- config shape -----------------------------------------------------------
// One metric, one property. Only no_invented_specifics may subtract, and its
// entire score is that subtraction - every other rubric awards and never fines,
// so a missed criterion and a fabrication can no longer produce the same number.
// Matched on the arithmetic word rather than on what is being penalised: the
// phrasings differ per suite ("each INVENTED cancels one satisfied criterion",
// "subtract 0.2 for each system, number or team the review names") and a pattern
// keyed to "invent" walks straight past the second one.
const { execFileSync } = require('node:child_process');
const cases = JSON.parse(execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  path.join(__dirname, '..', 'tests/cases.yaml')], { encoding: 'utf8' }));
const graders = cases.flatMap((c) => c.assert || []);

for (const grader of graders) {
  if (grader.type !== 'llm-rubric' || grader.metric === 'no_invented_specifics') continue;
  assert.doesNotMatch(grader.value, /\b(subtract|subtracts|subtracting|cancel|cancels|cancelling|deduct|deducts)\b/i,
    `${grader.metric} subtracts inside its own score; only no_invented_specifics may, and its whole score is that subtraction`);
}
const grounded = cases.filter((c) => (c.assert || []).some((g) => g.metric === 'no_invented_specifics'));
assert.equal(grounded.length, cases.length,
  `no_invented_specifics rides on ${grounded.length} of ${cases.length} cases`);

console.log(`adr assertions: ok (${cases.length} cases, ${graders.length} graders)`);
