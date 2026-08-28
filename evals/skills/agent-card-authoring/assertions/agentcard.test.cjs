// Offline self-test: every fixture is a JSON document handled in-process, so
// nothing here needs a network call.
const assert = require('node:assert');
const g = require('./agentcard.cjs');

const ok = (name, res) => assert.ok(res.pass, `${name} should pass: ${res.reason}`);
const bad = (name, res) => assert.ok(!res.pass, `${name} should fail but passed: ${res.reason}`);

const wrap = (doc) => 'Here you go:\n\n```json\n' + JSON.stringify(doc, null, 2) + '\n```\n';

const card = {
  name: 'Finance Bot',
  description: 'Reads receipts and answers per-diem policy questions.',
  version: '0.4.0',
  capabilities: { streaming: true, pushNotifications: false },
  skills: [
    { id: 'receipt-check', name: 'Receipt Policy Check', description: 'Checks a receipt against per-diem policy.', tags: ['finance'], examples: ["Is this receipt within policy?"] },
    { id: 'policy-qa', name: 'Policy Q&A', description: 'Answers per-diem policy questions.', tags: ['finance'], examples: ["What's our per diem in Germany?"] },
  ],
};

// --- normalizeToJson --------------------------------------------------------

{
  const out = g.normalizeToJson(wrap(card));
  assert.deepStrictEqual(JSON.parse(out), card, 'normalizeToJson should recover the fenced card');
}

{
  const out = g.normalizeToJson('Happy to help, but I need more detail first.');
  assert.ok(out.startsWith('NO AGENT CARD JSON IN OUTPUT'), 'no-card output should get the sentinel');
  assert.ok(out.includes('Happy to help'), 'sentinel should preserve the original prose for the rubric');
}

{
  // looksLikeCard() parses to decide relevance, so malformed JSON inside a
  // fence just fails to look like a card and falls through to the sentinel
  // path - it does not reach the parse-or-throw branch in normalizeToJson.
  const out = g.normalizeToJson('```json\n{ "name": "broken",\n```');
  assert.ok(out.startsWith('NO AGENT CARD JSON IN OUTPUT'), 'malformed fenced JSON should not be mistaken for a card');
}

// --- capabilitiesMatch -------------------------------------------------------

{
  ok('capabilitiesMatch true/false', g.capabilitiesMatch(JSON.stringify(card), { config: { streaming: true, pushNotifications: false } }));
}

{
  bad('capabilitiesMatch wrong streaming', g.capabilitiesMatch(JSON.stringify(card), { config: { streaming: false } }));
}

{
  const noCard = 'NO AGENT CARD JSON IN OUTPUT\n\nLet me ask a few questions first.';
  bad('capabilitiesMatch on sentinel', g.capabilitiesMatch(noCard, { config: { streaming: true } }));
}

{
  // null (the default) means the case doesn't state that flag - ungraded.
  ok('capabilitiesMatch with nothing configured', g.capabilitiesMatch(JSON.stringify(card), { config: {} }));
}

// --- examplesPreserveStatedPrompts ------------------------------------------

{
  ok('examplesPreserveStatedPrompts exact', g.examplesPreserveStatedPrompts(JSON.stringify(card), {
    config: { prompts: ['is this receipt within policy', "what's our per diem in germany"] },
  }));
}

{
  bad('examplesPreserveStatedPrompts missing one', g.examplesPreserveStatedPrompts(JSON.stringify(card), {
    config: { prompts: ['is this receipt within policy', 'can we book business class'] },
  }));
}

{
  assert.throws(() => g.examplesPreserveStatedPrompts(JSON.stringify(card), { config: {} }), /needs a non-empty config.prompts/);
}

// --- securitySchemeDeclares --------------------------------------------------

const oauthCard = { ...card, securitySchemes: { oauth2: { oauth2SecurityScheme: { flows: { clientCredentials: { tokenUrl: 'https://sso.example/token', scopes: {} } } } } } };
const oauthCardOldShape = { ...card, securitySchemes: { oauth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://sso.example/token' } } } } };
const apiKeyCard = { ...card, securitySchemes: { apiKey: { apiKeySecurityScheme: { location: 'header', name: 'X-Api-Key' } } } };

{
  ok('securitySchemeDeclares oauth2 wrapped shape', g.securitySchemeDeclares(JSON.stringify(oauthCard), { config: { family: 'oauth2' } }));
}

{
  ok('securitySchemeDeclares oauth2 old flat shape', g.securitySchemeDeclares(JSON.stringify(oauthCardOldShape), { config: { family: 'oauth2' } }));
}

{
  bad('securitySchemeDeclares wrong family', g.securitySchemeDeclares(JSON.stringify(apiKeyCard), { config: { family: 'oauth2' } }));
}

{
  ok('securitySchemeDeclares apiKey + matching header', g.securitySchemeDeclares(JSON.stringify(apiKeyCard), { config: { family: 'apiKey', headerName: 'X-Api-Key' } }));
}

{
  bad('securitySchemeDeclares apiKey + wrong header', g.securitySchemeDeclares(JSON.stringify(apiKeyCard), { config: { family: 'apiKey', headerName: 'X-Different-Header' } }));
}

{
  // The exact regression a live run proved: prose that echoes the brief's
  // vocabulary ("apiKey", "X-Api-KEY") but never parses as a card must fail
  // via withDoc's sentinel path, not match on the raw text.
  const prose = 'NO AGENT CARD JSON IN OUTPUT\n\nauthentication: apiKey: {location: header, headerName: X-Api-KEY}';
  bad('securitySchemeDeclares rejects non-JSON prose mentioning the keyword', g.securitySchemeDeclares(prose, { config: { family: 'apiKey', headerName: 'X-Api-Key' } }));
}

{
  bad('securitySchemeDeclares no securitySchemes at all', g.securitySchemeDeclares(JSON.stringify(card), { config: { family: 'oauth2' } }));
}

{
  assert.throws(() => g.securitySchemeDeclares(JSON.stringify(oauthCard), { config: {} }), /needs config.family/);
}

console.log('agentcard.cjs: all assertions passed');
