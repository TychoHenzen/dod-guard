/**
 * The two plan checks a change-scoped `cover` run performs on top of scenario
 * coverage. Both answer "is this change's plan usable", not "is it covered", so
 * they live apart from the report pipeline in run.ts.
 *
 * Order matters where they are called: an unexpanded group is reported before an
 * unannotated plan, because a plan still being written has not yet claimed to
 * implement anything.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type CliIo, EXIT_PLAN_INCOMPLETE, EXIT_PLAN_UNBOUND } from "../cli.js";
import { parseTaskGroups, parseTasksMarkdown } from "../openspec/tasks-parser.js";

/** The scope a plan check needs: which change, and whether the run is repo-wide. */
interface PlanCheckScope {
  cwd: string;
  changeId?: string;
  all: boolean;
}

/** A change's tasks.md, or "" when it does not exist. */
function readTasks(cwd: string, changeId: string): Promise<string> {
  const tasksPath = path.join(cwd, "openspec", "changes", changeId, "tasks.md");
  return fs.readFile(tasksPath, "utf-8").catch(() => "");
}

/** Plan-incomplete exit code for a change-scoped run with an unexpanded group, else undefined. */
export async function checkPlanComplete(opts: PlanCheckScope, io: CliIo): Promise<number | undefined> {
  if (opts.all) return undefined;
  const content = await readTasks(opts.cwd, opts.changeId as string);
  if (!content) return undefined;
  const unexpanded = parseTaskGroups(content)
    .filter((group) => group.items.length === 0)
    .map((group) => group.title);
  if (unexpanded.length === 0) return undefined;
  const noun = unexpanded.length === 1 ? "group" : "groups";
  io.write(`\nplan incomplete - ${unexpanded.length} unexpanded ${noun}: ${unexpanded.join(", ")}\n`);
  return EXIT_PLAN_INCOMPLETE;
}

/**
 * Plan-unbound exit code when a finished plan's items name none of the change's
 * scenarios, else undefined.
 *
 * This reads the plan's own `covers:` annotations, never whether a test binds a
 * scenario. A plan is written before the work exists, so every scenario is
 * unwired at that moment - judging a plan on test markers would refuse every
 * correctly planned change that has not been built yet.
 *
 * A change with no task groups is not judged: it has no plan, so it has not
 * claimed to implement anything.
 */
export async function checkPlanBound(
  opts: PlanCheckScope,
  scenarioIds: string[],
  io: CliIo,
): Promise<number | undefined> {
  if (opts.all) return undefined;
  const content = await readTasks(opts.cwd, opts.changeId as string);
  if (!hasPlan(content)) return undefined;
  if (namesAnyScenario(content, scenarioIds)) return undefined;

  io.write(`\nplan unbound - ${scenarioIds.length} scenario(s), named by no task in the plan:\n`);
  for (const id of scenarioIds) io.write(`  ${id}\n`);
  reportUnusableAnnotations(content, io);
  return EXIT_PLAN_UNBOUND;
}

/**
 * When tasks.md carries covers annotations that named nothing, say so and give the
 * shape. Without this the report reads as "you wrote no annotations" to someone who
 * wrote 24 of them in the wrong format.
 */
function reportUnusableAnnotations(content: string, io: CliIo): void {
  const present = content.split("\n").filter((line) => /<!--\s*covers:/.test(line)).length;
  if (present === 0) return;
  const parsed = parseTasksMarkdown(content).filter((item) => item.coversId !== undefined).length;
  io.write(`\n  ${present} covers annotation(s) in tasks.md, none naming a scenario above (${parsed} parsed)\n`);
  io.write("  format: <!-- covers: <group>/<capability> :: <requirement title> :: <scenario title> -->\n");
}

/** A tasks.md with at least one numbered group is a plan worth judging. */
function hasPlan(content: string): boolean {
  return content !== "" && parseTaskGroups(content).length > 0;
}

/** True when some checkbox item's covers annotation names one of these scenarios. */
function namesAnyScenario(content: string, scenarioIds: string[]): boolean {
  const wanted = new Set(scenarioIds);
  return parseTasksMarkdown(content).some((item) => item.coversId !== undefined && wanted.has(item.coversId));
}
