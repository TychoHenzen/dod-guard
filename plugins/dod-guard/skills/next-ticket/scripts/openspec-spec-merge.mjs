// Prepares the spec merge of a ticket branch. `write` turns the parent issue
// body into an OpenSpec change folder in the checkout's ignored
// `openspec/changes/`, so `openspec archive <name> --yes` can merge its
// deltas into `openspec/specs/`. With --change it checks a folder HagiCode
// already wrote instead, and names it for reuse only when it maps to the same
// requirements as the issue, because the issue wins after publish.
//
//   node openspec-spec-merge.mjs write --body-file=<path> --root=<checkout> --name=<issue>-<slug> [--change=<dir>]
//
// Prints one JSON object. Exit 0: `written`, `reuse`, or `skipped` (a legacy
// body with no capability-tagged requirement). Exit 1: the body has mapper
// problems, or the HagiCode folder differs (`mismatch`). Exit 2: a bad
// argument, an unreadable body, or a checkout with no `openspec/config.yaml`.
// biome-ignore lint/correctness/noNodejsModules: the script checks the checkout's OpenSpec root
import { existsSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: change paths are compared per platform
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "../../../lib/args.mjs";
import { readChangeFolder, writeChangeFolder } from "../../../lib/openspec-folder.mjs";
import { bodyToChange, changeToBody, renderBody } from "../../../lib/openspec-issue-map.mjs";
import { readTextFile } from "../../../lib/read-text.mjs";

const USAGE =
  "usage: node openspec-spec-merge.mjs write --body-file=<path> --root=<checkout> --name=<issue>-<slug> [--change=<dir>]";
const NAME = /^[a-z0-9][a-z0-9-]*$/;

function requirementKeys(requirements) {
  return requirements.map((entry) => `${entry.operation} ${entry.capability} ${entry.name}`).sort();
}

function folderRequirements(changeDir) {
  return bodyToChange(renderBody(changeToBody(readChangeFolder(changeDir)).sections)).requirements;
}

function compareFolder(change, changeDir) {
  const issue = requirementKeys(change.requirements);
  const folder = requirementKeys(folderRequirements(changeDir));
  const onlyInIssue = issue.filter((key) => !folder.includes(key));
  const onlyInFolder = folder.filter((key) => !issue.includes(key));
  if (onlyInIssue.length === 0 && onlyInFolder.length === 0) {
    return { code: 0, out: { status: "reuse", change: basename(changeDir) } };
  }
  return { code: 1, out: { status: "mismatch", onlyInIssue, onlyInFolder } };
}

function usageProblem(mode, args) {
  if (mode !== "write" || !args) return USAGE;
  if (!args["body-file"] || !args.root || !NAME.test(args.name ?? "")) return USAGE;
  if (!existsSync(join(args.root, "openspec", "config.yaml"))) {
    return `${args.root} has no openspec/config.yaml; set up the OpenSpec root (config.yaml, specs/, and an ignored openspec/changes/) first`;
  }
  const changesDir = resolve(args.root, "openspec", "changes");
  if (args.change && resolve(dirname(resolve(args.change))) !== changesDir) {
    return `--change must be a folder directly under ${changesDir}, because archive finds it by name`;
  }
  return null;
}

function writeOrReuse(change, args) {
  if (args.change) return compareFolder(change, args.change);
  const changeDir = join(args.root, "openspec", "changes", args.name);
  if (existsSync(changeDir)) return compareFolder(change, changeDir);
  writeChangeFolder(changeDir, { proposal: change.proposal, design: change.design, specs: change.specs });
  return { code: 0, out: { status: "written", change: args.name } };
}

function run(argv) {
  const args = parseArgs(argv.slice(1));
  const problem = usageProblem(argv[0], args);
  if (problem) return { code: 2, error: problem };
  let body;
  try {
    body = readTextFile(args["body-file"]);
  } catch (error) {
    return { code: 2, error: `cannot read ${args["body-file"]}: ${error.message}` };
  }
  const change = bodyToChange(body);
  if (change.legacy) return { code: 0, out: { status: "skipped", reason: change.problems[0].message } };
  if (change.problems.length > 0) return { code: 1, out: { status: "invalid", problems: change.problems } };
  return writeOrReuse(change, args);
}

const result = run(process.argv.slice(2));
if (result.error) process.stderr.write(`${result.error}\n`);
if (result.out) process.stdout.write(`${JSON.stringify(result.out)}\n`);
process.exitCode = result.code;
