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

console.log('adr assertions: ok');
