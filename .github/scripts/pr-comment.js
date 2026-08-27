// Post one of this workflow's comments, marking its earlier ones as outdated.
//
// Called from actions/github-script, which supplies `github` and `context`:
//   await require(`${process.env.GITHUB_WORKSPACE}/.github/scripts/pr-comment.js`)({
//     github, context, markers: ['<!-- dotagents-evals'], body,
//   });
//
// Stale comments are collapsed with GitHub's own `minimizeComment` mutation
// rather than by rewriting their bodies: it keeps the original text, renders as
// the native "marked as outdated" collapse, and a human can expand or
// un-minimize it from the UI. Rewriting would destroy the numbers a reader
// wants to compare against.
//
// `markers` are HTML comment strings this workflow puts at the top of its own
// bodies; a prefix like '<!-- dotagents-evals' matches every variant of ours.
// The marker is paired with `viewerDidAuthor` so that a human who happens to
// quote a marker in their own comment can never have it collapsed - the token
// only ever minimizes what the token itself posted. Already-minimized comments
// are skipped; re-minimizing is a no-op but the round trip is not.
//
// `body` may be a function, which receives the stale comments about to be
// minimized. That is how the "what will run" comment can tell a reader that an
// eval already ran on an earlier push - it cannot know that until this query
// has run, and the query should only happen once.
//
// Callers must guard this for fork PRs: under plain `pull_request`,
// GITHUB_TOKEN is read-only for a fork no matter what `permissions:` says, so
// both the mutation and the post 403.
module.exports = async ({ github, context, markers, body }) => {
  const { owner, repo } = context.repo;
  const number = context.issue.number;

  const { repository } = await github.graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
       repository(owner: $owner, name: $repo) {
         pullRequest(number: $number) {
           comments(last: 100) { nodes { id body isMinimized viewerDidAuthor } }
         }
       }
     }`,
    { owner, repo, number },
  );

  const stale = repository.pullRequest.comments.nodes
    .filter((c) => c.viewerDidAuthor && !c.isMinimized && markers.some((m) => c.body.includes(m)));

  // Collapsing an old comment is housekeeping; posting the new one is the job.
  // A transient minimize failure must not abort the script and lose the report,
  // so each is tried independently and its failure only warns.
  for (const c of stale) {
    try {
      await github.graphql(
        `mutation($id: ID!) {
           minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) {
             minimizedComment { isMinimized minimizedReason }
           }
         }`,
        { id: c.id },
      );
    } catch (err) {
      // console, not `core`: this module is called with { github, context,
      // markers, body } and has no `core` in scope - and optional chaining does
      // not save an undeclared identifier, it throws. github-script surfaces
      // console output in the job log either way.
      console.warn(`could not minimize comment ${c.id}: ${err.message}`);
    }
  }

  // GitHub rejects a comment body over 65536 characters. Ten suites of tables
  // and grader reasons can get there, and a 422 would lose the whole report.
  const LIMIT = 65000;
  let text = typeof body === 'function' ? body(stale) : body;
  if (text.length > LIMIT) {
    text = `${text.slice(0, LIMIT)}\n\n_Truncated at GitHub's comment size limit. The full per-suite reports are in the run artifacts._\n`;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body: text,
  });

  console.log(`minimized ${stale.length} earlier comment(s), posted 1 new`);
  return stale;
};
