#!/usr/bin/env node
// The one closing authority for delivered and superseded issues. `plan` reads a
// saved snapshot and writes nothing; `apply` re-plans the same snapshot and
// performs the planned closes; `record` writes the completion evidence a later
// plan verifies. standards/project-workflow.md defines both records.
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { COMMANDS } from "./lib/closure-commands.mjs";

const USAGE = `usage: closure.mjs plan --snapshot=<file.json> [--hierarchy=<issue>]
       closure.mjs apply --snapshot=<file.json> [--hierarchy=<issue>]
       closure.mjs record --repository=<owner/name> --result=<complete-pr.json>
                          --handoff-file=<handoff-comment.md> [--children=<n,...>]
       closure.mjs annotate --snapshot=<file.json> [--output=<file.json>]
       closure.mjs snapshot --repository=<owner/name> --output=<file.json>

The snapshot is the closure snapshot that standards/project-workflow.md defines,
built by the snapshot subcommand. Records are matched by repository and number,
so a record from another repository never takes part in a decision. On every
issue it carries children, parent, body, state_reason, and comments
([{id, body}]), and for apply a project object {owner, number, statusFieldId,
doneOptionId}. plan prints the closes, status
repairs, holds, unverified-closed reports, and deliveries; apply performs each
close as read, comment, close, readback, Project Done, and it also sets Done on
each status repair. --hierarchy asks to close that issue as a pure hierarchy
record (not_planned). annotate prints the snapshot with activeCheckpoint and
trustedHeadSha taken from the completion records, ready for select-next.mjs.
With --output the annotated snapshot goes to that file and stdout holds a
one-object summary; without it the snapshot prints to stdout.
record reads the acceptance matrix from the json block under ## Acceptance
matrix in the handoff comment file; --children= with no value means no extra
children.
snapshot builds that closure snapshot for one repository from GitHub REST GET
requests and the one read-only GraphQL read that resolves the explicitly linked
Project, as linked-project.mjs does. The command removes any earlier output
first and writes the new one in one step, so a failed read leaves no file at
that path.`;

function outputOf(command, rest, runner) {
  const run = COMMANDS[command];
  const args = parseArgs(rest);
  return run && args ? run(args, runner) : false;
}

function failureLine(command, error) {
  const state = error.state ? ` ${JSON.stringify(error.state)}` : "";
  return `closure ${command} failed: ${error.message}${state}\n`;
}

function runCli(argv, { runner, stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command, ...rest] = argv;
  try {
    const output = outputOf(command, rest, runner);
    if (!output) {
      stderr.write(`${USAGE}\n`);
      return 2;
    }
    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(failureLine(command, error));
    return 1;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) process.exitCode = runCli(process.argv.slice(2));

export { runCli };
