# Format Markdown Eval

Measures whether loading `skills/format-markdown` changes the document the model hands back. Each case is a document someone wrote in a hurry plus the way they actually asked for help with it. The ask never names the defect, so recognising what is wrong with the document is part of what is graded.

## The line every grader sits on

Format is this skill's subject, which looks like it collides with the suite-wide rule "never assert on format". It does not, and the line is one question: **does the property change the rendered document, or only the source bytes?**

Legitimate, because rendering decides it: which text points at which URL, what a code block contains, what words a reader sees, whether the list inside a `<details>` renders at all.

Not graded, because rendering cannot see it: blank lines around blocks, `-` versus `*`, `**` versus `__`, one H1 or two, stacked blank lines, hard wrapping, and the fenced-code info string (CommonMark 0.31.2 leaves it optional and "does not mandate any particular treatment" of it, so there is no authority for requiring a language tag).

Everything deterministic here therefore goes through `markdown-it`, not through string matching.

## What is graded

- **`preserved`** - one grader for "preserves all content and links exactly", over the parse of the input and the parse of the output: every `(link text, target)` **pair** survives, paired and in document order; every code block body comes back byte-identical; the rendered text of the input is contained in the output's; and every `<details>` still renders the blocks its source holds.
- **`heading_hierarchy`** - levels descend one at a time, on the parser's own heading levels so setext headings and `#` inside a fence both land correctly. The authority is markdownlint MD001 and the skill's own frontmatter. Not accessibility: axe-core's `heading-order` is a Deque best practice, and WCAG 2.2 Understanding 1.3.1 does not require sequential levels.
- **`readability`** - `llm-rubric` for scannability, **on the nine dirty cases only**: four items, each quoted from the delivered document before it is scored, 0.25 apiece. The one gate left at `0.0` is "no document came back at all", which is how the baseline arm most often fails. The bands it replaced ("one soft spot", "largely as it arrived") were unrankable by anything countable and wandered between identical runs.

  It used to sit in `defaultTest` and grade all twelve. Its first two items pay for shortening a prose run and for moving prose into a heading or list, which is exactly what `unchanged_when_clean` fines on an already-clean document - the same behaviour scored with opposite signs. The N/A escape hatches on those two items were meant to cover it and did not: on `already clean, mostly fenced commands` the skill arm changed nothing, scored `unchanged_when_clean` 1.00, and lost 0.40 here for leaving a run it was right to leave. Scoping beats rewording, so the two metrics now partition the suite. Excluding the controls costs the metric most of its apparent delta (+0.117 over twelve, +0.022 over the nine) - that delta was the conflict, not the skill.

  A fifth item, "it is still the same document", is cut: `preserved` computes the same property against the input. It was not merely redundant but wrong - on `reference links`/skill-current the judge failed it for "adds three link definitions" while `preserved`, rendering both documents, scored 1.00, because a reference definition is invisible after rendering and its target was already in the source.
- **`unchanged_when_clean`** - `renderedUnchanged`, on the three negative controls: the share of rendered blocks - heading level plus text, one entry per list item, table cell, paragraph and code body - that input and output share, over whichever has more, so an added heading counts against it as well as a lost paragraph. It is the strict end of `preserved` and runs on the same parse, so setext headings, hard wraps, bullet character and fence info strings are as invisible here as they are everywhere else in this suite.

`preserved` restores two pieces of missing air on **both** sides before comparing content: the blank line a link reference definition needs to be a definition, and the blank line an HTML block needs before the Markdown inside it renders. That keeps the content comparison about content. Whether the delivered document actually has that air is graded separately, against the output as written, in the `<details>` half of `preserved`.

## Known ceiling

`preserved` compares rendered **text** as a multiset, so a link-free paragraph moved under a different heading is still invisible to it. A paragraph carrying a link is caught, because the pairs are compared in order. Read a green `preserved` as "nothing was lost and no link was repointed", not as "every fact is still in the right place". Only the judge sees placement in general.

The text comparison tolerates losing up to 5% of content words (or two words, whichever is larger). That headroom exists because converting a run-on sentence into a bold-label list absorbs connective verbs - "a severity one incident means" becomes "**Severity one** -" - and without it the arm that formats correctly would score below the arm that changes nothing. Numbers and proper nouns get no such tolerance.

## Cases

Twelve documents. Nine carry real mess: skipped heading levels, three bullet characters at once, unlabeled fences, a ragged table, stray HTML around a `<details>` sources block, reference-style links, a support policy written as three walls of text, crammed whitespace, and a document with no title. These nine, and only these, carry `readability`.

Three are negative controls, all already clean, and all graded by `renderedUnchanged` and never by `readability`: well-formed prose with headings, a document that is mostly a table, and one that is mostly fenced commands. The right answer to all three changes almost nothing.

A fourth, written with setext headings and hard-wrapped paragraphs, was cut. Under the old source-line grader it scored an answer that did exactly what the skill mandates - "one line per paragraph... let it soft-wrap" - at 7% against a 90% floor, and the table control at 78% for realigning one header row. Both were the grader comparing source bytes while every other grader in this suite compares the rendered document. Under `renderedUnchanged` both score 1.00, which is also why the setext case no longer measures anything the other three do not.

Restraint was measured on one document before this: the baseline title-cased every heading, added a horizontal rule and appended a "Changes made:" section, while the skill arm returned the document byte-identical. One case cannot carry that claim - `sd` on a single cell swamps the effect - so the shape of the clean document is varied instead.

## Open finding against the skill

`no title - status page` scored `readability` **0.00 in both arms**. The skill arm invented a title, an "Actions for today" section and a "Notes" section, directly against the skill's own stated gotcha: "If the document has no title... do not promote an H2 to H1 - add a title only if the document clearly needs one." The eval is right and the skill is wrong; the case and its rubric stay as they are.

## Run

See `../../../evals/AGENTS.md`. Both gates are free:

```sh
npm install --prefix ../../../evals   # once; the graders need markdown-it
node assertions/format.test.cjs
npx promptfoo@latest validate config -c promptfooconfig.yaml
```
