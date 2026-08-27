const assert = require('node:assert/strict');
const checks = require('./format.cjs');
const { stripAndUnwrap } = require('../../../lib/strip-reasoning.js');

// The same document twice: as a user typed it, and as a correct reformat leaves
// it. Nothing but markup differs, so preservation must pass.
const messy = `# Weekly digest
Two things shipped: the [new search index][search] and <b>billing export</b>.
Docs live at https://api.example.com/docs
[search]: https://github.com/acme/search/pull/1180
### Commands
\`\`\`
npm run build
\`\`\`
* one
+ two`;

const clean = `# Weekly digest

Two things shipped: the [new search index](https://github.com/acme/search/pull/1180) and **billing export**.

Docs live at https://api.example.com/docs

## Commands

\`\`\`bash
npm run build
\`\`\`

- one
- two`;

const context = { vars: { document: messy } };
const on = (output, vars = messy) => checks.preserved(output, { vars: { document: vars } });

// Markup may change freely, facts may not.
assert.equal(on(clean).pass, true, on(clean).reason);
assert.equal(on(clean.replace('/pull/1180', '/pull/1181')).pass, false, 'a repointed link fails');
assert.equal(on(clean.replace('npm run build', 'npm build')).pass, false, 'edited code fails');
assert.equal(on(clean.replace('new search index', 'search index')).pass, false, 'link text must be exact');

// The four blind spots the URL-set/link-text graders had. Every one of these
// scored 1.00 before; the pairs are compared as pairs, in order, and reference
// links are resolved by the parser rather than left as text.
const twoLinks = `# Ship log

The [search index](https://github.com/acme/search/pull/1180) and the
[billing export](https://github.com/acme/billing/pull/94) both landed.`;
const swapped = `# Ship log

The [search index](https://github.com/acme/billing/pull/94) and the
[billing export](https://github.com/acme/search/pull/1180) both landed.`;
assert.equal(on(twoLinks, twoLinks).pass, true);
assert.equal(on(swapped, twoLinks).pass, false, 'BLIND SPOT 1: swapped link targets must fail');
assert.match(on(swapped, twoLinks).reason, /repointed/);
assert.equal(on(swapped, twoLinks).score, 0);

const twice = `# Notes

See the [handbook](https://handbook.example.com/engineering) for setup, and the
[handbook](https://handbook.example.com/engineering) again for the rollout notes.`;
assert.equal(on(twice, twice).pass, true);
assert.equal(
  on(twice.replace(/, and the\n\[handbook\]\(https:\/\/handbook\.example\.com\/engineering\) again for the rollout notes\./, '.'), twice).pass,
  false,
  'BLIND SPOT 2: dropping one of two identical links must fail',
);

// BLIND SPOT 3: a paragraph reattached under a different heading. Caught when
// the paragraph carries a link, because the pairs are compared in order.
const twoSections = `# Report

## Search

Shipped the [search index](https://x.test/search).

## Billing

Shipped the [billing export](https://x.test/billing).`;
const reordered = `# Report

## Billing

Shipped the [billing export](https://x.test/billing).

## Search

Shipped the [search index](https://x.test/search).`;
assert.equal(on(reordered, twoSections).pass, false, 'BLIND SPOT 3: reordered sections must fail');
// CEILING, stated so it is not mistaken for coverage: a link-free paragraph
// moved under another heading is still invisible to every check here.

// BLIND SPOT 4: shortcut and collapsed reference links, which the old grader
// never looked at because it only matched `[text](url)` and `[label]: url`.
const shortcut = `# Digest

The rollout notes are in [handbook], and search is in [search][].
[handbook]: https://handbook.example.com/engineering
[search]: https://github.com/acme/search/pull/1180`;
assert.equal(on(shortcut, shortcut).pass, true);
assert.equal(
  on(shortcut.replace('[handbook]: https://handbook.example.com/engineering', '[handbook]: https://handbook.example.com/other'), shortcut).pass,
  false,
  'BLIND SPOT 4: repointing a shortcut reference link must fail',
);
// Inlining the same definitions changes nothing a reader sees.
assert.equal(on(`# Digest

The rollout notes are in [handbook](https://handbook.example.com/engineering), and search is in [search](https://github.com/acme/search/pull/1180).`, shortcut).pass, true);

// The comparison the suite exists to make: turning a run-on sentence into a
// bold-label list absorbs function words and a connective verb. That must pass,
// or the arm that formats correctly loses to the arm that does nothing.
// Summarising the same sentence must still fail.
const runOn = `# Severity

A severity one incident means a production outage with no workaround and gets a response within one hour, a severity two means a major feature is unusable and gets a response within four business hours, and a severity three covers degraded behaviour with a workaround and gets a response within one business day.`;
const asList = `# Severity

- **Severity one** - a production outage with no workaround, response within one hour.
- **Severity two** - a major feature is unusable, response within four business hours.
- **Severity three** - degraded behaviour with a workaround, response within one business day.`;
assert.equal(on(asList, runOn).pass, true, on(asList, runOn).reason);
assert.equal(on(asList.split('\n').slice(0, 3).join('\n'), runOn).pass, false, 'dropping tiers must fail');
assert.equal(on(asList.replace('four business hours', 'four hours'), runOn).pass, false, 'numbers and facts stay exact');

// Rendered, not literal: none of these change what a reader sees, so none of
// them are content changes. This is the line the whole file sits on.
const rendered = `# T

- a
- b

**bold** and *thin*`;
assert.equal(on(rendered.replace(/^- /gm, '* '), rendered).pass, true, 'bullet character is invisible');
assert.equal(on(rendered.replace('**bold**', '__bold__').replace('*thin*', '_thin_'), rendered).pass, true, 'emphasis delimiter is invisible');
assert.equal(on(rendered.replace('# T', '# T\n'), rendered).pass, true, 'extra blank lines are invisible');
assert.equal(on('# T\n\n- a\n- b\n\n**bold**\nand *thin*', rendered).pass, true, 'rewrapping is invisible');
// An unlabeled fence renders the same code; CommonMark leaves the info string
// optional and mandates no treatment of it, so tagging it is not graded.
assert.equal(on('# C\n\n```\nls\n```', '# C\n\n```sh\nls\n```').pass, true, 'info string is not content');
assert.equal(on('# C\n\n```sh\nls -l\n```', '# C\n\n```sh\nls\n```').pass, false, 'the code itself is content');

// The <details> gotcha, which CommonMark 4.6 does back: an HTML block ends at a
// blank line, so the list below is literal text and never renders.
const sources = (before, after) => `# I\n\n<details><summary>Sources</summary>\n${before}- [a](https://x.test/a)\n${after}</details>\n`;
const broken = sources('', '');
assert.equal(on(broken, broken).pass, false, 'a details whose list does not render fails');
assert.match(on(broken, broken).reason, /<details>/);
assert.equal(on(sources('\n', '\n'), broken).pass, true, 'air around the list makes it render');
assert.equal(on('# I\n\n<details>\n<summary>Sources</summary>\n\n- [a](https://x.test/a)\n\n</details>\n', broken).pass, true);
assert.equal(on('# I\n\n## Sources\n\n- [a](https://x.test/a)\n', broken).pass, false, 'dropping the collapsible is a content change');

// Heading hierarchy: markdownlint MD001, on the parser's own heading levels.
assert.equal(checks.noHeadingSkips(clean).pass, true);
assert.equal(checks.noHeadingSkips(messy).pass, false);
assert.equal(checks.noHeadingSkips('Title\n=====\n\nBody\n\nSub\n---\n\n#### Deep\n').pass, false, 'setext headings count');
assert.equal(checks.noHeadingSkips('## No title\n\n## Sections\n').pass, true, 'an untitled document is allowed');
assert.equal(checks.noHeadingSkips('#### Deep first\n').pass, false);
assert.equal(checks.noHeadingSkips('```md\n# not a heading\n```\n\n#### x\n').pass, false, 'a heading inside a fence is code');
assert.equal(checks.noHeadingSkips('No headings here.').pass, true);

// Negative control: an already-clean document should come back as the same
// RENDERED document. The old source-line version of this scored a
// skill-conformant answer - ATX headings, one line per paragraph - at 0.07
// against a 0.90 floor, penalising the arm for obeying the skill.
const setext = 'Title\n=====\n\nOne sentence that the author\nhard-wrapped across two lines.\n\nSub\n---\n\n- a\n- b\n';
const atx = '# Title\n\nOne sentence that the author hard-wrapped across two lines.\n\n## Sub\n\n* a\n* b\n';
const unchangedContext = (document) => ({ vars: { document }, config: { minimum: 0.9 } });
assert.equal(checks.renderedUnchanged(clean, unchangedContext(clean)).pass, true);
assert.equal(checks.renderedUnchanged(atx, unchangedContext(setext)).pass, true, 'setext, hard wraps and bullet char are invisible after rendering');
assert.equal(checks.renderedUnchanged('| a | b |\n| ----- | ----- |\n| 1 | 2 |\n', unchangedContext('| a | b |\n| --- | --- |\n| 1 | 2 |\n')).pass, true, 'realigning a table changes no cell');
assert.equal(checks.renderedUnchanged(clean, context).pass, false);
assert.equal(checks.renderedUnchanged('# Title\n\nOne sentence that the author hard-wrapped.\n\n## Sub\n\n- a\n- b\n', unchangedContext(setext)).pass, false, 'rewording a sentence is a change');
assert.equal(checks.renderedUnchanged('# Overview\n\n' + atx, unchangedContext(setext)).pass, false, 'an added heading counts against it');

// stripAndUnwrap lives in lib/ and is shared, but format-markdown is its only
// caller. Two fenced variants used to leave the wrapper on, and the document
// was then discarded as code - a complete answer scored 0.
const doc = '# Title\n\nBody text.';
assert.equal(stripAndUnwrap('```markdown\n' + doc + '\n```'), doc, 'single fence unwraps');
assert.equal(stripAndUnwrap('```md\n' + doc + '\n```\n\n'), doc, 'trailing whitespace still unwraps');
assert.equal(stripAndUnwrap('Here you go:\n\n```markdown\n' + doc + '\n```'), doc, 'a preamble still unwraps');
assert.equal(
  stripAndUnwrap('```markdown\n' + doc + '\n```\n\nOr, more compact:\n\n```markdown\n# Title\n\nBody.\n```'),
  doc,
  'two variants unwrap to the first',
);
assert.equal(stripAndUnwrap(doc), doc, 'no fence is left alone');
assert.equal(stripAndUnwrap('# Title\n\n```bash\nls\n```'), '# Title\n\n```bash\nls\n```', 'a code fence is not a wrapper');

console.log('format assertions: ok');
