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

// format-markdown's graders diff the output against the input document, so a
// model that wraps its answer in a ```markdown fence has to be unwrapped first.
// Deliberately unanchored: a model that offers two fenced variants used to be
// left wrapped, and the grader's fence-stripping then deleted the whole
// document as if it were code, scoring a correct answer 0. The first fence is
// the answer; anything after it is an alternative.
function stripAndUnwrap(output) {
  const text = stripReasoning(output);
  const wrapped = text.match(/```(?:markdown|md)[ \t]*\n([\s\S]*?)\n```/i);
  return wrapped ? wrapped[1] : text;
}

module.exports.stripAndUnwrap = stripAndUnwrap;
