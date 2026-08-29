// The graders live in lib/agents-md-effect.js so a second repo gets them from
// the harness install step (the workflow copies evals/lib wholesale) and has to
// write only tests/cases.yaml. This file is the suite's file:// entry point.
//
// Named re-exports, not `module.exports = require(...)`: lib/check-suite.py
// resolves every `file://...:fn` by parsing this source for export names, and a
// bare pass-through would make it report a dangling grader on a working suite.
const effect = require('../../../lib/agents-md-effect.js');

exports.followsStatedCommand = effect.followsStatedCommand;
exports.taskCorrect = effect.taskCorrect;
exports.unmentionedUnchanged = effect.unmentionedUnchanged;
