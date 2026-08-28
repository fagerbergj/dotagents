// Graders for a skill that authors OTHER agent skills. The produced artifact is
// a SKILL.md (plus optional references/assets/scripts files), so the same split
// rest-api-authoring uses applies here: one real external validator for the
// frontmatter contract (skills-ref, the reference implementation the published
// spec itself points to), and hand-rolled JS only for the spec facts that
// validator does not check - measured by hand, see skillauth.test.cjs:
//   - line budget, and a non-empty body: a 600-line body, and a frontmatter-
//     only body with none at all, both still validate clean.
//   - reference existence: a body pointing at a references/ file that was
//     never supplied still validates clean.
//   - one-hop chains and reachability, both traced FROM SKILL.md rather than
//     guessed from a file's own directory prefix - the latter is what let a
//     SKILL.md that linked nothing still "chain" through two bundled files it
//     never reached (caught by adversarial review, see hop1Paths below).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

// skills-ref is the reference validator agentskills.io/specification names:
// `skills-ref validate ./my-skill`. Pinned to the version probed by hand.
const SKILLS_REF = process.env.SKILLS_REF_PACKAGE || 'skills-ref@0.1.5';

// npx reaching for the registry is the failure mode that scores a whole run
// zero while reporting success - one outage would zero this metric for every
// row in both arms. A tool that could not run is not a verdict, so this throws
// and the row errors instead of scoring the model's output as invalid.
const NPM_FAILURE = /npm error|npm ERR!|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET/;

function runTool(label, args, timeout = 60000) {
  const run = spawnSync('npx', args, { encoding: 'utf8', timeout });
  if (run.error) throw new Error(`${label} could not run: ${run.error.message}`);
  if (run.status !== 0 && NPM_FAILURE.test(`${run.stdout || ''}${run.stderr || ''}`)) {
    throw new Error(`${label} could not run: ${`${run.stdout}${run.stderr}`.trim().slice(0, 400)}`);
  }
  return run;
}

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

// The model is asked to return one or more files as `FILE: <path>` followed by
// a fenced block. Machine-readable output shape we asked for, not prose - the
// same footing as parsing a diff or a YAML document, not a wordlist over
// natural language. Fence length is matched so a body that itself contains a
// nested ``` example (e.g. documenting a command) does not truncate early.
const FILE_HEADER = /^#{0,6}\s*FILE:\s*(\S.*?)\s*$/gim;

function extractFence(chunk) {
  const open = chunk.match(/^[ \t]*(`{3,})[^\n`]*\r?\n/m);
  if (!open) return null;
  const ticks = open[1];
  const rest = chunk.slice(open.index + open[0].length);
  const close = rest.match(new RegExp(`^[ \\t]*${ticks}\\s*$`, 'm'));
  if (!close) return null;
  return rest.slice(0, close.index).replace(/\s+$/, '');
}

function normalizePath(p) {
  return String(p).trim().replace(/^\.\//, '').replace(/^\/+/, '');
}

function parseFiles(output) {
  const text = String(output);
  const headers = [...text.matchAll(FILE_HEADER)];
  const files = new Map();
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    const start = header.index + header[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const body = extractFence(text.slice(start, end));
    if (body == null) continue;
    const key = normalizePath(header[1]);
    if (key) files.set(key, body);
  }
  return files;
}

// defaultTest transform. No FILE: block at all is a legitimate answer for a
// case whose right answer is to push back rather than ship a skill, so it fails
// the package-shaped assertions rather than erroring the row. The sentinel
// keeps it from ever parsing as JSON.
function normalizeToFiles(output) {
  const files = parseFiles(output);
  if (!files.size) return `NO SKILL PACKAGE IN OUTPUT\n\n${String(output)}`;
  return JSON.stringify(Object.fromEntries(files), null, 2);
}

function loadPackage(output) {
  const text = String(output);
  if (text.startsWith('NO SKILL PACKAGE IN OUTPUT')) {
    return { ok: false, error: 'No "FILE: <path>" block with a fenced code block was found in the output.' };
  }
  try {
    return { ok: true, files: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `normalized package did not parse as JSON: ${error.message}` };
  }
}

function withPackage(output, grader) {
  const pkg = loadPackage(output);
  if (!pkg.ok) return result(false, pkg.error);
  return grader(pkg.files);
}

// One temp skill directory per distinct file set, shared by every grader on the
// case that shells out to skills-ref.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-skillauth-'));
const materialized = new Map();

// Path traversal in a model-chosen filename is defended the same way
// lib/skill-tools.js defends reads: resolve and require containment.
function materialize(files) {
  const key = crypto.createHash('sha1').update(JSON.stringify(files)).digest('hex');
  if (materialized.has(key)) return materialized.get(key);
  const dir = path.join(workDir, key, 'skill-under-test');
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const target = path.resolve(dir, rel);
    if (target !== dir && !target.startsWith(dir + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : '');
  }
  materialized.set(key, dir);
  return dir;
}

// Claim: "the produced skill parses, and its frontmatter carries the required
// fields" - graded by the reference implementation the spec itself names, not
// by re-deriving the same rules by hand. Verified by hand: it independently
// catches an uppercase/underscored name, a missing description, a description
// over 1024 chars, a compatibility field over 500 chars, and malformed YAML,
// each with `skills-ref validate` exiting non-zero and naming the field.
//
// The temp directory is always named "skill-under-test", so skills-ref's own
// "directory name must match skill name" line is a harness artifact, not a
// verdict on the model's output, and is filtered out rather than counted.
function validatesWithSkillsRef(output) {
  return withPackage(output, (files) => {
    if (typeof files['SKILL.md'] !== 'string' || !files['SKILL.md'].trim()) {
      return result(false, 'No file named "SKILL.md" at the skill root was found in the output.');
    }
    const dir = materialize(files);
    const run = runTool('skills-ref validate', ['-y', SKILLS_REF, 'validate', dir]);
    const lines = `${run.stdout || ''}\n${run.stderr || ''}`.split('\n').map((l) => l.trim());
    const issues = lines.filter((l) => l.startsWith('-') && !/Directory name .* must match skill name/i.test(l));
    const pass = issues.length === 0;
    return result(pass, pass
      ? `skills-ref (${SKILLS_REF}) validated the frontmatter cleanly.`
      : `skills-ref (${SKILLS_REF}) rejects it: ${issues.join('; ')}`);
  });
}

// Claim: "the body stays within the documented budget, and there is one."
// agentskills.io/specification, Progressive disclosure: "2. Instructions
// (< 5000 tokens recommended): The full SKILL.md body is loaded when the
// skill is activated" - a skill IS its body; frontmatter-only is not a small
// skill, it is nothing to load. And: "Keep your main SKILL.md under 500
// lines." Measured: skills-ref checks neither bound (a 600-line body, and a
// frontmatter-only body with none at all, both still validate clean), so both
// are computed here. Bug found by adversarial review: an empty body used to
// pass this check outright.
function withinBodyBudget(files) {
  const content = files['SKILL.md'];
  if (typeof content !== 'string') return { pass: false, reason: 'No SKILL.md to measure.' };
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  const body = (match ? match[1] : content).trim();
  if (!body) return { pass: false, reason: 'SKILL.md has frontmatter but an empty body - nothing for "the full SKILL.md body is loaded when the skill is activated" to load.' };
  const lines = body.split(/\r?\n/).length;
  const pass = lines <= 500;
  return { pass, reason: pass
    ? `SKILL.md body is ${lines} line(s), within the spec's 500-line budget.`
    : `SKILL.md body is ${lines} line(s), over the spec's 500-line budget.` };
}

// references/, assets/, and scripts/ paths as they appear in file content -
// machine-readable path syntax, not prose, the same footing as matching an
// identifier against source. Trailing punctuation from prose ("see
// references/x.md.") is stripped.
const REF_TOKEN = /(?:references|assets|scripts)\/[\w][\w.\-/]*/g;

function referencedPaths(text) {
  const found = String(text).match(REF_TOKEN) || [];
  return [...new Set(found.map((token) => token.replace(/[.,;:)'"`\]]+$/, '')))];
}

// Reachability, traced FROM SKILL.md - not a directory-prefix guess. Bug found
// by adversarial review: the prior version flagged any references/assets/
// scripts file that mentioned another such path, so a SKILL.md with an EMPTY
// body (frontmatter only, body_budget = 0 lines) still reported a "chain"
// between two bundled files it never linked at all - nothing is one hop from a
// SKILL.md that links nothing. Hop 1 is exactly what SKILL.md's own body
// names; a file not in hop 1 was never reached to begin with.
function hop1Paths(files) {
  const skillMd = files['SKILL.md'];
  if (typeof skillMd !== 'string') return [];
  const names = new Set(Object.keys(files));
  return referencedPaths(skillMd).filter((ref) => ref !== 'SKILL.md' && names.has(ref));
}

// Claims: "every references/ path the skill names actually exists" and "file
// references stay one hop from SKILL.md" (agentskills.io/specification: "Keep
// file references one level deep from SKILL.md. Avoid deeply nested reference
// chains."). Measured: skills-ref does not check either (a body pointing at a
// references/ file that was never supplied still validates clean), so both are
// computed here against the package the model actually returned.
function danglingAndChains(files) {
  const names = new Set(Object.keys(files));
  const dangling = [];
  for (const [filePath, content] of Object.entries(files)) {
    const refs = referencedPaths(content).filter((ref) => ref !== filePath);
    for (const ref of refs) {
      if (!names.has(ref)) dangling.push(`${filePath} points to "${ref}", which is not in the package`);
    }
  }

  // A chain is hop 1 (linked directly from SKILL.md) linking a second bundled
  // file - a real second hop, not any two resource files that happen to
  // mention each other without SKILL.md ever reaching either.
  const chains = [];
  for (const hopPath of hop1Paths(files)) {
    const refs = referencedPaths(files[hopPath]).filter((ref) => ref !== hopPath && ref !== 'SKILL.md');
    for (const ref of refs) {
      if (names.has(ref)) chains.push(`${hopPath} (linked from SKILL.md) points to "${ref}", a second hop from SKILL.md`);
    }
  }
  return { dangling, chains };
}

// Claim: a file the package bundles but SKILL.md never links can never be
// reached. agentskills.io/specification, Progressive disclosure: "Resources
// (as needed): Files (e.g. those in scripts/, references/, or assets/) are
// loaded only when required" - "required" is triggered by SKILL.md pointing at
// them; a file with no path in from SKILL.md never becomes "required" for any
// agent following the spec's own loading model. Bug found by adversarial
// review: nothing previously checked this, so a SKILL.md that linked nothing
// still passed every other structural grader.
function unreachableFiles(files) {
  const hop1 = new Set(hop1Paths(files));
  return Object.keys(files).filter((p) => p !== 'SKILL.md' && !hop1.has(p));
}

// A real "---"-delimited frontmatter block, independent of whether its fields
// are valid (skills-ref's job). Gates the checks below: bug found by
// adversarial review - a no-skill reply with no frontmatter at all (just
// prose or a shell command mislabeled "SKILL.md") had nothing to dangle, no
// chain to form, and no bundled file to leave unreachable, so it scored a
// perfect 1.00 here purely from having nothing to violate. Absence of a
// violation is not evidence of a valid package.
function hasFrontmatter(content) {
  return typeof content === 'string' && /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.test(content);
}

function specBudgetAndRefs(output) {
  return withPackage(output, (files) => {
    if (!hasFrontmatter(files['SKILL.md'])) {
      return result(false, 'No SKILL.md with real "---"-delimited frontmatter was found, so there is no valid package for the budget/reference facts to apply to.');
    }
    const { dangling, chains } = danglingAndChains(files);
    const unreachable = unreachableFiles(files);
    const checks = [
      { name: 'body_budget', ...withinBodyBudget(files) },
      {
        name: 'references_exist',
        pass: dangling.length === 0,
        reason: dangling.length ? `${dangling.join('; ')}.` : 'Every references/assets/scripts path named in the package resolves to a file that is actually there.',
      },
      {
        name: 'one_hop',
        pass: chains.length === 0,
        reason: chains.length ? `${chains.join('; ')}.` : 'No file linked from SKILL.md points at a second bundled file, so every resource stays one hop from SKILL.md.',
      },
      {
        name: 'all_files_reachable',
        pass: unreachable.length === 0,
        reason: unreachable.length
          ? `${unreachable.map((p) => `"${p}" is bundled but SKILL.md never links it`).join('; ')}.`
          : 'Every bundled file besides SKILL.md is linked from SKILL.md, so an agent following the spec\'s loading model can actually reach it.',
      },
    ];
    const met = checks.filter((check) => check.pass);
    return {
      pass: met.length === checks.length,
      score: met.length / checks.length,
      reason: `${met.length}/${checks.length} spec fact(s) held. ${checks.map((c) => `${c.name}: ${c.pass ? 'ok' : 'FAIL'} - ${c.reason}`).join(' | ')}`,
    };
  });
}

module.exports = {
  danglingAndChains,
  extractFence,
  hasFrontmatter,
  hop1Paths,
  loadPackage,
  materialize,
  normalizeToFiles,
  parseFiles,
  referencedPaths,
  specBudgetAndRefs,
  unreachableFiles,
  validatesWithSkillsRef,
  withinBodyBudget,
};
