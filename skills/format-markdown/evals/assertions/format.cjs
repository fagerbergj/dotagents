// Graders for the format-markdown skill. Each one traces to a claim in the
// skill's frontmatter description - "preserves all content and links exactly",
// "heading hierarchy" - never to a step in the SKILL.md body.
//
// The line every check here sits on: does the property change the RENDERED
// document, or only the source bytes? Bullet character, emphasis delimiter,
// blank lines, hard wrapping and `#` counts that render to the same tags are
// invisible after rendering and are not graded. So nothing below matches
// strings against the source; everything runs off markdown-it's parse.
// Through evals/lib/npm.cjs so it resolves from evals/node_modules.
const MarkdownIt = require('../../../../evals/lib/npm.cjs').require('markdown-it');

// CommonMark preset with raw HTML on (the incident case is built around a
// <details> block) and GFM tables re-enabled (the rate-limit case is a table).
// linkify stays off: promoting a bare URL to a link is the model's choice, not
// the parser's.
const md = new MarkdownIt('commonmark', { html: true, linkify: false }).enable('table');

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

// The input document under test, as supplied by the case's `document` var.
function original(context) {
  return String(context?.vars?.document || '');
}

const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

// A link reference definition only counts as one when it starts a block, so the
// digest case's `[search]: https://...` glued to the paragraph above it is
// plain text and `[new search index][search]` resolves to nothing.
const REF_DEFINITION = /^\s{0,3}\[[^\]\n]+\]:\s*\S/;

// Missing air, restored. CommonMark 4.6 ends an HTML block at a blank line, so
// `<details><summary>x</summary>` followed straight by a list renders the list
// as literal text; the rule above costs a document its links. Both are defects
// the skill exists to fix, and putting the air back on BOTH sides before the
// content comparison keeps (a)-(c) measuring content rather than blank lines.
// Whether the delivered document actually has the air is graded in (d), where
// the output is parsed as written.
function restoreBlockAir(text) {
  const out = [];
  let fence = null;
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(FENCE_LINE);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && !match[2].trim()) fence = null;
      continue;
    }
    if (match) {
      fence = match[1];
      out.push(line);
      continue;
    }
    if (REF_DEFINITION.test(line) && out.length && out[out.length - 1].trim()) out.push('');
    out.push(/<\/?(?:details|summary)\b/i.test(line)
      ? line
        .replace(/<details\b[^>]*>/gi, '$&\n\n')
        .replace(/<\/summary>/gi, '$&\n\n')
        .replace(/<\/details>/gi, '\n\n$&')
      : line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function parse(text) {
  return md.parse(String(text), {});
}

// Block tokens carry their inline run as one `inline` token with `children`.
function flatten(tokens, into = []) {
  for (const token of tokens) {
    into.push(token);
    if (token.children) flatten(token.children, into);
  }
  return into;
}

function normalizeSpace(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

// (a) Every link as the reader sees it: its text paired with where it goes, in
// document order. A set of hrefs and a separate set of link texts both score
// 1.00 when two targets are swapped; a list of pairs does not.
function linkPairs(tokens) {
  const pairs = [];
  const open = [];
  for (const token of flatten(tokens)) {
    if (token.type === 'link_open') {
      open.push({ href: token.attrGet('href') || '', text: [] });
    } else if (token.type === 'link_close') {
      const link = open.pop();
      if (link) pairs.push([normalizeSpace(link.text.join('')), link.href]);
    } else if (open.length && (token.type === 'text' || token.type === 'code_inline' || token.type === 'image')) {
      open[open.length - 1].text.push(token.content);
    }
  }
  return pairs;
}

function pairKey([text, href]) {
  return `[${text}](${href})`;
}

// (b) Code is content. The info string is not: CommonMark leaves it optional
// and mandates no treatment of it, so only the body is compared.
function codeBodies(tokens) {
  return flatten(tokens)
    .filter((token) => token.type === 'fence' || token.type === 'code_block')
    .map((token) => token.content.replace(/\n+$/, ''))
    .filter(Boolean);
}

// Rendered text, with block boundaries kept as newlines so sentence-initial
// capitals stay distinguishable from proper nouns.
function renderedText(tokens) {
  const parts = [];
  for (const token of flatten(tokens)) {
    if (token.block && token.type !== 'inline') parts.push('\n');
    switch (token.type) {
      case 'text':
      case 'code_inline':
        parts.push(token.content);
        break;
      // Raw HTML passes through the renderer; its tags are markup, its text is text.
      case 'html_block':
      case 'html_inline':
        parts.push(token.content.replace(/<[^>]*>/g, ' '));
        break;
      case 'softbreak':
      case 'hardbreak':
        parts.push('\n');
        break;
      default:
        break;
    }
  }
  return parts.join(' ');
}

function words(text) {
  return (String(text).match(/[A-Za-z0-9][A-Za-z0-9'’./+-]*/g) || [])
    .map((word) => word.replace(/[.\-/+'’]+$/, ''))
    .filter(Boolean);
}

function counts(list) {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) || 0) + 1);
  return map;
}

function multisetDiff(before, after) {
  const left = counts(before);
  const right = counts(after);
  const missing = [];
  const added = [];
  for (const [word, count] of left) {
    const delta = count - (right.get(word) || 0);
    for (let index = 0; index < delta; index += 1) missing.push(word);
  }
  for (const [word, count] of right) {
    const delta = count - (left.get(word) || 0);
    for (let index = 0; index < delta; index += 1) added.push(word);
  }
  return { missing, added };
}

function sample(list, limit = 8) {
  return list.slice(0, limit).join(', ') + (list.length > limit ? `, +${list.length - limit} more` : '');
}

// Function words evaporate when a run-on sentence becomes a bold-label list -
// "a severity one incident means" becomes "**Severity one** -". That is a
// formatting change, so the diff runs on content words only.
const STOPWORDS = new Set('a an and any are as at be been being both but by can could did do does for from get gets got had has have how i if in into is it its may mean means might must my no nor not of on once only or other our out over per shall should so some such than that the their them then there these they this those to under up upon was were what when where which while who whom will with within would you your'.split(' '));

// A correct bold-label conversion absorbs a handful of connective nouns, so
// exact equality would fail the reformat this suite exists to reward. 0.95
// tolerates that and still fails anything that drops or summarises a fact. The
// flat two-word allowance is for short documents, where one absorbed verb is
// already 7% of the text.
// ponytail: one global floor; per-case floors if a document needs a looser one.
const CONTENT_RETENTION = 0.95;
// No allowance can excuse a loss this large, however few words it is.
const RETENTION_FLOOR = 0.90;
const ABSORBED_ALLOWANCE = 2;

function contentWords(text) {
  return words(text).map((word) => word.toLowerCase()).filter((word) => !STOPWORDS.has(word));
}

// Numbers, dates, versions and limits - never absorbed by a restructure.
function anchors(text) {
  return words(text).filter((word) => /\d/.test(word));
}

// Capitalised tokens that are not the first word of their line or sentence.
function properNouns(text) {
  const found = new Set();
  for (const sentence of String(text).split(/(?<=[.!?:])\s+|\n+/)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    tokens.slice(1).forEach((token) => { if (/^[A-Z]/.test(token)) found.add(token.toLowerCase()); });
  }
  return found;
}

// (d) What renders inside a <details>. A block-level HTML block swallows
// everything up to the next blank line, so the list in an unaired
// <details><summary>Sources</summary> is literal text and contributes nothing.
const BLOCK_TAG = {
  bullet_list_open: 'list',
  ordered_list_open: 'list',
  paragraph_open: 'paragraph',
  blockquote_open: 'blockquote',
  table_open: 'table',
  heading_open: 'heading',
  fence: 'code',
  code_block: 'code',
  hr: 'rule',
};

// Block tokens only, and only the outermost ones: the paragraphs markdown-it
// emits inside every list item are the list, not separate content.
function detailsContents(tokens) {
  const found = [];
  let current = null;
  let depth = 0;
  for (const token of tokens) {
    if (token.type === 'html_block') {
      if (/<details\b/i.test(token.content)) {
        current = [];
        found.push(current);
        depth = 0;
      }
      if (/<\/details>/i.test(token.content)) current = null;
      continue;
    }
    if (current && depth === 0 && BLOCK_TAG[token.type]) current.push(BLOCK_TAG[token.type]);
    if (token.nesting === 1) depth += 1;
    else if (token.nesting === -1) depth -= 1;
  }
  return found;
}

// "Preserves all content and links exactly." One grader, four properties, all
// of them decided by rendering the input and the output and comparing:
//   (a) every (link text, target) pair survives, paired and in order;
//   (b) every code block body comes back byte-identical;
//   (c) the rendered text of the input is contained in the rendered text of
//       the output, minus the reformat tolerance above;
//   (d) whatever a <details> is meant to hold still renders inside it.
// CEILING: (c) is a multiset, so a link-free paragraph moved under a different
// heading is invisible here. (a) catches the move when the paragraph has a
// link in it. Only the judge sees placement in general.
function preserved(output, context) {
  const source = original(context);
  const before = parse(restoreBlockAir(source));
  const after = parse(restoreBlockAir(output));
  const problems = [];

  const beforePairs = linkPairs(before).map(pairKey);
  const afterPairs = linkPairs(after).map(pairKey);
  const lostPairs = [];
  let cursor = 0;
  for (const pair of beforePairs) {
    const at = afterPairs.indexOf(pair, cursor);
    if (at === -1) lostPairs.push(pair);
    else cursor = at + 1;
  }
  if (lostPairs.length) problems.push(`links dropped, repointed, relabelled or reordered: ${sample(lostPairs, 4)}`);
  // Promoting a bare URL the document already carried to a real link is not an
  // invention; a target that was never in the source is.
  const known = new Set(beforePairs);
  const invented = linkPairs(after).filter((pair) => !known.has(pairKey(pair)) && !source.includes(pair[1]));
  if (invented.length) problems.push(`links invented: ${sample(invented.map(pairKey), 4)}`);

  const beforeCode = codeBodies(before);
  const pool = codeBodies(after);
  const lostCode = [];
  for (const body of beforeCode) {
    const at = pool.indexOf(body);
    if (at === -1) lostCode.push(body.split('\n')[0]);
    else pool.splice(at, 1);
  }
  if (lostCode.length) problems.push(`code block content changed, starting at: ${sample(lostCode, 3)}`);

  const sourceText = renderedText(before);
  const outputText = renderedText(after);

  const lostAnchors = multisetDiff(anchors(sourceText), anchors(outputText)).missing;
  if (lostAnchors.length) problems.push(`numbers dropped: ${sample(lostAnchors, 5)}`);

  const delivered = new Set(words(outputText).map((word) => word.toLowerCase()));
  const lostNames = [...properNouns(sourceText)].filter((name) => !delivered.has(name));
  if (lostNames.length) problems.push(`names dropped: ${sample(lostNames, 5)}`);

  const sourceWords = contentWords(sourceText);
  const { missing, added } = multisetDiff(sourceWords, contentWords(outputText));
  const retention = sourceWords.length ? (sourceWords.length - missing.length) / sourceWords.length : 1;
  // The two-word allowance excuses bold-label absorption on a normal document, but on a
  // short one two words can reverse the meaning: dropping `encrypted` and `verified`
  // from a security sentence passed at 81.8% and read as a clean bill of health.
  // Below the hard floor nothing is excused.
  if (retention < RETENTION_FLOOR || (retention < CONTENT_RETENTION && missing.length > ABSORBED_ALLOWANCE)) problems.push(`content words dropped: ${sample(missing)}`);

  // Deliberately asymmetric: the source is measured with its air restored, the output
  // as written. An input whose <details> does not render is a document this skill is
  // supposed to FIX, so echoing it back unchanged is a failure, not preservation.
  const wantDetails = detailsContents(before);
  const gotDetails = detailsContents(parse(output));
  if (gotDetails.length < wantDetails.length) {
    problems.push(`${wantDetails.length - gotDetails.length} <details> block(s) dropped`);
  } else {
    wantDetails.forEach((want, index) => {
      const got = counts(gotDetails[index] || []);
      const short = [...counts(want)].filter(([tag, count]) => count > (got.get(tag) || 0)).map(([tag]) => tag);
      if (short.length) problems.push(`<details> #${index + 1} no longer renders its ${short.join(', ')} - the Markdown inside it needs a blank line around it`);
    });
  }

  const note = added.length ? ` Repeated or added: ${sample(added, 5)}.` : '';
  return {
    pass: problems.length === 0,
    score: problems.length ? 0 : retention,
    reason: problems.length
      ? `Content changed - ${problems.join('; ')}.${note}`
      : `${beforePairs.length} link(s), ${beforeCode.length} code block(s) and ${(retention * 100).toFixed(1)}% of content words came back intact.${note}`,
  };
}

// "heading hierarchy" - levels descend one at a time from the top. The
// authority is markdownlint MD001, and the skill's own frontmatter; this is
// not an accessibility requirement (axe-core's heading-order is a Deque best
// practice, and WCAG 2.2 1.3.1 does not require sequential levels).
function noHeadingSkips(output) {
  const tokens = parse(output);
  const found = [];
  tokens.forEach((token, index) => {
    if (token.type === 'heading_open') {
      found.push({ level: Number(token.tag.slice(1)), text: normalizeSpace(tokens[index + 1]?.content || '') });
    }
  });
  if (!found.length) return result(true, 'Document has no headings.');
  if (found[0].level > 2) return result(false, `Document opens at H${found[0].level}: "${found[0].text}".`);
  for (let index = 1; index < found.length; index += 1) {
    if (found[index].level > found[index - 1].level + 1) {
      return result(false, `H${found[index - 1].level} "${found[index - 1].text}" is followed by H${found[index].level} "${found[index].text}".`);
    }
  }
  return result(true, `${found.length} heading(s), no skipped level.`);
}

// Every block a reader sees, as the renderer resolves it: heading level plus
// text, one entry per list item, table cell, paragraph and code body. Setext
// and ATX headings collapse to the same entry, a hard-wrapped paragraph and a
// one-line one collapse to the same entry, and bullet character, emphasis
// delimiter and fence info string never appear.
function renderedBlocks(tokens) {
  const blocks = [];
  const stack = [];
  for (const token of tokens) {
    if (token.type === 'fence' || token.type === 'code_block') {
      blocks.push(`code:${token.content.replace(/\n+$/, '')}`);
      continue;
    }
    if (token.type === 'inline') {
      const tag = stack[stack.length - 1] || 'text';
      const text = normalizeSpace(renderedText([token]));
      if (text) blocks.push(`${tag}:${text}`);
      continue;
    }
    if (token.type === 'html_block') {
      const text = normalizeSpace(token.content.replace(/<[^>]*>/g, ' '));
      if (text) blocks.push(`html:${text}`);
      continue;
    }
    if (token.nesting === 1) stack.push(token.tag || token.type);
    else if (token.nesting === -1) stack.pop();
  }
  return blocks;
}

// Negative control: a document that already meets the claims should come back
// as the same rendered document. This is the strict end of `preserved` - same
// parser, same rule that only what a renderer resolves is graded - so the
// properties the config comment calls invisible stay invisible here too, and
// obeying the skill (ATX headings, one line per paragraph, soft wrapping) costs
// nothing. What it does catch is real: a paragraph split into bullets, a
// heading added, a sentence reworded, a table cell moved.
// `minimum` is the share of rendered blocks shared by input and output, over
// whichever of the two has more, so additions count against it as well as losses.
function renderedUnchanged(output, context) {
  const minimum = Number(config(context).minimum || 0.9);
  const before = renderedBlocks(parse(restoreBlockAir(original(context))));
  const after = counts(renderedBlocks(parse(restoreBlockAir(output))));
  const changed = [];
  let kept = 0;
  for (const block of before) {
    const left = after.get(block) || 0;
    if (left > 0) {
      after.set(block, left - 1);
      kept += 1;
    } else changed.push(block);
  }
  const total = Math.max(before.length, kept + [...after.values()].reduce((sum, n) => sum + n, 0));
  const ratio = total ? kept / total : 1;
  const note = changed.length ? ` Gone or rewritten: ${sample(changed.map((block) => block.slice(0, 60)), 3)}.` : '';
  return {
    pass: ratio >= minimum,
    score: ratio,
    reason: `${kept}/${total} rendered blocks are identical (${(ratio * 100).toFixed(0)}%, floor ${(minimum * 100).toFixed(0)}%).${note}`,
  };
}

module.exports = {
  renderedUnchanged,
  noHeadingSkips,
  preserved,
};
