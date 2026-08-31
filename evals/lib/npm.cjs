// Suites live beside their skills (skills/<name>/evals/), outside evals/, so
// bare specifiers in suite files cannot reach evals/node_modules by walking
// up - and NODE_PATH is ignored by the ESM resolver. Both require and import
// resolve relative to THIS file, so routing shared npm deps through it anchors
// them in evals/node_modules for suites anywhere in the repo.
module.exports = { require, import: (spec) => import(spec) };
