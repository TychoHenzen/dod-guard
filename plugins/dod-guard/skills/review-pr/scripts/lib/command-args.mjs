const REQUIRED = {
  scan: ["client", "registry", "root", "out"],
  existing: ["reviews"],
  slots: ["diff", "pbi", "sub-issues", "out"],
  violations: ["scan", "diff", "out"],
  batches: ["plan", "head", "out-dir"],
  answers: ["plan", "head", "answers-dir", "out"],
  pending: ["plan", "head", "answers-dir"],
  candidates: ["scan", "diff", "pbi", "sub-issues", "plan", "results", "answers", "out"],
  build: [
    "head",
    "scan",
    "diff",
    "pbi",
    "sub-issues",
    "plan",
    "results",
    "merge",
    "answers",
    "out",
    "scanner-comments-out",
  ],
  label: ["review-id", "comments", "out"],
  report: ["review-id", "comments"],
};
const FULL_SHA = /^[0-9a-f]{40}$/;
// The marker reader only accepts a hex head, so a build with anything else would post an undetectable review.
// The batch commands stamp or compare the head, so they take the same full-SHA check.
const HEAD_COMMANDS = new Set(["build", "batches", "answers", "pending"]);

// ASSUMPTION: no command takes an optional flag, so refusing every flag outside
// REQUIRED is safe. A misspelled or retired flag then stops with usage instead
// of being ignored.
function hasExactFlags(required, args) {
  const valued = required.every((name) => args[name] && args[name] !== "true");
  return valued && Object.keys(args).every((name) => required.includes(name));
}

function validArgs(command, args) {
  if (!(args && REQUIRED[command])) {
    return false;
  }
  if (!hasExactFlags(REQUIRED[command], args)) {
    return false;
  }
  return !HEAD_COMMANDS.has(command) || FULL_SHA.test(args.head);
}

export { validArgs };
