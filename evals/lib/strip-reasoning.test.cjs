// Offline check on stripAndUnwrap(). `node lib/strip-reasoning.test.cjs`.
// The unwrapper has two jobs that pull against each other: end at the fence
// that closes the wrapper (two offered variants must unwrap to the first), and
// survive a wrapped answer that contains code fences of its own (a non-greedy
// regex cut at the inner fence and the grader scored the fragment).
const assert = require('node:assert');
const { stripAndUnwrap, stripReasoning, fenceBlocks, unwrapFence } = require('./strip-reasoning.js');

const wrap = (lang, body) => '```' + lang + '\n' + body + '\n```';

// --- the truncation this file exists for ------------------------------------

const nested = [
  '# Title',
  '',
  'Some prose.',
  '',
  '```python',
  'print("hi")',
  '```',
  '',
  'Closing prose.',
].join('\n');
assert.strictEqual(stripAndUnwrap(wrap('markdown', nested)), nested, 'a nested code block truncated the answer');

// Four backticks outside, three inside - the inner fence cannot close the outer.
assert.strictEqual(stripAndUnwrap('````md\n' + nested + '\n````'), nested, 'a longer outer fence truncated');

// Two levels of nesting, and an inner fence tagged with a language.
const twice = '# T\n\n````markdown\n```js\nx\n```\n````\n\nEnd.';
assert.strictEqual(stripAndUnwrap(wrap('markdown', twice)), twice, 'two levels of nesting truncated');

// CRLF input keeps its line endings and still finds the close.
assert.strictEqual(
  stripAndUnwrap('```markdown\r\n# T\r\n\r\n```py\r\nx\r\n```\r\n```\r\n'),
  // The body keeps its CRLFs; only the last line's terminator belonged to the
  // closing fence, which is what the old regex captured too.
  '# T\r\n\r\n```py\r\nx\r\n```\r',
  'CRLF truncated or lost its line endings',
);

// --- the behaviour that must not regress ------------------------------------

const doc = '# Title\n\nBody text.';
assert.strictEqual(stripAndUnwrap(wrap('markdown', doc)), doc, 'single fence unwraps');
assert.strictEqual(stripAndUnwrap(wrap('md', doc) + '\n\n'), doc, 'trailing whitespace still unwraps');
assert.strictEqual(stripAndUnwrap('Here you go:\n\n' + wrap('markdown', doc)), doc, 'a preamble still unwraps');
assert.strictEqual(
  stripAndUnwrap(wrap('markdown', doc) + '\n\nOr, more compact:\n\n' + wrap('markdown', '# Title\n\nBody.')),
  doc,
  'two variants must unwrap to the first',
);
// ...including when the first variant carries a code block of its own.
assert.strictEqual(
  stripAndUnwrap(wrap('markdown', nested) + '\n\nOr, more compact:\n\n' + wrap('markdown', doc)),
  nested,
  'a nested block made the second variant win',
);

assert.strictEqual(stripAndUnwrap(doc), doc, 'no fence is left alone');
assert.strictEqual(stripAndUnwrap(''), '', 'empty output survives');
assert.strictEqual(stripAndUnwrap('# Title\n\n```bash\nls\n```'), '# Title\n\n```bash\nls\n```', 'a code fence is not a wrapper');

// An unterminated wrapper: everything after the opening line beats nothing.
assert.strictEqual(stripAndUnwrap('```markdown\n' + nested), nested, 'an unterminated fence returned the wrong body');

// --- stripReasoning, which stripAndUnwrap runs first -------------------------

const leak = 'Let me think about the shape of this.\n\n' + nested;
assert.strictEqual(stripReasoning(leak), nested, 'a leaked deliberation line was not stripped');
assert.strictEqual(stripReasoning(doc), doc, 'a clean answer was rewritten');
// The wrapper still comes off after a leak, without losing the inner block.
assert.strictEqual(stripAndUnwrap('Let me draft that.\n\n' + wrap('markdown', nested)), nested, 'leak plus wrapper');

// --- fenceBlocks: every match, which unwrapFence returns the first of --------
// Four suites pick their block by its content, so they need all of them.

const two = wrap('json', '{"a": 1}') + '\n\ntext\n\n' + wrap('json', '{"b": 2}');
assert.deepStrictEqual(
  fenceBlocks(two, /^(?:json)?$/i).map((b) => b.body),
  ['{"a": 1}', '{"b": 2}'],
  'the second block was lost',
);
// Scanning resumes AFTER the close, so a closed block is never re-entered and
// its own body never yields a second block. (An empty info string is a legal
// opener for most callers, so this uses one that is not, to isolate the point.)
assert.deepStrictEqual(
  fenceBlocks(wrap('json', '{"a": 1}\n```sh\nls\n```') + '\n\n' + wrap('json', '{"c": 3}'), /^json$/i)
    .map((b) => b.body),
  ['{"a": 1}\n```sh\nls\n```', '{"c": 3}'],
  'a nested fence split the first block or hid the second',
);
// Depth, not parity: the nested block belongs to the body, not to the list.
assert.deepStrictEqual(
  fenceBlocks(wrap('markdown', nested), /^markdown$/).map((b) => b.body),
  [nested],
  'a nested code block truncated or split the block',
);
// The info string comes back, because commit-authoring parses it as content.
assert.deepStrictEqual(
  fenceBlocks('```refactor: use the upstream helper\n\nbody\n```', /^/),
  [{ info: 'refactor: use the upstream helper', body: '\nbody' }],
  'the info string was dropped',
);
// A run of backticks glued to the end of a sentence is inline code, not a
// fence, which is what mermaid-lint and every other markdown reader thinks.
assert.deepStrictEqual(
  fenceBlocks('Here it is again.```json\n{"a": 1}\n```', /^json$/i),
  [],
  'a mid-line backtick run opened a block',
);
// Unterminated: the rest of the answer, and nothing after it to find.
assert.deepStrictEqual(
  fenceBlocks('```json\n{"a": 1}', /^(?:json)?$/i).map((b) => b.body),
  ['{"a": 1}'],
  'an unterminated block returned the wrong body',
);
assert.deepStrictEqual(fenceBlocks('no fences here', /^/), [], 'found a block in plain prose');
// unwrapFence is exactly the first of these, and null when there are none.
assert.strictEqual(unwrapFence(two, /^json$/i), '{"a": 1}', 'unwrapFence drifted from fenceBlocks[0]');
assert.strictEqual(unwrapFence(two, /^rust$/i), null, 'unwrapFence invented a block');

console.log('ok   strip-reasoning (nested fence, two variants, unterminated, no fence, fenceBlocks)');
