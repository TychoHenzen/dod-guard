// The OpenSpec format gate of refine-backlog-item. It maps a read-back issue
// body into an OpenSpec change, validates that change with
// `openspec validate --strict` in a temporary root, and prints every problem
// with the requirement or criterion id it came from.
//
//   node openspec-format-check.mjs --body-file=<path>
//
// Exit 0: the body is valid. Exit 1: the mapper or OpenSpec reported a
// problem. Exit 2: a bad argument, an unreadable body file, or an `openspec`
// command that cannot be started.

import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import { validateChange } from "../../../lib/openspec-cli.mjs";
import { bodyToChange, issueIds } from "../../../lib/openspec-issue-map.mjs";
import { readTextFile } from "../../../lib/read-text.mjs";

const USAGE = "usage: node openspec-format-check.mjs --body-file=<path>";
const MISSING_CLI =
  "the `openspec` command could not be started; install the OpenSpec CLI and put it on PATH, then rerun the format check";

function problemLine(ids, source, message) {
  const label = ids.length > 0 ? ids.join(", ") : "body";
  return `- ${label} [${source}] ${message}`;
}

function reportLines(change, validation) {
  const mapper = change.problems.map((problem) =>
    problemLine(problem.id ? [problem.id] : [], "mapper", problem.message),
  );
  const openspec = validation.issues.map((issue) =>
    problemLine(
      issueIds(change, issue),
      `openspec ${issue.level}`,
      `${issue.path ? `${issue.path}: ` : ""}${issue.message}`,
    ),
  );
  return [...mapper, ...openspec];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 2;
}

function readBody(args) {
  if (!args?.["body-file"] || Object.keys(args).length !== 1) return { error: USAGE };
  try {
    return { body: readTextFile(args["body-file"]) };
  } catch (error) {
    return { error: `cannot read ${args["body-file"]}: ${error.message}` };
  }
}

function main(argv) {
  const input = readBody(parseArgs(argv));
  if (input.error) return fail(input.error);
  const change = bodyToChange(input.body);
  const validation = validateChange(change);
  if (validation.missing) return fail(MISSING_CLI);
  if (validation.error) return fail(validation.error);
  const lines = reportLines(change, validation);
  // OpenSpec's own verdict decides as well as the issue list: strict mode can
  // fail a change on a warning.
  const passed = lines.length === 0 && validation.valid;
  const verdict = passed ? "passed" : "failed";
  process.stdout.write([`openspec ${validation.version}`, `format check: ${verdict}`, ...lines, ""].join("\n"));
  return passed ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
