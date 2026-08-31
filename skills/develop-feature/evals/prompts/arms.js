const { dir: repoDir } = require('../lib/repo.js');
const { withPersonaEveryArm } = require('../../../../evals/lib/arms.js');

// Deliberately asks for a PLAN, never code. Implementations have no single
// ground truth (many are valid), which review-code's suite doesn't have to
// solve because a review is graded against what a diff actually does. A plan
// is graded against the repo it was written for instead: does it name what's
// already there before proposing to build.
// The task text names no part of the workflow the graders score. An earlier
// version asked for "what you found already in the codebase that's relevant,
// and what you're deliberately not building" - which told BOTH arms to do the
// reuse lookup namesExistingSolution grades and the scoping the plan_quality
// rubric's item 3 grades, so neither could separate the arms (evals/AGENTS.md
// "Foreclosed by the prompt"). It showed in the artifacts: the baseline named
// something it was deliberately not building on 91% of rows. "Give me the
// plan" also presupposed there was something to build, which fought the three
// negative controls whose correct answer is "nothing to build".
const arms = require('../../../../evals/lib/arms.js')('develop-feature', (vars) => `${vars.request}

We're working in the cli/cli codebase (the GitHub CLI, Go). You have a
read_source tool to look around the tree before you answer - use it.

Don't write the implementation - tell me how you'd approach this.`);

// repoDir goes to EVERY arm, exactly as in review-code's prompts/arms.js: the
// codebase a plan is written against is the subject matter, not a skill
// affordance. Gating it on the skill would make the delta measure file
// access instead of the skill. skillDir stays skill-only.
const withRepo = (fn, extra = {}) => (ctx) => ({
  prompt: fn(ctx),
  config: { repoDir: repoDir(), ...extra },
});

// One persona, shared by all four cases (withPersonaEveryArm takes a single
// object, not one per case) - so it has to be written generic enough to be
// true of whoever typed any of these requests, and blind to every case's
// answer. It must never name a library, file, or interface: case 1's persona
// mentioning "backoff" would hand the model the literal answer the case tests
// whether it finds unaided. "doesNotKnow" is what makes ask_user a real
// tool and not a free hint - anything about the codebase's internals gets a
// refusal, not a guess, so a model that asks "should I use library X" learns
// nothing it didn't already know.
const persona = {
  knows: 'Only the problem as already described in the request - I have not looked at the code myself.',
  wants: 'Exactly the outcome described in the request, nothing more specific than that. If there is a way to get there with less new code, that is fine by me.',
  doesNotKnow: 'Anything about the codebase - which files, functions, interfaces, or libraries are involved, or whether something like this already exists elsewhere in the code. That is the assistant\'s call to make, not mine.',
};

module.exports = withPersonaEveryArm(persona, {
  noSkill: withRepo(arms.noSkill),
  skillCurrent: withRepo(arms.skillCurrent, { skillDir: arms.skillDir }),
  skillNext: withRepo(arms.skillNext, { skillDir: arms.skillDir }),
});
