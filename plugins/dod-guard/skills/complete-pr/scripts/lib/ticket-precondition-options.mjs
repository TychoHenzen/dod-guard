// Argument parsing for ticket-preconditions.mjs.
import { parseArgs } from "../../../../lib/args.mjs";
import { REPOSITORY_NAME } from "../../../../lib/repository-identity.mjs";

const ISSUE_NUMBER = /^[1-9][0-9]*$/u;
const OPTION_CHECKS = {
  // A flag given without a value parses as "true" or "", and neither names a Status.
  "expect-status": (value) => value !== "" && value !== "true",
  issue: (value) => ISSUE_NUMBER.test(value),
  repository: (value) => REPOSITORY_NAME.test(value),
};

function hasExactlyTheOptions(args) {
  const names = Object.keys(OPTION_CHECKS);
  return Object.keys(args).length === names.length && names.every((name) => name in args);
}

function hasUsableValues(args) {
  return Object.entries(OPTION_CHECKS).every(([name, usable]) => typeof args[name] === "string" && usable(args[name]));
}

// Null is a usage error, answered before any GitHub read, so a typo never costs a request.
function optionsOf(argv) {
  const args = parseArgs(argv);
  if (args === null || !hasExactlyTheOptions(args) || !hasUsableValues(args)) {
    return null;
  }
  return { repository: args.repository, issue: args.issue, expected: args["expect-status"] };
}

export { optionsOf };
