// Every check here traces to a claim in the skill's frontmatter description:
// a record that preserves ONE significant technical decision, its CONTEXT,
// STATUS, and CONSEQUENCES, as a LIGHTWEIGHT durable record. Nothing here
// grades section order, heading text, or the authoring procedure.
//
// Only the checks that need real computation live here. Status presence is a
// `regex` assertion in tests/cases.yaml and the length ceiling is a `not-regex`
// in promptfooconfig.yaml, because promptfoo does those natively.

// Sentence-initial capitals and filler, dropped so `carriesTaskSpecifics`
// looks for the situation's own nouns and numbers rather than English.
const STOP = new Set('the we it if so but and not every nobody wanted whatever please also then four sometime worth this that they he she his her our their you a an of to in on at for with from is was are were be been have has had will would can could should there here what which who when where why how yes no ok okay quick short half both all one two three them its'.split(' '));

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function config(context) {
  return context?.config || {};
}

// Claim: the record preserves the decision's CONTEXT. Context is the forces
// that made the choice non-obvious, so this diffs the document against the
// task: a record carrying none of the situation's own names and numbers has
// preserved nothing a reader could not have guessed.
function carriesTaskSpecifics(output, context) {
  const minimum = Number(config(context).minimum || 3);
  const task = String(context?.vars?.task || '');
  const text = String(output).toLowerCase();
  const wanted = new Set();
  for (const token of task.match(/\b[\w][\w./-]*\b/g) || []) {
    const lower = token.toLowerCase();
    if (lower.length < 2 || STOP.has(lower)) continue;
    if (!/\d/.test(token) && !/^[A-Z]/.test(token)) continue;
    wanted.add(lower);
  }
  const carried = [...wanted].filter((token) => text.includes(token));
  return result(carried.length >= minimum, `Carried ${carried.length}/${wanted.size} specifics from the note (${carried.slice(0, 6).join(', ') || 'none'}); expected at least ${minimum}.`);
}

module.exports = {
  carriesTaskSpecifics,
};
