// Offline checks on the quote-verified judge's pure parts (no network) - the
// pieces most likely to silently drift: which provider config the judge picks
// up, and how the weight table turns verified items into a score.
const assert = require('node:assert/strict');
const { judgeProvider, weighByItem, askItems } = require('./slop-judge.cjs');

// Model comes off test.options.provider.id ("openai:chat:<model>"), the exact
// object the suite's defaultTest.options already declares once.
{
  const ctx = {
    test: {
      options: {
        provider: {
          id: 'openai:chat:google/gemini-3.8-flash',
          config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' },
        },
      },
    },
  };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');
}

// weighByItem: names_defect's 0.5/0.5 split.
{
  const w = weighByItem({ 1: 0.5, 2: 0.5 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }]), 1, 'both items hold: full score');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }]), 0.5, 'only item 1 holds');
  assert.equal(w([{ n: 1, holds: false }, { n: 2, holds: false }]), 0, 'neither holds');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
}

// weighByItem: restraint's single item at weight 1 - all-or-nothing, same as
// the llm-rubric it replaces ("only ever 0 or 1, no partial credit").
{
  const w = weighByItem({ 1: 1.0 });
  assert.equal(w([{ n: 1, holds: true }]), 1, 'restrained: full score');
  assert.equal(w([{ n: 1, holds: false }]), 0, 'asked for restructuring: zero, no partial credit');
  assert.equal(w([]), 0, 'unverified quote: zero');
}

// askItems: <SourceFile> and <Output> both reach the judge, and the system
// message states the JSON contract - the failure mode this whole pattern
// exists to avoid is a judge answering in prose because the contract dropped.
{
  const { messages } = askItems('the rewritten file', { vars: { source: 'def f(): pass' } }, 'ITEM TEXT');
  assert.ok(messages[1].content.includes('the rewritten file'), '<Output> carries the real answer');
  assert.ok(messages[1].content.includes('def f(): pass'), '<SourceFile> carries the case var, not a nunjucks template');
  assert.ok(messages[0].content.includes('"items"'), 'the system message states the JSON contract');
  assert.ok(messages[1].content.includes('ITEM TEXT'), 'the items prompt reaches the judge');
}

console.log('slop-judge.test.cjs: ok');
