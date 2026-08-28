// Offline check on stripAndUnwrap(). `node lib/strip-reasoning.test.cjs`.
// The unwrapper has two jobs that pull against each other: end at the fence
// that closes the wrapper (two offered variants must unwrap to the first), and
// survive a wrapped answer that contains code fences of its own (a non-greedy
// regex cut at the inner fence and the grader scored the fragment).
const assert = require('node:assert');
const { stripAndUnwrap, stripReasoning } = require('./strip-reasoning.js');

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

console.log('ok   strip-reasoning (nested fence, two variants, unterminated, no fence)');
