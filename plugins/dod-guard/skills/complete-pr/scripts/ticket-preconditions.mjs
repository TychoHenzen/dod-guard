#!/usr/bin/env node
// Checks that one issue is ready to work before a skill acts on it: the repository
// has exactly one open linked Project, the issue is an issue of that repository and
// an item of that Project, and the item's Status is the one the caller expects. The
// checks run in that order and the first failure stops. Exit 0 is ready, exit 1 is
// a stop naming its check, and exit 2 is a usage error or a read that could not be
// trusted. Project membership and Status come from one GraphQL query on the issue
// (its projectItems), not the REST items list, whose pages are unstable. A failed or
// incomplete read is exit 2 and never issue-not-in-project.
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import { pathToFileURL } from "node:url";
import { runGh } from "./lib/gh-runner.mjs";
import { EXIT, evaluate } from "./lib/ticket-precondition-checks.mjs";
import { optionsOf } from "./lib/ticket-precondition-options.mjs";

const USAGE = `usage: ticket-preconditions.mjs --repository=<owner/name> --issue=<n> --expect-status=<name>

Checks one issue against the repository's single open linked Project.
exit 0  {outcome: "ready", repository, issue, project: {ownerLogin, number, title}, status}
exit 1  {outcome: "stop", check, detail}
        check: linked-project-none | linked-project-several | issue-not-in-repository
               | issue-not-in-project | status-blank | status-mismatch
exit 2  usage error, a read that could not be trusted, or a gh failure`;

function runCli(argv, io = {}) {
  const { runner = runGh, stdout = process.stdout, stderr = process.stderr } = io;
  const options = optionsOf(argv);
  if (options === null) {
    stderr.write(`${USAGE}\n`);
    return EXIT.failed;
  }
  try {
    const { code, report } = evaluate(options, runner);
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return code;
  } catch (error) {
    stderr.write(`ticket-preconditions failed: ${error.message}\n`);
    return EXIT.failed;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
