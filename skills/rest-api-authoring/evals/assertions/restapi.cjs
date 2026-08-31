// Only the graders that a JSON Schema cannot express live here. Everything that
// is a pure shape check on the emitted document is an `is-json` assertion in the
// config instead; each of these needs a lexicon, a cross-reference, a count, or
// an external diff against the baseline the case supplied.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { fenceBlocks } = require('../../../../evals/lib/strip-reasoning.js');

const REDOCLY = process.env.REDOCLY_PACKAGE || '@redocly/cli@2.47.0';
const YAML = process.env.YAML_PACKAGE || 'js-yaml@4.1.0';
// Not the bare `oasdiff` name on npm - that is a 0.0.1-security placeholder.
const OASDIFF = process.env.OASDIFF_PACKAGE || '@oasdiff-js/oasdiff-js@1.0.0';

// npx reaching for the registry is the failure mode that scores a whole run
// zero while reporting success: `contract_valid` is a defaultTest assertion, so
// one outage zeroes the metric for every row in both arms. A tool that could
// not run is not a verdict, so this throws and the row errors instead.
const NPM_FAILURE = /npm error|npm ERR!|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET/;

function runTool(label, args, timeout = 180000) {
  const run = spawnSync('npx', args, { encoding: 'utf8', timeout });
  if (run.error) throw new Error(`${label} could not run: ${run.error.message}`);
  if (run.status !== 0 && NPM_FAILURE.test(`${run.stderr || ''}`)) {
    throw new Error(`${label} could not run: ${`${run.stderr}`.trim().slice(0, 400)}`);
  }
  return run;
}

// One parse and one lint per unique document, shared by every grader on the case.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-openapi-'));
const parsed = new Map();
const lints = new Map();

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

// All of them, not the first: source() below picks the block by its content, so
// an example request body emitted ahead of the contract must not shadow it.
// Shared with every other suite's extractor - a non-greedy regex here would end
// the document at a fence nested inside it (evals/AGENTS.md).
function fences(output) {
  return fenceBlocks(String(output), /^(?:ya?ml|json|openapi)?$/i).map((block) => block.body.trim());
}

const isSpec = (text) => /^\s*['"]?openapi['"]?\s*[:=]\s*['"]?3\./m.test(text);

// The document is whichever fenced block declares an OpenAPI version; falls back
// to the raw output so a model that skips the fence is still graded on content.
function source(output) {
  const text = String(output);
  return fences(text).find(isSpec) || (isSpec(text) ? text.trim() : null);
}

function specFile(text) {
  const key = crypto.createHash('sha1').update(text).digest('hex');
  const file = path.join(workDir, `${key}.${text.startsWith('{') ? 'json' : 'yaml'}`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, text);
  return { key, file };
}

// JSON parses in-process; YAML goes through js-yaml's CLI. Deliberately not
// `redocly bundle`: a bundler refuses to emit anything when a single $ref
// dangles, which is an ordinary model slip, and the resulting fallback made
// every downstream assertion read YAML through JSON-shaped regexes.
function loadSpec(output) {
  const text = source(output);
  if (!text) return { ok: false, error: 'No fenced OpenAPI document found in the output.' };
  const { key, file } = specFile(text);
  if (parsed.has(key)) return parsed.get(key);

  let outcome;
  if (text.startsWith('{')) {
    try {
      outcome = { ok: true, doc: JSON.parse(text) };
    } catch (error) {
      outcome = { ok: false, error: `JSON did not parse: ${error.message}` };
    }
  } else {
    const run = runTool('YAML parser', ['-y', YAML, file]);
    outcome = run.status !== 0
      ? { ok: false, error: `YAML did not parse: ${`${run.stderr || run.stdout}`.trim().slice(0, 400)}` }
      : { ok: true, doc: JSON.parse(run.stdout) };
  }
  parsed.set(key, outcome);
  return outcome;
}

// defaultTest transform. The gateway leaks reasoning as message content, so the
// document is pulled out of it and normalised to JSON; every native `is-json`,
// `regex`, and `contains-all` assertion then runs against the contract itself.
// Anything that cannot be recovered is passed through untouched so the failure
// surfaces as an assertion failure rather than a harness error.
function normalizeToJson(output) {
  const text = String(output);
  // No document at all is a legitimate answer for a case whose right answer is
  // to push back, so it fails the assertions rather than erroring the row. The
  // sentinel keeps it from matching any quote-anchored regex.
  if (!source(text)) return `NO OPENAPI DOCUMENT IN OUTPUT\n\n${text}`;
  const spec = loadSpec(text);
  // A document that will not parse cannot be graded by anything downstream.
  // Throwing surfaces it as a harness error instead of six false negatives.
  if (!spec.ok) throw new Error(`normalizeToJson could not parse the emitted document: ${spec.error}`);
  return JSON.stringify(spec.doc, null, 2);
}

// js-yaml's CLI again, so the offline self-test can read tests/cases.yaml with
// the same parser the graders use. Deliberately throwing rather than returning
// a verdict: this one is called on a file that is part of the suite, so a
// failure to read it is a bug in the suite, not a property of a model's output.
function parseYamlFile(file) {
  const run = runTool('YAML parser', ['-y', YAML, file]);
  if (run.status !== 0) throw new Error(`YAML did not parse: ${`${run.stderr || run.stdout}`.trim().slice(0, 400)}`);
  return JSON.parse(run.stdout);
}

function lintSpec(output) {
  const text = source(output);
  if (!text) return { ok: false, error: 'No fenced OpenAPI document found in the output.' };
  const { key, file } = specFile(text);
  if (lints.has(key)) return lints.get(key);
  // `minimal` keeps the structural rules (struct, no-unresolved-refs) as errors
  // and demotes house-style opinions to warnings, so this grades validity, not taste.
  const run = runTool('redocly lint', ['-y', REDOCLY, 'lint', '--extends=minimal', file]);
  const outcome = run.status === 0
    ? { ok: true }
    // Redocly prints errors before warnings, so the head is the useful end.
    : { ok: false, error: `${run.stdout || run.stderr || 'unknown lint failure'}`.trim().slice(0, 800) };
  lints.set(key, outcome);
  return outcome;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function operations(doc) {
  const found = [];
  for (const [route, item] of Object.entries(doc?.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of METHODS) {
      if (item[method] && typeof item[method] === 'object') found.push({ route, method, item, op: item[method] });
    }
  }
  return found;
}

function normalise(route) {
  return String(route).replace(/\{[^}]*\}/g, '{}');
}

function segments(route) {
  return route.split('/').filter(Boolean);
}

function deref(doc, node) {
  let current = node;
  for (let hops = 0; current && current.$ref && hops < 8; hops += 1) {
    const target = String(current.$ref).replace(/^#\//, '').split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    current = target.reduce((acc, part) => (acc == null ? acc : acc[part]), doc);
  }
  return current || {};
}

function withSpec(output, grader) {
  const spec = loadSpec(output);
  if (!spec.ok) return result(false, spec.error);
  return grader(spec.doc);
}

// --- graders -----------------------------------------------------------------

// Claim: "validation". The one place a real external tool is the right answer.
function validatesAsOpenApi(output) {
  const lint = lintSpec(output);
  return result(lint.ok, lint.ok ? `Validated with redocly lint (${REDOCLY}, minimal ruleset).` : `Did not validate: ${lint.error}`);
}

// Segments that would read as a verb if they named a collection. `search` and
// friends are left out: they are defensible resource names.
const VERBS = /^(get|list|fetch|retrieve|read|create|make|add|new|update|edit|modify|set|delete|remove|destroy|do|perform|execute|process|handle|manage|calculate|send)([-_]|[A-Z]|$)/;
const IRREGULAR = new Set(['people', 'children', 'media', 'data', 'criteria', 'staff', 'inventory', 'me', 'search', 'audit']);

// Claim: "resource modeling". Needs a verb lexicon and irregular plurals, so it
// stays in JS rather than becoming an unreadable path-key regex.
function resourcePathsAreNouns(output) {
  return withSpec(output, (doc) => {
    const routes = Object.keys(doc?.paths || {});
    if (!routes.length) return result(false, 'Document declares no paths.');
    const problems = [];
    for (const route of routes) {
      const parts = segments(route).filter((part) => !/^v\d+$/i.test(part));
      const first = parts.find((part) => !part.startsWith('{'));
      if (first && VERBS.test(first)) problems.push(`${route} starts with the verb "${first}"`);
      parts.forEach((part, index) => {
        // A segment followed by an identifier is a collection: it must read
        // plural. A trailing segment is exempt - it may be a named action.
        if (part.startsWith('{') || !parts[index + 1]?.startsWith('{')) return;
        if (VERBS.test(part)) problems.push(`${route} uses the verb "${part}" as a collection`);
        const word = part.toLowerCase().split(/[-_]/).pop();
        if (!word.endsWith('s') && !IRREGULAR.has(word)) problems.push(`${route} has the singular collection "${part}"`);
      });
    }
    return result(!problems.length, problems.length ? problems.join('; ') + '.' : `All ${routes.length} path(s) are noun-shaped with plural collections.`);
  });
}

// Claim: "security". Resolves root-level requirements against per-operation
// overrides, checks that every requirement name actually resolves, and treats
// an empty requirement object as the hole it is - none of which a single
// document shape check can express.
function securityIsDeclaredAndApplied(output, context) {
  const requireScopes = config(context).requireScopes !== false;
  return withSpec(output, (doc) => {
    const names = Object.keys(doc.components?.securitySchemes || {});
    if (!names.length) return result(false, 'No security scheme is declared under components.securitySchemes.');

    const all = operations(doc);
    if (!all.length) return result(false, 'Document declares no operations.');
    const effective = (entry) => (Array.isArray(entry.op.security) ? entry.op.security : doc.security) || [];

    const problems = [];
    for (const entry of all) {
      const where = `${entry.method.toUpperCase()} ${entry.route}`;
      const requirements = effective(entry);
      if (!requirements.length) {
        problems.push(`${where} is unguarded`);
        continue;
      }
      // OAS 3.1.1: an empty Security Requirement Object makes authentication
      // optional, so an anonymous caller is allowed through.
      if (requirements.some((requirement) => !requirement || !Object.keys(requirement).length)) {
        problems.push(`${where} lists an empty security requirement, so anonymous callers are admitted`);
        continue;
      }
      // OAS 3.1.1: each name "MUST correspond to a security scheme declared in
      // securitySchemes". Redocly's minimal ruleset demotes this to a warning.
      const dangling = [...new Set(requirements.flatMap((requirement) => Object.keys(requirement)))].filter((name) => !names.includes(name));
      if (dangling.length) problems.push(`${where} names the undeclared scheme(s) ${dangling.join(', ')}`);
    }
    if (problems.length) return result(false, `${problems.join('; ')}.`);
    if (!requireScopes) return result(true, `${names.length} security scheme(s) declared and applied to all ${all.length} operation(s).`);

    // "Differentiated by privilege" is a comparison between operations, not a
    // property of any one of them: identical requirements everywhere means one
    // privilege level however many scopes it names.
    const signature = (entry) => JSON.stringify(effective(entry)
      .map((requirement) => Object.entries(requirement).map(([name, scopes]) => `${name}:${[...(scopes || [])].sort().join(',')}`).sort())
      .sort());
    const distinct = new Set(all.map(signature));
    return result(distinct.size > 1, distinct.size > 1
      ? `The ${all.length} operation(s) carry ${distinct.size} distinct privilege requirement(s).`
      : `All ${all.length} operation(s) carry the identical security requirement, so none is differentiated by privilege.`);
  });
}

// Claims: "compatibility", "versioning". oasdiff decides this, not a list of
// axes an eval author thought to pre-declare: the hand-rolled version passed a
// narrowed enum, a removed optional field and a tightened maxLength because
// nothing in the config named them. Baseline is the case's own `vars.contract`.
function baselineFile(text) {
  const key = crypto.createHash('sha1').update(text).digest('hex');
  const file = path.join(workDir, `baseline-${key}.yaml`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, text);
  return file;
}

function preservesExistingContract(output, context) {
  const baseline = context?.vars?.contract;
  if (!baseline) throw new Error('preservesExistingContract needs the published baseline in vars.contract.');
  const text = source(output);
  if (!text) return result(false, 'No fenced OpenAPI document found in the output.');

  const run = runTool('oasdiff', ['-y', OASDIFF, 'breaking', baselineFile(baseline), specFile(text).file, '--format', 'json']);
  let findings;
  try {
    findings = JSON.parse(run.stdout);
  } catch {
    findings = null;
  }
  if (!Array.isArray(findings)) {
    const detail = `${run.stderr || run.stdout || 'no output'}`.trim().slice(0, 400);
    // oasdiff refusing to load the emitted document is a verdict on the
    // document; anything else at this point is the tool itself misbehaving.
    if (run.status !== 0) return result(false, `oasdiff could not diff the emitted document: ${detail}`);
    throw new Error(`oasdiff returned no JSON array: ${detail}`);
  }
  const rules = [...new Set(findings.map((finding) => `${finding.id} (${finding.operation || ''} ${finding.path || ''})`.trim()))];
  return result(findings.length === 0, findings.length
    ? `oasdiff reports ${findings.length} breaking change(s): ${rules.join('; ')}.`
    : `oasdiff reports no breaking change against the published contract (${OASDIFF}).`);
}

// Claim: "schema composition". Counting $refs and detecting a near-duplicate
// definition is arithmetic over the whole document, not a shape constraint.
function reusesSharedSchema(output, context) {
  const { pattern, minRefs = 2, maxDefinitions = 1 } = config(context);
  const matcher = new RegExp(pattern, 'i');
  return withSpec(output, (doc) => {
    const names = Object.keys(doc.components?.schemas || {}).filter((name) => matcher.test(name));
    if (!names.length) return result(false, `No shared schema matching /${pattern}/i is defined under components.schemas.`);
    if (names.length > maxDefinitions) return result(false, `The shape is duplicated across ${names.length} schemas: ${names.join(', ')}.`);
    const body = JSON.stringify(doc);
    const refs = names.reduce((sum, name) => sum + (body.match(new RegExp(`"#/components/schemas/${name}"`, 'g')) || []).length, 0);
    return result(refs >= minRefs, refs >= minRefs
      ? `${names[0]} is defined once and referenced ${refs} time(s).`
      : `${names[0]} is referenced only ${refs} time(s); expected at least ${minRefs}, so the shape was likely inlined instead of reused.`);
  });
}

const PAGINATION = /^(page|per[-_]?page|page[-_]?size|limit|offset|cursor|size|count|after|before|start[-_]?(after|key)?|next)$/i;
const NON_FILTER = /^(sort|sort[-_]?by|order|order[-_]?by|fields|expand|include|embed|format|q)$/i;

// Claim: "resource modeling" - a collection is a queryable resource, not a dump.
// The path key is model-chosen and the parameters are split between the path
// item and the operation, so this counts across a merged array in JS.
function paginationAndFiltering(output, context) {
  const minFilters = Number(config(context).minFilters || 2);
  return withSpec(output, (doc) => {
    const collections = operations(doc).filter((entry) => entry.method === 'get' && !segments(entry.route).pop()?.startsWith('{'));
    if (!collections.length) return result(false, 'No collection GET operation found.');
    const summaries = [];
    for (const entry of collections) {
      const params = [...(entry.item.parameters || []), ...(entry.op.parameters || [])]
        .map((param) => deref(doc, param))
        .filter((param) => param.in === 'query')
        .map((param) => param.name || '');
      const paging = params.filter((name) => PAGINATION.test(name));
      const filters = params.filter((name) => !PAGINATION.test(name) && !NON_FILTER.test(name));
      if (paging.length >= 1 && filters.length >= minFilters) {
        return result(true, `GET ${entry.route} pages by ${paging.join(', ')} and filters by ${filters.join(', ')}.`);
      }
      summaries.push(`GET ${entry.route}: ${paging.length} pagination param(s), ${filters.length} filter param(s)`);
    }
    return result(false, `No collection supports pagination plus at least ${minFilters} filters. ${summaries.join('; ')}.`);
  });
}

// RFC 8594 puts the retirement date in an HTTP-date, so a substring match on
// ISO text punishes correct output. This reads whatever the operation declares
// and parses it as a date.
const DATE_SHAPES = /[A-Z][a-z]{2},\s*\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}(?:\s+\d{2}:\d{2}:\d{2}\s*(?:GMT|UTC)?)?|\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]*)?/g;

// Every declared string value in a subtree, $refs followed. `description` and
// `summary` are skipped: a date found in English prose is pattern-matching, not
// a declaration a client can read.
function declaredStrings(doc, node, out = [], depth = 0) {
  if (node == null || depth > 12) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((value) => declaredStrings(doc, value, out, depth + 1));
  else if (typeof node === 'object') {
    if (node.$ref) return declaredStrings(doc, deref(doc, node), out, depth + 1);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'description' || key === 'summary') continue;
      declaredStrings(doc, value, out, depth + 1);
    }
  }
  return out;
}

// Claim: "deprecation". The date comes from the prompt, so this computes
// against input. It is deliberately not keyed on a header name: requiring
// `Sunset` or `Deprecation` pays the skill arm for reciting SKILL.md, and
// RFC 8594 is Informational anyway.
function sunsetDateMatches(output, context) {
  const { path: route, date } = config(context);
  return withSpec(output, (doc) => {
    const entry = Object.entries(doc.paths || {}).find(([candidate]) => normalise(candidate) === normalise(route));
    if (!entry) return result(false, `${route} is not in the document.`);

    const candidates = METHODS.filter((method) => entry[1][method]).flatMap((method) => declaredStrings(doc, entry[1][method]));
    const found = candidates.flatMap((value) => value.match(DATE_SHAPES) || []);
    const parsed = found.map((text) => [text, Date.parse(text)]).filter(([, time]) => !Number.isNaN(time));
    const hit = parsed.find(([, time]) => new Date(time).toISOString().slice(0, 10) === date);
    return result(Boolean(hit), hit
      ? `${route} declares the retirement date ${date} as "${hit[0]}".`
      : `Nothing declared on ${route} yields ${date}, so a caller cannot learn the retirement date from the contract.`);
  });
}

// Claims: "resource modeling", "method semantics" - the case states which
// operations have to exist. `suffix` pins a path shape, matched over the parsed
// path keys so a correct answer under a version prefix still passes; `kind`
// matches any collection or item route, for cases that leave the resource name
// to the model. A method entry may name alternatives: 'put|patch'.
function routeHasMethods(output, context) {
  const { suffix, kind = 'collection', methods = [] } = config(context);
  return withSpec(output, (doc) => {
    const routes = Object.keys(doc.paths || {}).filter((route) => doc.paths[route] && typeof doc.paths[route] === 'object');
    if (!routes.length) return result(false, 'Document declares no paths.');
    const candidates = routes.filter((route) => {
      const shape = normalise(route);
      if (suffix) return shape.endsWith(suffix);
      return (segments(shape).pop() === '{}') === (kind === 'item');
    });
    const label = suffix || `${kind} route`;
    if (!candidates.length) return result(false, `No path is shaped like ${label}; the document declares ${JSON.stringify(routes)}.`);
    const wanted = methods.map((entry) => String(entry).split('|'));
    const hit = candidates.find((route) => wanted.every((alternatives) => alternatives.some((method) => doc.paths[route][method])));
    const declared = (route) => METHODS.filter((method) => doc.paths[route][method]).join(', ') || 'no operations';
    return result(Boolean(hit), hit
      ? `${hit} declares ${methods.join(' + ')}.`
      : `No ${label} declares ${methods.join(' + ')}: ${candidates.map((route) => `${route} has ${declared(route)}`).join('; ')}.`);
  });
}

// Claim: "deprecation" - a retirement is announced on the operation, not
// performed by deleting it. Any method on the path may carry the flag.
function deprecatedOperation(output, context) {
  const { path: route } = config(context);
  return withSpec(output, (doc) => {
    const entry = Object.entries(doc.paths || {}).find(([candidate]) => normalise(candidate) === normalise(route));
    if (!entry) return result(false, `${route} is gone from the document, so its retirement was performed by deletion rather than announced.`);
    const flagged = METHODS.filter((method) => entry[1][method] && entry[1][method].deprecated === true);
    return result(flagged.length > 0, flagged.length
      ? `${route} still exists and declares deprecated: true on ${flagged.join(', ')}.`
      : `${route} still exists but nothing on it is marked deprecated, so a caller cannot learn it is retiring.`);
  });
}

// Every name declared under a `properties` object. $refs are followed, so this
// is correct over a subtree and not only over the whole document: a response
// whose schema is a single `$ref` declares the target's properties. Schema
// property names are machine readable syntax, so a pattern over them is not
// prose matching - but a case anchors its patterns wherever a name already in
// its baseline would collide.
function declaredPropertyNames(doc, node, out = new Set(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 14) return out;
  if (Array.isArray(node)) {
    node.forEach((value) => declaredPropertyNames(doc, value, out, depth + 1));
    return out;
  }
  if (node.$ref) return declaredPropertyNames(doc, deref(doc, node), out, depth + 1);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(value).forEach((name) => out.add(name));
    }
    declaredPropertyNames(doc, value, out, depth + 1);
  }
  return out;
}

// Claim: "schema composition" - the case names a concept the body has to carry.
function declaresProperties(output, context) {
  const patterns = config(context).properties || [];
  return withSpec(output, (doc) => {
    const names = [...declaredPropertyNames(doc, doc)];
    const missing = patterns.filter((pattern) => !names.some((name) => new RegExp(pattern, 'i').test(name)));
    return result(!missing.length, missing.length
      ? `No declared property matches ${missing.map((pattern) => `/${pattern}/i`).join(' or ')}; the document declares ${JSON.stringify(names.slice(0, 40))}.`
      : `Declared properties cover ${patterns.map((pattern) => `/${pattern}/i`).join(', ')}.`);
  });
}

// Claim: "method semantics". RFC 9110 s15.3.3 mandates nothing - it has no
// MUST in it and says the 202 response "is intentionally noncommittal" - so
// requiring a 202 failed a conformant contract that starts the work and hands
// back a job resource with a 200 (measured: 0). What the section does say is
// that the response "ought to describe the request's current status and point
// to (or embed) a status monitor", and that is what this grades: the work is
// started by a write, and its outcome is readable afterwards from a separate
// resource. 202 satisfies the first half on its own; any other success code
// has to carry a status monitor in its own representation to say the same.
const STATUS_MONITOR = /^(status|state|phase|progress|percent|completed|finished|done|result|outcome)/i;

function startsAsyncWork(doc, entry) {
  const codes = Object.keys(entry.op.responses || {});
  if (codes.includes('202')) return '202';
  const monitored = codes.filter((code) => /^2\d\d$/.test(code) && [...declaredPropertyNames(doc, entry.op.responses[code])].some((name) => STATUS_MONITOR.test(name)));
  return monitored.length ? `${monitored[0]} carrying a status monitor` : null;
}

function asyncWorkIsPollable(output) {
  return withSpec(output, (doc) => {
    const all = operations(doc);
    const started = all.map((entry) => [entry, entry.method === 'get' ? null : startsAsyncWork(doc, entry)]).filter(([, how]) => how);
    if (!started.length) {
      return result(false, 'No non-GET operation returns 202 or a success response describing the work\'s status, so the contract claims the work finishes within the request.');
    }
    const [entry, how] = started[0];
    const routes = new Set(started.map(([candidate]) => normalise(candidate.route)));
    const readable = all.filter((candidate) => candidate.method === 'get' && !routes.has(normalise(candidate.route)));
    return result(readable.length > 0, readable.length
      ? `${entry.method.toUpperCase()} ${entry.route} returns ${how} and ${readable.map((e) => `GET ${e.route}`).join(', ')} is readable separately.`
      : `${entry.method.toUpperCase()} ${entry.route} returns ${how} but no separate resource is readable, so the caller has nothing to poll.`);
  });
}

// One metric, configured per case. Eight of these checks used to be a metric of
// their own carried by a single case, which no delta can survive: a metric on
// fewer than five cases moved sd 0.37 across identical runs and swung +0.50 to
// -0.50. They ask one question - does the emitted contract satisfy the
// requirements this case stated - so they are one metric, and the case supplies
// which checks its own requirements amount to. The score is the fraction met,
// so a case contributes a graded row rather than a single bit.
const CHECKS = {
  asyncWorkIsPollable,
  declaresProperties,
  deprecatedOperation,
  paginationAndFiltering,
  reusesSharedSchema,
  routeHasMethods,
  securityIsDeclaredAndApplied,
  sunsetDateMatches,
};

function contractRequirements(output, context) {
  const requirements = config(context).requirements;
  if (!Array.isArray(requirements) || !requirements.length) {
    throw new Error('contractRequirements needs a non-empty config.requirements list naming this case\'s stated requirements.');
  }
  const graded = requirements.map((requirement) => {
    const check = CHECKS[requirement.check];
    if (!check) throw new Error(`contractRequirements: no check named "${requirement.check}". Known: ${Object.keys(CHECKS).join(', ')}.`);
    return { name: requirement.check, ...check(output, { ...context, config: requirement }) };
  });
  const met = graded.filter((entry) => entry.pass);
  return {
    pass: met.length === graded.length,
    score: met.length / graded.length,
    reason: `${met.length}/${graded.length} stated requirement(s) met. ${graded.map((entry) => `${entry.name}: ${entry.pass ? 'met' : 'UNMET'} - ${entry.reason}`).join(' | ')}`,
  };
}

module.exports = {
  CHECKS,
  asyncWorkIsPollable,
  contractRequirements,
  declaresProperties,
  deprecatedOperation,
  normalizeToJson,
  paginationAndFiltering,
  parseYamlFile,
  preservesExistingContract,
  resourcePathsAreNouns,
  reusesSharedSchema,
  routeHasMethods,
  securityIsDeclaredAndApplied,
  // exported for the self-test
  source,
  sunsetDateMatches,
  validatesAsOpenApi,
};
