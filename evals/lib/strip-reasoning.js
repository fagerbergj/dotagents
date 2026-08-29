// The gateway's models sometimes emit their deliberation as message content.
// Anchoring on the first heading does not work: a leak can precede a document
// with no heading at all, or sit BETWEEN two copies of one, so the answer is
// whatever follows the LAST line-initial deliberation phrase.
const TELL = new RegExp(String.raw`^(?:Thinking:|Hmm[,.]|Wait[,.]|Final decision:|Looking at the note|Let me (?:think|re-read|reconsider|be|also|start|check|make|write|finalize|draft)|Actually,? (?:let me|I'll|I will)|OK(?:ay)?,? (?:so|let me)|The user (?:wants|asked|is asking))`, 'i');

function stripReasoning(output) {
  const text = String(output);
  const lines = text.split('\n');

  // Never treat anything inside a fence as deliberation.
  let fenced = false;
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
    if (!fenced && TELL.test(lines[i].trim())) last = i;
  }
  if (last === -1) return text;

  const rest = lines.slice(last + 1).join('\n').replace(/^\s*\n/, '');
  // If stripping leaves nothing usable, the "tell" was part of the answer.
  return rest.trim().length >= 40 ? rest : text;
}

module.exports = { stripReasoning, TELL };

// Fence extraction, shared by every suite that reads a fenced answer. A
// non-greedy regex stopped at the first closing fence, so an answer containing
// a code block of its own was cut there and the
// grader scored the fragment; fence parity does not catch it either, since a
// wrapper plus one inner block is an even number of fences. Track depth instead
// and end at the fence that closes the opening one - which also keeps the
// two-variants behaviour above, since that close is still the first one.
// ponytail: an inner fence with no language tag is indistinguishable from the
// outer close and still truncates; nesting models label the inner fence.
function fenceAt(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r$/, ''));
  return match ? { char: match[1][0], len: match[1].length, info: match[2].trim() } : null;
}

// Every matching block, in order, each ending at the fence that closes its own
// opener - the depth-safe replacement for `matchAll(/```lang\n([\s\S]*?)```/g)`.
// Graders that pick a block by its *content* (the OpenAPI document among the
// example payloads, the card among the snippets) need all of them, so they
// cannot be written on unwrapFence alone. `info` comes back with the body
// because a commit answer glues its header to the fence.
function fenceBlocks(text, infoAllowed) {
  const lines = String(text).split('\n');
  const blocks = [];
  for (let start = 0; start < lines.length; start += 1) {
    const open = fenceAt(lines[start]);
    if (!open || !infoAllowed.test(open.info)) continue;
    const stack = [open];
    let i = start + 1;
    for (; i < lines.length; i += 1) {
      const fence = fenceAt(lines[i]);
      if (!fence) continue;
      const top = stack[stack.length - 1];
      if (!fence.info && fence.char === top.char && fence.len >= top.len) {
        stack.pop();
        if (!stack.length) break;
      } else {
        stack.push(fence);
      }
    }
    // Unterminated wrapper: the rest of the answer beats returning nothing,
    // and there is nothing after it to scan.
    blocks.push({ info: open.info, body: lines.slice(start + 1, i).join('\n') });
    start = i;
  }
  return blocks;
}

function unwrapFence(text, infoAllowed) {
  const [first] = fenceBlocks(text, infoAllowed);
  return first ? first.body : null;
}

// format-markdown's graders diff the output against the input document, so a
// model that wraps its answer in a ```markdown fence has to be unwrapped first.
// Deliberately unanchored: a model that offers two fenced variants used to be
// left wrapped, and the grader's fence-stripping then deleted the whole
// document as if it were code, scoring a correct answer 0. The first fence is
// the answer; anything after it is an alternative.
function stripAndUnwrap(output) {
  const text = stripReasoning(output);
  const wrapped = unwrapFence(text, /^(?:markdown|md)$/i);
  return wrapped === null ? text : wrapped;
}

module.exports.stripAndUnwrap = stripAndUnwrap;
module.exports.unwrapFence = unwrapFence;
module.exports.fenceBlocks = fenceBlocks;
