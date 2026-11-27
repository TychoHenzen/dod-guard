const REQUIRED = {
  scan: ["client", "registry", "root", "out"],
  existing: ["reviews"],
  slots: ["diff", "pbi", "sub-issues", "out"],
  violations: ["scan", "diff", "out"],
  "check-plan": ["slots", "violations", "plan"],
  batches: ["plan", "head", "out-dir"],
  answers: ["plan", "head", "answers-dir", "root", "out"],
  pending: ["plan", "head", "answers-dir", "root"],
  candidates: ["scan", "diff", "pbi", "sub-issues", "plan", "results", "answers", "out"],
  build: ["head", "scan", "diff", "pbi", "sub-issues", "plan", "results", "merge", "answers", "out"],
  label: ["review-id", "comments", "out"],
  report: ["review-id", "comments"],
};
// scan without --base marks no finding as pre-existing, so a caller that
// predates the flag keeps working. answers and pending without --facts accept
// citations into the checkout only, as they did before the flag.
const OPTIONAL = { scan: ["base"], answers: ["facts"], pending: ["facts"] };
const FULL_SHA = /^[0-9a-f]{40}$/;
// The marker reader only accepts a hex head, so a build with anything else would post an undetectable review.
// The batch commands stamp or compare the head, so they take the same full-SHA check.
const HEAD_COMMANDS = new Set(["build", "batches", "answers", "pending"]);

// Every flag outside REQUIRED and OPTIONAL is refused, so a misspelled or
// retired flag stops with usage instead of being ignored. Every flag given
// needs a value, an optional one too.
function hasExactFlags(command, args) {
  const required = REQUIRED[command];
  const allowed = [...required, ...(OPTIONAL[command] ?? [])];
  const valued = (name) => Boolean(args[name]) && args[name] !== "true";
  return required.every(valued) && Object.keys(args).every((name) => allowed.includes(name) && valued(name));
}

// A merge base is compared as a commit, so only a full SHA names it exactly.
function validBase(_command, args) {
  return args.base === undefined || FULL_SHA.test(args.base);
}

function validHead(command, args) {
  return !HEAD_COMMANDS.has(command) || FULL_SHA.test(args.head);
}

const CHECKS = [hasExactFlags, validBase, validHead];

function validArgs(command, args) {
  return Boolean(args) && Object.hasOwn(REQUIRED, command) && CHECKS.every((check) => check(command, args));
}

export { validArgs };
