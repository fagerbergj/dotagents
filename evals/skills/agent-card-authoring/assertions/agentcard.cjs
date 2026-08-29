// Graders for agent-card-authoring. The primary check (`contract_shape`, wired in
// promptfooconfig.yaml/tests/cases.yaml as a native `is-json` assertion against
// assertions/agent-card.schema.json) is a real ajv validation against the actual
// published A2A AgentCard schema - see build-schema.py for its provenance. Only
// checks that schema cannot express - computed against the case's own input -
// live here.
const fs = require('node:fs');

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

function fences(output) {
  return [...String(output).matchAll(/```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)```/gi)].map((m) => m[1].trim());
}

// An agent card is always JSON (never YAML) per the A2A spec, so unlike
// rest-api-authoring's dual-format source(), this only needs to recognize a
// JSON object that plausibly is one - name/skills/securitySchemes are the
// fields no other artifact a model would emit for this task shares.
function looksLikeCard(text) {
  if (!text.startsWith('{')) return false;
  try {
    const obj = JSON.parse(text);
    return Boolean(obj) && typeof obj === 'object' && !Array.isArray(obj)
      && ('skills' in obj || 'name' in obj || 'securitySchemes' in obj);
  } catch {
    return false;
  }
}

function source(output) {
  const text = String(output);
  const fenced = fences(text).find(looksLikeCard);
  if (fenced) return fenced;
  const trimmed = text.trim();
  return looksLikeCard(trimmed) ? trimmed : null;
}

// Transform for `contract_shape` ONLY - native `is-json` cannot see past the
// prose around a card, so that one assertion needs the card alone. It must not
// go back on defaultTest: as a suite-wide transform it also fed no_fabrication,
// whose rubric asks whether the reply "asks what the missing piece actually is
// or explicitly marks the skeleton as placeholder" - and that answer is the
// prose this throws away. Same class as the fence truncation in evals/AGENTS.md:
// a transform discarding the evidence a grader was written to read.
function normalizeToJson(output) {
  const text = String(output);
  const src = source(text);
  if (!src) return `NO AGENT CARD JSON IN OUTPUT\n\n${text}`;
  let doc;
  try {
    doc = JSON.parse(src);
  } catch (error) {
    throw new Error(`normalizeToJson could not parse the emitted agent card: ${error.message}`);
  }
  return JSON.stringify(doc, null, 2);
}

// Extracts the card itself, so these graders read the raw reply rather than
// depending on a suite-wide transform having pre-stripped it (see
// normalizeToJson). A reply with no card fails here, same as before.
function withDoc(output, grader) {
  const src = source(output);
  if (!src) return result(false, 'No agent card JSON found in the output.');
  let doc;
  try {
    doc = JSON.parse(src);
  } catch (error) {
    return result(false, `Output is not parseable JSON: ${error.message}`);
  }
  return grader(doc);
}

// Claim: capability flags reflect the deployment, not aspiration. A2A v1.0.1
// spec.md s3.3.2 makes each flag load-bearing at runtime (see the citation in
// tests/cases.yaml), so declaring one wrong is not cosmetic - it changes what
// error a real client gets back. `null` in config means "the case doesn't
// state this one" and the flag is left ungraded.
function capabilitiesMatch(output, context) {
  const { streaming = null, pushNotifications = null } = config(context);
  return withDoc(output, (doc) => {
    const caps = doc.capabilities || {};
    const problems = [];
    if (streaming !== null && Boolean(caps.streaming) !== streaming) {
      problems.push(`capabilities.streaming is ${JSON.stringify(caps.streaming)}, the brief says it should be ${streaming}`);
    }
    if (pushNotifications !== null && Boolean(caps.pushNotifications) !== pushNotifications) {
      problems.push(`capabilities.pushNotifications is ${JSON.stringify(caps.pushNotifications)}, the brief says it should be ${pushNotifications}`);
    }
    return result(!problems.length, problems.length ? problems.join('; ') + '.' : 'Declared capabilities match what the brief described.');
  });
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[?.!]+$/g, '').replace(/\s+/g, ' ').trim();
}

// Claim: skills[].examples are the routing signal (A2A discovery reads only
// name/description/skills[].description per the skill's own references/a2a-
// lifecycle.md - not graded here, since that's the skill's body). What IS
// fair game: the real phrasing customers already use, stated in the brief,
// has to survive into the card rather than being replaced with the model's
// own invented phrasing. Computes against the case's own input, not prose the
// model wrote about a topic.
function examplesPreserveStatedPrompts(output, context) {
  const { prompts = [] } = config(context);
  if (!prompts.length) throw new Error('examplesPreserveStatedPrompts needs a non-empty config.prompts.');
  return withDoc(output, (doc) => {
    const examples = (doc.skills || []).flatMap((skill) => skill.examples || []).map(normalizeText);
    const missing = prompts.filter((prompt) => !examples.some((example) => example.includes(normalizeText(prompt))));
    return result(!missing.length, missing.length
      ? `Missing from skills[].examples: ${JSON.stringify(missing)}. Declared examples: ${JSON.stringify(examples)}.`
      : `All ${prompts.length} customer prompt(s) from the brief appear in skills[].examples.`);
  });
}

// Claim: the auth mechanism named in the brief has to actually be declared in
// securitySchemes, not just echoed somewhere in the reply. Proven live on
// case C: the no-skill arm emitted a non-JSON YAML pseudo-schema
// ("authentication: apiKey: {location: header, headerName: X-Api-KEY}") that
// contract_shape correctly failed as invalid JSON, but a bare `icontains`
// over the RAW output scored it 1/1 purely because the model echoed the
// brief's own vocabulary in prose - exactly the "never pattern-match prose"
// violation evals/AGENTS.md warns about. This only looks inside the parsed
// `securitySchemes` field (machine-readable JSON, via withDoc same as
// capabilitiesMatch above), and a case with no parseable card fails it via
// withDoc's sentinel check, same as every other javascript grader here.
//
// `family` matching is deliberately loose - it accepts either the current
// v1.0.1 discriminated-union shape (`apiKeySecurityScheme`) or the older flat
// `{"type": "apiKey", ...}` shape. contract_shape already grades exact wire
// conformance; this only checks the brief's stated mechanism wasn't dropped
// or swapped for something else.
//
// httpAuth/openIdConnect added alongside the original oauth2/apiKey pair:
// both are real discriminated-union keys in the vendored schema
// (assertions/agent-card.schema.json properties.securitySchemes ->
// `^(http_auth_security_scheme)$` and `^(open_id_connect_security_scheme)$`),
// so a brief naming bearer/basic HTTP auth or an OIDC provider has a family
// to match against instead of only ever matching apiKey/oauth2.
//
// Ceiling, deliberate: for apiKey/httpAuth/openIdConnect the pattern also
// matches the schema's own mandated discriminator key, so a card that uses the
// right wire field cannot fail its family check. That is this grader working,
// not a hole - what it grades is that the RIGHT family was chosen, and an
// apiKey card still fails `family: oauth2`. Exact wire conformance is
// contract_shape's job.
const SCHEME_FAMILY_PATTERN = {
  oauth2: /oauth2/i,
  apiKey: /api.?key/i,
  httpAuth: /http.?auth/i,
  openIdConnect: /open.?id.?connect/i,
};

function securitySchemeDeclares(output, context) {
  const { family, headerName = null } = config(context);
  if (!family || !SCHEME_FAMILY_PATTERN[family]) {
    throw new Error(`securitySchemeDeclares needs config.family to be one of: ${Object.keys(SCHEME_FAMILY_PATTERN).join(', ')}.`);
  }
  return withDoc(output, (doc) => {
    const schemes = doc.securitySchemes || {};
    const entries = Object.entries(schemes);
    if (!entries.length) return result(false, 'No securitySchemes declared.');
    // Key AND value: the securitySchemes key is the identifier `security[]`
    // references, as machine-readable as the value and often the only place the
    // family is spelled out. Matching the value alone scored three stored
    // case-H rows 0/0/1 on semantically identical authorization-code OAuth2
    // schemes - all keyed `oauth2AuthCode`, differing only in whether the model
    // happened to type a literal `2` inside the value.
    const matches = entries.filter(([name, scheme]) => SCHEME_FAMILY_PATTERN[family].test(`${name} ${JSON.stringify(scheme)}`));
    if (!matches.length) {
      return result(false, `No entry under securitySchemes matches "${family}". Declared: ${JSON.stringify(schemes)}.`);
    }
    if (headerName !== null) {
      const named = matches.some(([, scheme]) => new RegExp(headerName, 'i').test(JSON.stringify(scheme)));
      if (!named) {
        return result(false, `A "${family}" scheme is declared but none names the header "${headerName}". Matching scheme(s): ${JSON.stringify(matches)}.`);
      }
    }
    return result(true, `securitySchemes declares a "${family}" scheme${headerName !== null ? ` naming "${headerName}"` : ''}.`);
  });
}

module.exports = {
  capabilitiesMatch,
  examplesPreserveStatedPrompts,
  normalizeToJson,
  securitySchemeDeclares,
  source,
};
