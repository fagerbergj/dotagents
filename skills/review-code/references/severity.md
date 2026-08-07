# Severity: what blocks, what doesn't

The dividing line is not how strongly you feel. It is whether you can point at something objective.

> Technical facts and data overrule opinions and personal preferences.
> — Google, *The Standard of Code Review*

A finding supported only by your preference is a `nit:`, however sure you are. A finding supported by an anchor below is `blocking:`, however small it looks.

## The anchors

`blocking:` requires ONE of these, and the finding must say which:

| Anchor | What it means | Not this |
|---|---|---|
| **defect** | Concrete inputs or state produce wrong output, a crash, or data loss | "This feels fragile" |
| **security** | Auth flaw, unvalidated input, injection, PII or secret exposure | "I'd sanitise this differently" |
| **design** | A *named* principle violated — SRP, coupling, complexity that can't be followed without explanation | "I'd have structured it differently" |
| **scope** | The change does something its task never asked for | A pre-existing wart in adjacent code |
| **tests** | New or changed behaviour ships with no test, or a test passes while what it claims to cover is broken | "I'd add more tests eventually" |

There is deliberately no *intent* anchor.
A human reviewer blocking on "I don't understand this" is healthy scepticism; an automated reviewer doing it would block on anything unfamiliar, at any hour, with nobody to argue back.
See **Unclear intent** below for where it goes instead.

`suggestion:` — a better approach exists and you say **why**, citing a principle or a measurement.
The author may decline and merge anyway.

`nit:` — style or preference **not** governed by the project's style guide or linter.
The author may ignore it. Never blocks.

`question:` — you suspect a problem but aren't sure.
Asking resolves it faster than demanding a change. Never blocks on its own.

`praise:` — summary only, never inline.

## Hard rules

**The style guide and the linter are the authority on style.**
A point the linter already enforces is the linter's job, not a finding.
Where no convention exists, accept the author's choice rather than inventing one.

**Design is not style.**
"Aspects of software design are almost never a pure style issue or just a personal preference. They are based on underlying principles and should be weighed on those principles, not simply by personal opinion" (Google).
Naming the principle is what separates a design block from a taste argument.

**Out of scope is not blocking here.**
Concerns about adjacent code the change doesn't touch belong in a separate issue.
Raise them, file them, don't hold this change hostage to them.

**Forward progress.**
Approve a change that clearly improves overall code health even if it isn't perfect.
There is no perfect code, only better code.
Blocking a net improvement on polish costs more than the polish is worth.

**Unclear intent does not block — it becomes a stated gap.**
If you cannot verify correctness because you don't understand the change, raise it as a `question:` naming *what specifically* you could not determine, and let the verdict be `comment` with that gap stated.
That is what a `comment` verdict is for.

**Never assert behaviour about code you didn't open.**
A finding about code you never read is fabrication, whatever label you put on it.

## The verdict follows mechanically

- Any surviving `blocking:` → **request changes**
- None → **approve**, even with suggestions and nits outstanding; say explicitly that they're non-blocking
- **comment** only when you genuinely have neither a block nor a green light, such as verification you could not finish. Say what you couldn't verify.

A `comment` verdict with no blocking findings and no stated gap carries no signal: it neither stops a merge nor endorses one.

## Worked calls

**Blocks.** `drawCard` does `copy.shift()!` with no empty-deck guard.
A non-null assertion is not a check, and once the deck is exhausted this throws.
Anchor: defect, with the inputs stated.

**Blocks.** `dealerDrawRule` is exported and tested, but the game inlines its own copy and never calls it.
The suite passes while the played rule drifts from the tested rule, silently.
Anchor: tests.

**Blocks.** A handler merges results from two stores; no test configures both.
Anchor: tests — the failure mode is "this breaks and nothing tells you".

**Does not block.** Two constants both default to 50 and could drift.
Real, worth fixing, no scenario where it misbehaves today. `suggestion:`.

**Does not block.** `startsWith('/memory')` also matches `/memory-export`.
With two routes today nothing breaks, but say so — it's a latent defect rather than a taste call. `suggestion:`.

**Nit.** Import ordering the linter doesn't enforce.

## Sources

- [The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html) — Google. Facts over preferences; style guide as authority; design is not style; approve on net improvement.
- [Reviewer Guidance](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/) — Microsoft. Business-logic and test correctness as the reviewer's focus; tests ship in the same PR; scope discipline.
- [Code Review Values](https://handbook.gitlab.com/handbook/engineering/workflow/reviewer-values/) — GitLab. Blocking vs non-blocking taxonomy.
- [Conventional Comments](https://conventionalcomments.org/) — the label vocabulary; `nitpick` as non-blocking by nature.
- [How we review PRs](https://posthog.com/handbook/engineering/how-we-review) — PostHog. Approve / Comment / Request Changes semantics.
- [Use prefixes to improve code review communication](https://www.ssw.com.au/rules/use-prefixes-to-improve-code-review-communication) — SSW. Prefix-to-blocking mapping.
