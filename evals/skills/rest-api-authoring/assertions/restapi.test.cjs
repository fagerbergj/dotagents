// Offline self-test: every fixture is a JSON document, which parses in-process,
// so nothing here shells out to the validator. The shape checks these used to
// duplicate now live as `is-json` schemas in promptfooconfig.yaml.
const assert = require('node:assert');
const path = require('node:path');
const g = require('./restapi.cjs');

const wrap = (doc) => 'Here you go:\n\n```json\n' + JSON.stringify(doc, null, 2) + '\n```\n';

const ok = (name, res) => assert.ok(res.pass, `${name} should pass: ${res.reason}`);
const bad = (name, res) => assert.ok(!res.pass, `${name} should fail but passed: ${res.reason}`);

const base = {
  openapi: '3.1.0',
  info: { title: 'Tickets', version: '1.0.0' },
  paths: {
    '/tickets': {
      get: {
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Ticket' } } } } },
          401: { description: 'no' },
        },
      },
      post: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Ticket' } } } },
        responses: {
          201: { description: 'made', headers: { Location: { schema: { type: 'string' } } } },
          422: { description: 'bad' },
        },
      },
    },
    '/tickets/{ticketId}': {
      delete: { responses: { 204: { description: 'gone' }, 404: { description: 'missing' } } },
    },
  },
  components: {
    securitySchemes: { oauth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://example.test/t', scopes: { 'tickets:read': 'r', 'tickets:write': 'w' } } } } },
    schemas: {
      Ticket: { type: 'object', required: ['subject'], properties: { id: { type: 'string' }, subject: { type: 'string' }, contact: { $ref: '#/components/schemas/Address' } } },
      Address: { type: 'object', properties: { street: { type: 'string' } } },
    },
  },
  security: [{ oauth: ['tickets:read'] }],
};

const clone = (mutate) => {
  const copy = JSON.parse(JSON.stringify(base));
  mutate(copy);
  return copy;
};

// The transform strips the gateway's prose and hands the native assertions a
// bare JSON document. A document that will not parse throws rather than falling
// back to raw text, which used to make six quote-anchored assertions report
// absent content when the content was plainly there.
assert.deepStrictEqual(JSON.parse(g.normalizeToJson(wrap(base))), base);
const truncated = '```json\n{\n"openapi": "3.1.0",\n"paths": {\n```';
assert.throws(() => g.normalizeToJson(truncated), /could not parse/);
// No document at all is a legitimate answer, so it fails loudly instead of
// erroring, behind a sentinel no quote-anchored regex can match.
const refusal = g.normalizeToJson('I would not add that endpoint without a security decision first.');
assert.match(refusal, /^NO OPENAPI DOCUMENT IN OUTPUT/);
assert.ok(!/"(get|post)"/.test(refusal));
assert.throws(() => JSON.parse(refusal));

ok('resourcePathsAreNouns', g.resourcePathsAreNouns(wrap(base)));
ok('action sub-resource is allowed', g.resourcePathsAreNouns(wrap(clone((d) => { d.paths['/tickets/{ticketId}/cancellation'] = { post: { responses: { 202: { description: 'ok' } } } }; }))));
bad('verb-led path', g.resourcePathsAreNouns(wrap(clone((d) => { d.paths['/createTicket'] = { post: { responses: { 201: { description: 'ok' } } } }; }))));
bad('singular collection', g.resourcePathsAreNouns(wrap(clone((d) => { d.paths['/ticket/{ticketId}'] = { get: { responses: { 200: { description: 'ok' } } } }; }))));
bad('no document at all', g.resourcePathsAreNouns('Sorry, I cannot do that.'));

// Differentiated by privilege means the operations differ from each other, so
// the fixture needs a write scope somewhere before it can pass.
const byPrivilege = clone((d) => { d.paths['/tickets'].post.security = [{ oauth: ['tickets:write'] }]; });
ok('securityIsDeclaredAndApplied', g.securityIsDeclaredAndApplied(wrap(byPrivilege), {}));
bad('no scheme declared', g.securityIsDeclaredAndApplied(wrap(clone((d) => { delete d.components.securitySchemes; })), {}));
bad('scheme declared but never applied', g.securityIsDeclaredAndApplied(wrap(clone((d) => { delete d.security; })), {}));
bad('one operation opted out', g.securityIsDeclaredAndApplied(wrap(clone((d) => { d.paths['/tickets'].post.security = []; })), {}));
bad('applied without scopes', g.securityIsDeclaredAndApplied(wrap(clone((d) => { d.security = [{ oauth: [] }]; })), {}));
ok('scopes not required', g.securityIsDeclaredAndApplied(wrap(clone((d) => { d.security = [{ oauth: [] }]; })), { config: { requireScopes: false } }));
// Defect 1: a requirement naming a scheme that does not exist. Redocly with
// --extends=minimal demotes security-defined to a warning and exits 0, so
// nothing else in the suite catches it.
bad('requirement names an undeclared scheme', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.security = [{ totallyUndefinedScheme: ['x'] }];
})), { config: { requireScopes: false } }));
bad('one operation overrides with an undeclared scheme', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.paths['/tickets'].post.security = [{ apiKeyWeNeverDeclared: [] }];
})), { config: { requireScopes: false } }));
// Defect 2: OAS 3.1.1 - an empty Security Requirement Object makes auth
// optional, so the operation admits anonymous callers.
bad('empty requirement object admits anonymous callers', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.paths['/tickets'].post.security = [{ oauth: ['tickets:write'] }, {}];
})), { config: { requireScopes: false } }));
bad('empty requirement object at the root', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.security = [{ oauth: ['tickets:read'] }, {}];
})), { config: { requireScopes: false } }));
// Defect 3: every operation carrying the identical requirement is one
// privilege level, however many scopes it names. The old check passed because
// some requirement somewhere named some scope.
bad('every operation carries the identical scopes', g.securityIsDeclaredAndApplied(wrap(base), {}));
bad('scopes named but never varied', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.security = [{ oauth: ['tickets:read', 'tickets:write'] }];
})), {}));
ok('different schemes count as differentiation', g.securityIsDeclaredAndApplied(wrap(clone((d) => {
  d.components.securitySchemes.admin = { type: 'http', scheme: 'bearer' };
  d.paths['/tickets/{ticketId}'].delete.security = [{ admin: [] }];
})), {}));

// Compatibility is oasdiff's verdict now, against the case's own vars.contract.
// The hand-rolled grader it replaces only checked the axes its config listed,
// so a narrowed enum or a removed optional property passed unnoticed.
const baseline = `
openapi: 3.0.3
info: { title: Tickets, version: 1.0.0 }
paths:
  /tickets:
    get:
      parameters:
        - { name: status, in: query, schema: { type: string } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Ticket' } }
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Ticket' }
      responses:
        '201': { description: made }
components:
  schemas:
    Ticket:
      type: object
      required: [subject]
      properties:
        id: { type: string }
        subject: { type: string }
        note: { type: string }
`;
const published = { vars: { contract: baseline } };
const shipped = (mutate) => {
  const doc = {
    openapi: '3.0.3',
    info: { title: 'Tickets', version: '1.0.0' },
    paths: {
      '/tickets': {
        get: {
          parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }],
          responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Ticket' } } } } } },
        },
        post: {
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Ticket' } } } },
          responses: { 201: { description: 'made' } },
        },
      },
    },
    components: { schemas: { Ticket: { type: 'object', required: ['subject'], properties: { id: { type: 'string' }, subject: { type: 'string' }, note: { type: 'string' } } } } },
  };
  if (mutate) mutate(doc);
  return wrap(doc);
};

if (process.env.SKIP_NETWORK_TESTS) {
  console.log('restapi assertions: skipping oasdiff (SKIP_NETWORK_TESTS)');
} else {
  ok('unchanged contract', g.preservesExistingContract(shipped(), published));
  ok('additive property', g.preservesExistingContract(shipped((d) => { d.components.schemas.Ticket.properties.tags = { type: 'array', items: { type: 'string' } }; }), published));
  // Each of these passed the hand-rolled grader because its config named no
  // such axis. oasdiff returns a non-empty array of named rules for all three.
  const removedOptional = g.preservesExistingContract(shipped((d) => { delete d.components.schemas.Ticket.properties.note; }), published);
  bad('removed optional property', removedOptional);
  assert.match(removedOptional.reason, /oasdiff reports \d+ breaking change/);
  assert.match(removedOptional.reason, /[a-z-]+-removed/);
  bad('narrowed to an enum', g.preservesExistingContract(shipped((d) => { d.components.schemas.Ticket.properties.subject = { type: 'string', enum: ['a', 'b'] }; }), published));
  bad('tightened maxLength', g.preservesExistingContract(shipped((d) => { d.components.schemas.Ticket.properties.subject = { type: 'string', maxLength: 10 }; }), published));
  bad('removed operation', g.preservesExistingContract(shipped((d) => { delete d.paths['/tickets'].get; }), published));
  bad('newly required query parameter', g.preservesExistingContract(shipped((d) => { d.paths['/tickets'].get.parameters[0].required = true; }), published));
  bad('no document at all', g.preservesExistingContract('Sorry, I cannot do that.', published));
  assert.throws(() => g.preservesExistingContract(shipped(), {}), /vars.contract/);
}

const reuse = { config: { pattern: 'address', minRefs: 2 } };
bad('single reference', g.reusesSharedSchema(wrap(base), reuse));
ok('two references', g.reusesSharedSchema(wrap(clone((d) => { d.components.schemas.Ticket.properties.billing = { $ref: '#/components/schemas/Address' }; })), reuse));
bad('duplicated definitions', g.reusesSharedSchema(wrap(clone((d) => {
  d.components.schemas.WarehouseAddress = { type: 'object', properties: { street: { type: 'string' } } };
  d.components.schemas.Ticket.properties.billing = { $ref: '#/components/schemas/WarehouseAddress' };
})), reuse));
bad('shape inlined instead of shared', g.reusesSharedSchema(wrap(clone((d) => { delete d.components.schemas.Address; delete d.components.schemas.Ticket.properties.contact; })), reuse));

ok('paginationAndFiltering', g.paginationAndFiltering(wrap(base), { config: { minFilters: 2 } }));
bad('no pagination', g.paginationAndFiltering(wrap(clone((d) => { d.paths['/tickets'].get.parameters = d.paths['/tickets'].get.parameters.slice(1); })), { config: { minFilters: 2 } }));
bad('not enough filters', g.paginationAndFiltering(wrap(base), { config: { minFilters: 5 } }));
bad('sort is not a filter', g.paginationAndFiltering(wrap(clone((d) => {
  d.paths['/tickets'].get.parameters = [{ name: 'limit', in: 'query' }, { name: 'sort', in: 'query' }, { name: 'fields', in: 'query' }];
})), { config: { minFilters: 1 } }));
// Path-level parameters count toward the collection's query surface.
ok('path-level parameters', g.paginationAndFiltering(wrap(clone((d) => {
  d.paths['/tickets'].parameters = [{ name: 'assignee', in: 'query', schema: { type: 'string' } }];
})), { config: { minFilters: 3 } }));

// The date is looked for wherever the operation declares it, not under a
// header name: requiring `Sunset` or `Deprecation` by name pays the skill arm
// for reciting the two RFC numbers SKILL.md hands it.
const sunsetOn = (value) => wrap(clone((d) => {
  const op = d.paths['/tickets/{ticketId}'].delete;
  op.deprecated = true;
  op.responses['204'].headers = { Sunset: value };
}));
const sunset = { config: { path: '/tickets/{ticketId}', date: '2027-01-15' } };
ok('RFC 8594 HTTP-date', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string' }, example: 'Fri, 15 Jan 2027 00:00:00 GMT' }), sunset));
ok('ISO date is also accepted', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string', example: '2027-01-15' } }), sunset));
bad('prose instead of a date', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string' }, example: 'sometime soon, who knows' }), sunset));
bad('a different date', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string' }, example: 'Mon, 15 Feb 2027 00:00:00 GMT' }), sunset));
bad('header declares no value at all', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string' } }), sunset));
// A date in English prose is not a declaration a client can read, and matching
// it would be the one prose regex left in this file.
bad('date only in the header description', g.sunsetDateMatches(sunsetOn({ schema: { type: 'string' }, description: 'Retires Fri, 15 Jan 2027 00:00:00 GMT.' }), sunset));
bad('date only in info.description', g.sunsetDateMatches(wrap(clone((d) => {
  d.info.description = 'Retires 2027-01-15.';
  d.paths['/tickets/{ticketId}'].delete.deprecated = true;
})), sunset));
// Any declaration on the operation counts, whatever it is called.
ok('an x- extension carries it', g.sunsetDateMatches(wrap(clone((d) => {
  d.paths['/tickets/{ticketId}'].delete['x-sunset'] = '2027-01-15';
})), sunset));
ok('a $ref-ed header component carries it', g.sunsetDateMatches(wrap(clone((d) => {
  d.components.headers = { Sunset: { schema: { type: 'string' }, example: 'Fri, 15 Jan 2027 00:00:00 GMT' } };
  d.paths['/tickets/{ticketId}'].delete.responses['204'].headers = { Sunset: { $ref: '#/components/headers/Sunset' } };
})), sunset));

const nested = { config: { suffix: '/articles/{}/comments', methods: ['get', 'post'] } };
const withComments = (prefix) => wrap(clone((d) => {
  d.paths[`${prefix}/articles/{articleId}/comments`] = { get: { responses: { 200: { description: 'ok' } } }, post: { responses: { 201: { description: 'ok' } } } };
  d.paths[`${prefix}/articles/{articleId}/comments/{commentId}`] = { delete: { responses: { 204: { description: 'ok' } } } };
}));
ok('nested under the parent', g.routeHasMethods(withComments(''), nested));
// The quote-anchored regex this replaces failed this exact correct answer.
ok('nested under a version prefix', g.routeHasMethods(withComments('/v1'), nested));
ok('the nested item route carries delete', g.routeHasMethods(withComments(''), { config: { suffix: '/articles/{}/comments/{}', methods: ['delete'] } }));
bad('comments floated to the top level', g.routeHasMethods(wrap(clone((d) => {
  d.paths['/comments'] = { get: { responses: { 200: { description: 'ok' } } } };
})), nested));
// The shape-only version this replaces passed a nested path nobody could post to.
bad('nested path exists but readers cannot post', g.routeHasMethods(wrap(clone((d) => {
  d.paths['/articles/{articleId}/comments'] = { get: { responses: { 200: { description: 'ok' } } } };
})), nested));
// Name-agnostic mode, for the cases where the resource name is the model's to
// choose: any collection route, any item route.
ok('some collection carries get + post', g.routeHasMethods(wrap(base), { config: { kind: 'collection', methods: ['get', 'post'] } }));
bad('no item route is readable or editable', g.routeHasMethods(wrap(base), { config: { kind: 'item', methods: ['get', 'put|patch'] } }));
ok('either alternative satisfies put|patch', g.routeHasMethods(wrap(clone((d) => {
  d.paths['/tickets/{ticketId}'].get = { responses: { 200: { description: 'ok' }, 404: { description: 'no' } } };
  d.paths['/tickets/{ticketId}'].patch = { responses: { 200: { description: 'ok' }, 404: { description: 'no' } } };
})), { config: { kind: 'item', methods: ['get', 'put|patch'] } }));

// deprecatedOperation replaces an is-json shape check that named the method:
// the retirement is announced wherever the path declares it, not deleted.
const retiring = { config: { path: '/tickets/{ticketId}' } };
ok('deprecated flag on the path', g.deprecatedOperation(wrap(clone((d) => {
  d.paths['/tickets/{ticketId}'].delete.deprecated = true;
})), retiring));
bad('path still there but nothing marked', g.deprecatedOperation(wrap(base), retiring));
bad('retirement performed by deleting the path', g.deprecatedOperation(wrap(clone((d) => {
  delete d.paths['/tickets/{ticketId}'];
})), retiring));

// declaresProperties reads names out of the parsed schemas. Patterns are
// anchored wherever a name already in the case's baseline would collide -
// unanchored /code/ matches postalCode and passes for free.
ok('declared property matches', g.declaresProperties(wrap(base), { config: { properties: ['^subject$'] } }));
bad('required property is absent', g.declaresProperties(wrap(base), { config: { properties: ['^shipments$'] } }));
const postal = clone((d) => { d.components.schemas.Address.properties.postalCode = { type: 'string' }; });
bad('postalCode is not a short code', g.declaresProperties(wrap(postal), { config: { properties: ['^(code|short_?code)$'] } }));
ok('the real short code is', g.declaresProperties(wrap(clone((d) => {
  d.components.schemas.Address.properties.postalCode = { type: 'string' };
  d.components.schemas.Warehouse = { type: 'object', properties: { shortCode: { type: 'string' } } };
})), { config: { properties: ['^(code|short_?code)$'] } }));
// Every pattern has to match something; one hit out of two is not enough.
bad('only one of two patterns matches', g.declaresProperties(wrap(base), { config: { properties: ['^subject$', '^cursor$'] } }));

// The merged metric. Eight metrics carried by one case each are now one metric
// across eleven, so what used to be a metric is now a per-case requirement, and
// a case scores the fraction of its own requirements met rather than one bit.
const requiring = (requirements) => ({ config: { requirements } });
const crud = [
  { check: 'routeHasMethods', kind: 'collection', methods: ['get', 'post'] },
  { check: 'routeHasMethods', kind: 'item', methods: ['get', 'put|patch'] },
];
const half = g.contractRequirements(wrap(base), requiring(crud));
assert.strictEqual(half.score, 0.5, `half-met case should score 0.5, got ${half.score}`);
assert.ok(!half.pass, 'a half-met case still fails its assertion');
assert.match(half.reason, /1\/2 stated requirement/);
assert.match(half.reason, /routeHasMethods: UNMET/);
const editable = clone((d) => {
  d.paths['/tickets/{ticketId}'].get = { responses: { 200: { description: 'ok' }, 404: { description: 'no' } } };
  d.paths['/tickets/{ticketId}'].patch = { responses: { 200: { description: 'ok' }, 404: { description: 'no' } } };
});
assert.strictEqual(g.contractRequirements(wrap(editable), requiring(crud)).score, 1);
ok('all requirements met', g.contractRequirements(wrap(editable), requiring(crud)));
// The per-case config has to reach the check it configures - the whole point of
// the merge is that eleven cases share one grader without sharing one rulebook.
ok('case config reaches the check', g.contractRequirements(wrap(base), requiring([{ check: 'paginationAndFiltering', minFilters: 2 }])));
bad('a stricter case config is not ignored', g.contractRequirements(wrap(base), requiring([{ check: 'paginationAndFiltering', minFilters: 5 }])));
// Mixed kinds of check in one list, and a document that meets neither.
const mixed = requiring([
  { check: 'asyncWorkIsPollable' },
  { check: 'sunsetDateMatches', path: '/exports', date: '2026-01-01' },
]);
assert.strictEqual(g.contractRequirements(wrap(base), mixed).score, 0);
// A misconfigured case must throw, not score 0: a silent zero is
// indistinguishable from a model that failed every requirement.
assert.throws(() => g.contractRequirements(wrap(base), requiring([])), /non-empty config.requirements/);
assert.throws(() => g.contractRequirements(wrap(base), { config: {} }), /non-empty config.requirements/);
assert.throws(() => g.contractRequirements(wrap(base), requiring([{ check: 'notAThing' }])), /no check named "notAThing"/);

const withExport = (mutate) => wrap(clone((d) => {
  d.paths['/exports'] = { post: { responses: { 202: { description: 'accepted' }, 401: { description: 'no' } } } };
  d.paths['/exports/{exportId}'] = { get: { responses: { 200: { description: 'status' }, 404: { description: 'no' } } } };
  if (mutate) mutate(d);
}));
ok('202 plus a pollable resource', g.asyncWorkIsPollable(withExport()));
// RFC 9110 s15.3.3 mandates no status code, so a start operation that hands back
// a job resource with a 200 is conformant and has to pass. Before this widening
// it scored 0.
ok('200 carrying a status monitor plus a pollable resource', g.asyncWorkIsPollable(withExport((d) => {
  d.paths['/exports'].post.responses = { 200: { description: 'started', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExportJob' } } } } };
  d.components = { schemas: { ExportJob: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, percentComplete: { type: 'integer' } } } } };
})));
bad('neither a 202 nor a status monitor', g.asyncWorkIsPollable(withExport((d) => {
  d.paths['/exports'].post.responses = { 200: { description: 'the finished file', content: { 'application/json': { schema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'string' } } } } } } } };
})));
bad('202 with nothing to poll', g.asyncWorkIsPollable(wrap({
  openapi: '3.1.0',
  info: { title: 'Exports', version: '1.0.0' },
  paths: { '/exports': { post: { responses: { 202: { description: 'accepted' } } } } },
})));
// A 202 named only in prose is not a declared response.
bad('202 only in a description', g.asyncWorkIsPollable(withExport((d) => {
  d.paths['/exports'].post.responses = { 200: { description: 'Returns 202 while the export runs.' } };
})));

// The suite's own metric surface, read with the same parser the graders use. A
// check name typo or a headless assertion otherwise surfaces mid-run, after the
// model calls have been paid for, and `validate config` reports neither.
if (process.env.SKIP_NETWORK_TESTS) {
  console.log('restapi assertions: skipping the tests/cases.yaml audit (SKIP_NETWORK_TESTS)');
} else {
  const cases = g.parseYamlFile(path.join(__dirname, '..', 'tests', 'cases.yaml'));
  const carriedBy = new Map();
  for (const testCase of cases) {
    const where = testCase.description;
    assert.ok(where, 'every case needs a description');
    assert.ok(Array.isArray(testCase.assert) && testCase.assert.length, `${where}: assert is empty or null`);
    for (const assertion of testCase.assert) {
      // `latency` is the one deliberate headless assertion: a ceiling that
      // fails a row, not a score anyone averages.
      if (assertion.type !== 'latency') assert.ok(assertion.metric, `${where}: headless ${assertion.type} assertion`);
      if (assertion.metric) carriedBy.set(assertion.metric, (carriedBy.get(assertion.metric) || new Set()).add(where));
      if (typeof assertion.value === 'string' && assertion.value.startsWith('file://')) {
        const fn = assertion.value.split(':').pop();
        assert.strictEqual(typeof g[fn], 'function', `${where}: ${assertion.value} does not resolve to an export`);
      }
      if (typeof assertion.value === 'string' && assertion.type === 'llm-rubric') {
        assert.match(assertion.value.toLowerCase(), /score from 0 to 1, never above 1/, `${where}: rubric is missing the 0-to-1 clause`);
      }
      if (assertion.metric !== 'contract_requirements') continue;
      const requirements = (assertion.config || {}).requirements || [];
      assert.ok(requirements.length, `${where}: contract_requirements with no requirements`);
      for (const requirement of requirements) {
        assert.ok(g.CHECKS[requirement.check], `${where}: no check named "${requirement.check}"`);
      }
    }
  }
  // The rule this suite was restructured around: a metric on fewer than five
  // cases moved sd 0.37 across identical runs and swung +0.50 to -0.50.
  for (const [metric, seen] of carriedBy) {
    assert.ok(seen.size >= 5, `${metric} is carried by ${seen.size} case(s); under five, no delta survives run-to-run variance`);
  }
  console.log(`restapi assertions: ${cases.length} cases, ${carriedBy.size} metrics, smallest n=${Math.min(...[...carriedBy.values()].map((s) => s.size))}`);
}

console.log('restapi assertions: ok');
