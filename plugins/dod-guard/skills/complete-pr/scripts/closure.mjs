#!/usr/bin/env node
// The one closing authority for delivered and superseded issues. `plan` reads a
// saved snapshot and writes nothing; `apply` re-plans the same snapshot and
// performs the planned closes; `record` writes the completion evidence a later
// plan verifies. standards/project-workflow.md defines both records.
// biome-ignore lint/correctness/noNodejsModules: This shipped command reads snapshot files and removes an earlier one.
import { readFileSync, rmSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { applyClosures, recordCompletion } from "./lib/closure-apply.mjs";
import { annotateSnapshot } from "./lib/closure-delivery.mjs";
import { planClosures } from "./lib/closure-plan.mjs";
import { buildClosureSnapshot, writeClosureSnapshot } from "./lib/closure-snapshot.mjs";
import { runGh as runGhClient } from "./lib/github-client.mjs";
import { REPOSITORY_NAME } from "./lib/repository-identity.mjs";
import { runGh } from "./project-status.mjs";

const USAGE = `usage: closure.mjs plan --snapshot=<file.json> [--hierarchy=<issue>]
       closure.mjs apply --snapshot=<file.json> [--hierarchy=<issue>]
       closure.mjs record --repository=<owner/name> --result=<complete-pr.json>
                          --matrix=<rows.json> [--children=<n,...>]
       closure.mjs annotate --snapshot=<file.json>
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
snapshot builds that closure snapshot for one repository from GitHub REST GET requests only. The
command removes any earlier output first and writes the new one in one step, so a failed read
leaves no file at that path.`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function given(value) {
  return typeof value === "string" && value !== "true" && value.length > 0;
}

// --children=<n,...> lists the issues a completion record also covers. A typo must stop
// before the first write, so one entry that is not a positive integer makes the whole
// list false, and the record command reports that as a usage error.
function childList(value) {
  if (value === undefined) return [];
  if (!given(value)) return false;
  const numbers = value.split(",").map((entry) => Number(entry.trim()));
  if (!numbers.every((number) => Number.isInteger(number) && number > 0)) return false;
  return numbers;
}

// --hierarchy=<issue> is the refinement request to close that issue as a pure
// hierarchy record; false marks a value that is not an issue number.
function hierarchyOption(value) {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : false;
}

function snapshotOptions(args) {
  const hierarchy = hierarchyOption(args.hierarchy);
  return given(args.snapshot) && hierarchy !== false && { hierarchy };
}

const COMMANDS = {
  plan: (args) => {
    const options = snapshotOptions(args);
    return options && planClosures(readJson(args.snapshot), options);
  },
  apply: (args, runner = runGh) => {
    const options = snapshotOptions(args);
    return options && applyClosures(readJson(args.snapshot), { runner, ...options });
  },
  annotate: (args) => given(args.snapshot) && annotateSnapshot(readJson(args.snapshot)),
  // The snapshot reads through github-client's runGh, which takes the accepted exit codes per call.
  // The project-status runGh throws on any non-zero exit and cannot serve these reads.
  snapshot: (args, runner = runGhClient) => {
    if (!given(args.output) || !REPOSITORY_NAME.test(args.repository ?? "")) {
      return false;
    }
    // A failed build must never leave an earlier snapshot for plan or apply to read, so the old file goes first.
    rmSync(args.output, { force: true });
    const snapshot = buildClosureSnapshot({ repository: args.repository, runner });
    writeClosureSnapshot(args.output, snapshot);
    return {
      output: args.output,
      repository: snapshot.repository,
      projectNumber: snapshot.project.number,
      items: snapshot.items.length,
      issues: snapshot.issues.length,
      pullRequests: snapshot.pullRequests.length,
    };
  },
  record: (args, runner = runGh) => {
    const children = childList(args.children);
    if (children === false) return false;
    return given(args.repository) && given(args.result) && given(args.matrix) &&
      recordCompletion({
        repository: args.repository,
        result: readJson(args.result),
        matrix: readJson(args.matrix),
        children,
        runner,
      });
  },
};

function runCli(argv, { runner, stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  const run = COMMANDS[command];
  try {
    const output = run && args ? run(args, runner) : false;
    if (!output) {
      stderr.write(`${USAGE}\n`);
      return 2;
    }
    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  } catch (error) {
    const state = error.state ? ` ${JSON.stringify(error.state)}` : "";
    stderr.write(`closure ${command} failed: ${error.message}${state}\n`);
    return 1;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) process.exitCode = runCli(process.argv.slice(2));

export { runCli };
