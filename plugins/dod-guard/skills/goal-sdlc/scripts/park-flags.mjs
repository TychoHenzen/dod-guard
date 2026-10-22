// The flags park.mjs accepts, checked before any GitHub call so a bad run exits 2 and writes nothing.
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;
const ISSUE_NUMBER = /^[1-9]\d*$/u;
const LINE_BREAK = /[\r\n]/u;
const REASON_FLAGS = ["blocked", "unblocks-when"];

// Each row is [message, passes]. The first failing row names the problem.
const FLAG_CHECKS = [
  ["--action must be park or unpark", ({ action }) => ["park", "unpark"].includes(action)],
  ["--repository must be owner/name", ({ repository }) => REPOSITORY.test(repository ?? "")],
  ["--issue must be a positive issue number", ({ issue }) => ISSUE_NUMBER.test(issue ?? "")],
];

// A bare flag parses as the string "true", which is no reason at all.
function oneLine(value = "") {
  return value.trim() !== "" && value !== "true" && !LINE_BREAK.test(value);
}

function usageProblem(args) {
  if (!args) return "arguments must be flags only";
  const failed = FLAG_CHECKS.find(([, passes]) => !passes(args));
  if (failed) return failed[0];
  const unusable = args.action === "park" ? REASON_FLAGS.find((name) => !oneLine(args[name])) : null;
  return unusable ? `--${unusable} must be one nonblank line` : null;
}

export { usageProblem };
