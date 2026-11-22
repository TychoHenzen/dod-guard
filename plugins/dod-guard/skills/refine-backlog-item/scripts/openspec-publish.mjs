// Plans the publish of a reviewed OpenSpec change folder, such as one a
// HagiCode proposal session wrote, into an existing issue. It validates the
// folder with `openspec validate --strict`, maps it through the same mapper as
// the format check, and prints the target issue body and one sub-issue body
// per behavior slice. It writes nothing: refine-backlog-item performs the
// GitHub writes and reads them back, so the plan is safe to run again.
//
//   node openspec-publish.mjs plan --change=<dir> --issue=<n>
//
// Prints one JSON object. Exit 0: `plan`. Exit 1: `invalid`, with the OpenSpec
// issues and the mapper problems. Exit 2: a bad argument, a folder with no
// proposal.md, or an `openspec` command that cannot be started.
// biome-ignore lint/correctness/noNodejsModules: the plan checks that the change folder exists
import { existsSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the proposal path is joined per platform
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "../../../lib/args.mjs";
import { validateChange } from "../../../lib/openspec-cli.mjs";
import { readChangeFolder } from "../../../lib/openspec-folder.mjs";
import { changeToBody, renderBody } from "../../../lib/openspec-issue-map.mjs";
import { renderSliceBody, sliceTitle } from "../../../lib/openspec-tasks.mjs";

const USAGE = "usage: node openspec-publish.mjs plan --change=<dir> --issue=<n>";
const ISSUE = /^[1-9]\d*$/;
const MISSING_CLI =
  "the `openspec` command could not be started; install the OpenSpec CLI and put it on PATH, then rerun the publish plan";

function usageProblem(mode, args) {
  if (mode !== "plan" || !args?.change || !ISSUE.test(args.issue ?? "") || Object.keys(args).length !== 2) {
    return USAGE;
  }
  if (!existsSync(join(args.change, "proposal.md"))) return `${resolve(args.change)} has no proposal.md`;
  return null;
}

// Task ids and text only: a publish writes every checklist item unticked, and
// sync ticks them after the completing commit is pushed.
function plainTasks(groups) {
  return groups.map(({ category, tasks }) => ({ category, tasks: tasks.map(({ id, text }) => ({ id, text })) }));
}

function publishPlan(files, args, version) {
  const mapped = changeToBody(files);
  const untick = (entry) => ({ ...entry, categories: plainTasks(entry.categories) });
  return {
    status: "plan",
    openspecVersion: version,
    change: basename(resolve(args.change)),
    issue: Number(args.issue),
    body: renderBody(mapped.sections),
    slices: mapped.slices.map((entry) => ({
      slice: entry.slice,
      title: sliceTitle(entry.slice),
      body: renderSliceBody(untick(entry), args.issue),
    })),
    parentTasks: plainTasks(mapped.parentTasks),
    problems: mapped.problems,
  };
}

function run(argv) {
  const args = parseArgs(argv.slice(1));
  const problem = usageProblem(argv[0], args);
  if (problem) return { code: 2, error: problem };
  const files = readChangeFolder(args.change);
  const validation = validateChange(files);
  if (validation.missing) return { code: 2, error: MISSING_CLI };
  if (validation.error) return { code: 2, error: validation.error };
  const plan = publishPlan(files, args, validation.version);
  if (!validation.valid || plan.problems.length > 0) {
    return { code: 1, out: { status: "invalid", issues: validation.issues, problems: plan.problems } };
  }
  const { problems: _none, ...out } = plan;
  return { code: 0, out };
}

const result = run(process.argv.slice(2));
if (result.error) process.stderr.write(`${result.error}\n`);
if (result.out) process.stdout.write(`${JSON.stringify(result.out)}\n`);
process.exitCode = result.code;
