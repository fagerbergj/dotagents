// Offline checks on readability's pure parts. Runs before any tokens are bought.
const assert = require('node:assert');
const { judgeProvider, weighByItem, askItems } = require('./readability.cjs');

{
  // Model comes off `test.options.provider.id` ("openai:chat:<model>"), the
  // exact object the old llm-rubric already used - no second copy of it here.
  const ctx = { test: { options: { provider: { id: 'openai:chat:google/gemini-3.8-flash', config: { apiBaseUrl: 'https://openrouter.ai/api/v1', apiKeyEnvar: 'OPENROUTER_API_KEY' } } } } };
  const cfg = judgeProvider(ctx);
  assert.equal(cfg.model, 'google/gemini-3.8-flash');
  assert.equal(cfg.apiKeyEnvar, 'OPENROUTER_API_KEY');
  assert.equal(judgeProvider({}).model, undefined, 'a missing provider block does not throw');

  const w = weighByItem({ 1: 0.4, 2: 0.3, 3: 0.3 });
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: false }, { n: 3, holds: false }]), 0.4, 'only a holding item earns its weight');
  assert.equal(w([{ n: 1, holds: true }, { n: 2, holds: true }, { n: 3, holds: true }]), 1, 'all three items sum to 1');
  assert.equal(w([]), 0, 'nothing verified scores 0, not an error');
  assert.equal(w([{ n: 3, holds: true }, { n: 3, holds: true }]), 0.3, 'repeated items earn the weight once, never more than once');

  const built = askItems('the delivered document', { vars: { document: 'the original document' } }, 'ITEM TEXT');
  assert.ok(built.messages[1].content.includes('the delivered document'), '<Output> carries the real delivered text');
  assert.ok(built.messages[1].content.includes('the original document'), '<Original> carries the case var');
  assert.ok(built.messages[0].content.includes('"items"'), 'the system message states the JSON contract');
  assert.ok(built.messages[0].content.includes('<Original>'), 'the JSON contract warns against quoting <Original> back');

  const noDoc = askItems('output only', {}, 'ITEM TEXT');
  assert.ok(noDoc.messages[1].content.includes('<Original></Original>'), 'a missing document var does not throw');
}

// A latency assertion stays UNNAMED, same rule review-code pins. PyYAML rather
// than a regex - the config is structured and carries an anchor.
const yamlLoadCfg = (f) => JSON.parse(require('node:child_process').execFileSync('python3', ['-c',
  'import json,sys,yaml; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)',
  require('node:path').join(__dirname, '..', f)], { encoding: 'utf8' }));
for (const a of [...(yamlLoadCfg('promptfooconfig.yaml').defaultTest.assert || []),
  ...yamlLoadCfg('tests/cases.yaml').flatMap((c) => c.assert || [])]) {
  assert.ok(!(a && a.type === 'latency' && a.metric),
    `latency carries metric "${a && a.metric}" - it must stay an unnamed run-shape guard, not a graded column`);
}

console.log('ok   readability assertions (pure parts)');
