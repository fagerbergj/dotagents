---
name: comment-authoring
description: >
  How to write code comments that earn their keep - what to comment, what to delete, and how
  short a comment must stay. Covers inline comments, module/file-level context, bug-fix
  comments, TODOs, and doc comments (godoc/JSDoc) at API boundaries. Use when writing new
  comments, reviewing comments in a diff, or auditing existing comments for staleness or bloat.
license: MIT
metadata:
  author: fagerbergj
  author_url: https://github.com/fagerbergj
  repository: https://github.com/fagerbergj/dotagents
  version: "1.0"
---

# Comment Authoring

A comment earns its place only by saying what the code cannot: a non-obvious *why*, a constraint or invariant, the ceiling of a deliberate shortcut, or a warning that stops the next person breaking something. Everything else - what the code plainly does, how the team got here, an incident's blow-by-blow - belongs in the commit message (see `commit-authoring`) or nowhere.

## When to Use

Writing a new comment, reviewing comments in someone else's diff, or auditing an existing file where comments have drifted from the code.

## When NOT to Use

- Explaining the fix's history, root cause, or scope - that's the commit body (`commit-authoring`), not the source file.
- Documenting a design decision's rationale for posterity - that's an ADR (`adr-authoring`) if it's significant enough to need one.
- The fix itself is a rename or a simpler structure - see Delete-Don't-Defend below before reaching for a comment at all.

## The Rule: Say What the Code Cannot

| Keep | Cut |
|---|---|
| Non-obvious *why* - the constraint that made this the right call | What the code plainly does (`i++ // add one to i`) |
| An invariant or constraint the next editor must not violate | How the team got here (that's the commit) |
| The ceiling of a deliberate shortcut - what it doesn't handle | An incident narrative - dates, ticket/node IDs, token counts, quoted output |
| A warning that prevents a specific, non-obvious mistake | Praise, apology, or commentary on the code's quality |
| A link to the algorithm or spec being implemented | Rejected alternatives or a change history |

If a comment could be deleted by renaming a variable or extracting a function, that's the fix - not the comment. See Delete-Don't-Defend.

## Length Ceiling: ~3 Lines

If one line of code needs three or more lines of comment, the comment is too long - simplify the code or cut the comment down to the one clause that matters. A load-bearing war story compresses to a single clause:

```go
// performance hack: this redundant allocation avoids a GC pause on the hot path.
var cache *Entry
```

Not a paragraph, not a timeline, not a link to the incident. If the constraint needs more than a clause to state, it usually means the constraint itself needs a smaller, plainer explanation - not a longer comment.

## Delete-Don't-Defend

Two failure modes, two fixes:

- **A comment restates the code.** Delete it. `x = x + 1 // increment x` adds nothing and will drift the first time the line changes.
- **A comment excuses an unclear name.** Don't keep the comment - rename. `n = best_node // n is the best node candidate` should be `bestNode = ...` with no comment at all.

## Wrong Beats Absent - Never

A stale comment actively misleads; an absent one just leaves a gap. Change the comment in the same commit as the code it describes, every time - a comment that survived a refactor unchanged is a bug, not documentation.

## Module and File-Level Context

A short comment at the top of a file or module that states the one thing that makes everything below it click is disproportionately valuable - it can replace dozens of line-level comments. Keep it to two or three lines: what this thing is, in terms the reader doesn't already have.

```go
// Array of tuples, except the tuples aren't boxed: slots may be pointers,
// but the tuples themselves are inlined directly into the array.
```

## Bug-Fix Comments

Capture the root-cause constraint in a clause. The incident - date, ticket number, node ID, who found it - goes in the commit message, never the source.

Bad (incident narrative in the source):
```python
# Fixed 2026-08-03 after node abc123 crashed in prod, see INC-4521. Root
# cause was a nil session map during the 3am batch job. Also cleaned up
# the retry logic while here.
if session_map is None:
    session_map = {}
```

Good (the constraint, nothing else):
```python
# Guard a nil map on first request - RunNode doesn't initialize
# session state until the first event lands.
if session_map is None:
    session_map = {}
```

## TODOs and Commented-Out Code

A TODO is scoped and actionable - what's missing and, where it matters, an issue reference. `// TODO: handle empty input` with no more context than that is a confession, not a plan. Commented-out code is never committed: version control already has the deleted version: delete the comment along with the code, not the other way around.

## Doc Comments Are a Different Contract

At an API boundary (godoc, JSDoc, docstrings), the doc comment documents the *contract* - usage, arguments, return values, errors - not the implementation. It answers "how do I call this and what can go wrong," which is a different question than an inline comment answers, and it doesn't restate the signature the reader can already see (`removes elt from t` above a function called `remove(t, elt)` says nothing new).

## Check Before Committing

Says why, not what · fits in ~3 lines or fewer · no dates/IDs/token counts/quoted output · would survive a rename-the-variable test (i.e., isn't excusing a bad name) · changed in this same commit if the code it describes changed.

## Resources

`references/sources.md` - full source list and attribution for the examples above; load only if you need to cite a claim.
