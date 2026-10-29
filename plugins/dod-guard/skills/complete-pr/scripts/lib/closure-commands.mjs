// The closure.mjs subcommands. Each takes the parsed arguments and an optional
// gh runner, and answers the JSON to print or false for a usage error.
// biome-ignore lint/correctness/noNodejsModules: This shipped command reads snapshot files and removes an earlier one.
import { rmSync } from "node:fs";
import { readHandoffMatrix } from "../../../../lib/handoff-matrix.mjs";
import { readJsonFile, readTextFile } from "../../../../lib/read-text.mjs";
import { REPOSITORY_NAME } from "../../../../lib/repository-identity.mjs";
import { applyClosures, recordCompletion } from "./closure-apply.mjs";
import { annotateSnapshot } from "./closure-delivery.mjs";
import { childList, given, snapshotOptions } from "./closure-options.mjs";
import { planClosures } from "./closure-plan.mjs";
import { buildClosureSnapshot, writeClosureSnapshot } from "./closure-snapshot.mjs";
import { runGh } from "./gh-runner.mjs";

const RECORD_FILE_OPTIONS = ["repository", "result", "handoff-file"];

function readMatrixRows(path) {
  const read = readHandoffMatrix(readTextFile(path));
  if (read.error) throw new Error(read.error);
  return read.rows;
}

function plan(args) {
  const options = snapshotOptions(args);
  return options && planClosures(readJsonFile(args.snapshot), options);
}

function apply(args, runner = runGh) {
  const options = snapshotOptions(args);
  return options && applyClosures(readJsonFile(args.snapshot), { runner, ...options });
}

function annotate(args) {
  if (!given(args.snapshot)) return false;
  const annotated = annotateSnapshot(readJsonFile(args.snapshot));
  if (args.output === undefined) return annotated;
  if (!given(args.output)) return false;
  rmSync(args.output, { force: true });
  writeClosureSnapshot(args.output, annotated);
  return { output: args.output, repository: annotated.repository, items: annotated.items.length };
}

// The snapshot reads pass the exit codes they can read, such as the 1 of an HTTP 404; apply and
// record pass none, so any non-zero exit throws.
function snapshot(args, runner = runGh) {
  if (!(given(args.output) && REPOSITORY_NAME.test(args.repository ?? ""))) {
    return false;
  }
  // A failed build must never leave an earlier snapshot for plan or apply to read, so the old file goes first.
  rmSync(args.output, { force: true });
  const built = buildClosureSnapshot({ repository: args.repository, runner });
  writeClosureSnapshot(args.output, built);
  return {
    output: args.output,
    repository: built.repository,
    projectNumber: built.project.number,
    items: built.items.length,
    issues: built.issues.length,
    pullRequests: built.pullRequests.length,
  };
}

function record(args, runner = runGh) {
  const children = childList(args.children);
  const usable =
    args.matrix === undefined && children !== false && RECORD_FILE_OPTIONS.every((name) => given(args[name]));
  if (!usable) return false;
  return recordCompletion({
    repository: args.repository,
    result: readJsonFile(args.result),
    matrix: readMatrixRows(args["handoff-file"]),
    children,
    runner,
  });
}

const COMMANDS = { plan, apply, annotate, snapshot, record };

export { COMMANDS };
