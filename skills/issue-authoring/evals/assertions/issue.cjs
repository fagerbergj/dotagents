// Graders for the issue-authoring suite that genuinely need computation.
// Everything a judge can read - testability, faithfulness, framing - belongs to
// the llm-rubric assertions instead. Everything here tests a property of the
// delivered issue text, never how it was produced.

const TITLE_LABEL = /^\**\s*(?:title|summary)\s*\**\s*:\s*\**\s*\S/i;

const HEADING = /^\s*(#{1,6})\s+(\S.*)$/;

const CRITERIA_HEADING = /^\s*(?:#{1,6}\s*)?\**\s*(?:acceptance criteria|completion criteria|success criteria|definition of done|done when|verification|validation|how we(?:'ll| will)? know)\b/i;

// A section ends at the next markdown heading or bold/colon label line.
const SECTION_BREAK = /^\s*(?:#{1,6}\s+\S|\*\*[^*\n]{2,60}\*\*\s*:?\s*$|[A-Z][\w '\-/&]{2,60}:\s*$)/;

const BULLET = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)\S/;

// ponytail: heading vocabulary, not a parser. A section heading outside this
// list reads as a second work item; extend the list if that shows up in a run.
const SECTION_WORD = /^\**\s*(?:context|background|problem(?: statement)?|outcome|goal|objective|scope|non[- ]goals?|out of scope|acceptance criteria|completion criteria|success criteria|definition of done|verification|validation|evidence|references?|links?|notes?|details?|description|summary|impact|environment|steps(?: to reproduce)?|reproduction|actual(?: behaviou?r| result)?|expected(?: behaviou?r| result)?|current behaviou?r|observed(?: behaviou?r)?|proposed(?: solution| approach)?|suggested approach|assumptions?|open questions?|unknowns?|risks?|dependencies|labels?|priority|metadata|tasks?|checklist|what(?:'s| is)? (?:missing|needed)|information needed|questions?|why(?: this matters)?|who is affected|related work)\b/i;

// Well-known technical constants are vocabulary, not facts an author invented.
const CONSTANTS = /\b(?:SHA-?\d{1,3}|ISO-?\d{4,5}|UTC[+-]\d{1,2}|UTF-?\d{1,2}|AES-?\d{3}|RSA-?\d{4}|HMAC-SHA-?\d{1,3}|RFC[- ]?\d{3,5}|HTTP\/\d(?:\.\d)?|TLS[ -]?\d\.\d|SSL[ -]?\d\.\d|OAuth[ -]?\d(?:\.\d)?|IPv[46]|P-?256|WCAG[ -]?\d\.\d|ES\d{4}|EXPECTED|ERROR|EXAMPLE|EVIDENCE|ENVIRONMENT|ESCALATION|ENGINEERING)\b/gi;

// Concrete specifics an author can only supply by inventing them.
const FACT_PATTERNS = [
  /\bv?\d+\.\d+(?:\.\d+)*\b(?!\s*%)/g,
  /\b[45]\d{2}\b/g,
  /\bE[A-Z]{3,}\b/g,
  /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g,
  /\b[\w.-]*\/[\w./-]*\.[A-Za-z]{1,5}\b/g,
  /\b[\w-]+\.(?:js|jsx|ts|tsx|py|rb|go|java|cs|rs|php|json|ya?ml|sql|sh|log|csv)\b/g,
];

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

function lines(output) {
  return String(output).split(/\r?\n/);
}

// Every completion-criteria block in the output, as raw text. One issue carries
// one; a fanned-out answer carries one per ask.
function criteriaSections(output) {
  const all = lines(output);
  const sections = [];
  for (let index = 0; index < all.length; index += 1) {
    if (!CRITERIA_HEADING.test(all[index])) continue;
    const body = [];
    for (let cursor = index + 1; cursor < all.length; cursor += 1) {
      if (SECTION_BREAK.test(all[cursor])) break;
      body.push(all[cursor]);
    }
    sections.push(body.join('\n'));
  }
  return sections;
}

function facts(text) {
  const found = new Set();
  const cleaned = String(text).replace(CONSTANTS, ' ');
  for (const pattern of FACT_PATTERNS) {
    for (const match of cleaned.matchAll(pattern)) {
      found.add(match[0].replace(/^v(?=\d)/i, '').toLowerCase());
    }
  }
  return [...found];
}

// Headings at the shallowest level in the document that are not section labels.
// A split answer titles each item at the same level; a single issue has one.
function workItemTitles(output) {
  const headings = lines(output).map((line) => line.match(HEADING)).filter(Boolean);
  const top = Math.min(...headings.map((match) => match[1].length));
  const titled = headings.filter((match) => match[1].length === top && !SECTION_WORD.test(match[2]));
  const labels = lines(output).filter((line) => TITLE_LABEL.test(line.trim())).length;
  return Math.max(titled.length, labels);
}

// Claim: "sufficient context" - context the report supplied, not context the
// author imagined. Needs code: a set difference between the specifics in the
// output and the specifics in the input. It sees tokens only; prose-shaped
// invention (causes, counts, reproduction steps) is the judge's job.
function noInventedFacts(output, context) {
  // Only what was actually handed to the model. Joining every var whitelisted
  // `rubric`, so any identifier a rubric mentioned became a free pass.
  const vars = context?.vars || {};
  const given = [vars.report, vars.source, vars.tracker].filter(Boolean).join('\n').toLowerCase();
  const allowed = (config(context).allow || []).map((entry) => String(entry).toLowerCase());
  const invented = facts(output).filter((token) => !given.includes(token) && !allowed.includes(token));
  if (!invented.length) return result(true, 'No version, code, or path in the issue is absent from the report.');
  return result(false, `Invented specifics absent from the report: ${invented.slice(0, 5).join(', ')}.`);
}

// Claim: "bounded scope" - one report becomes one completion contract, unless
// the report genuinely carried several, in which case the split is bounded too.
// Needs code: counting work items against a per-case min/max window.
function oneBoundedIssue(output, context) {
  const settings = config(context);
  const max = Number(settings.max ?? 1);
  const min = Number(settings.min ?? 1);
  const count = Math.max(criteriaSections(output).length, workItemTitles(output), 1);
  if (count > max) return result(false, `Output carries ${count} separate work items; at most ${max} is in bounds.`);
  if (count < min) return result(false, `Output carries ${count} work item(s); the report held at least ${min} unrelated asks.`);
  return result(true, `Output carries ${count} bounded work item(s).`);
}

module.exports = {
  noInventedFacts,
  oneBoundedIssue,
};
