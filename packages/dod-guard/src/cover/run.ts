/**
 * `dod-guard cover` top-level orchestration: enumerate scenarios (one change's
 * deltas, or the whole main tree), build the three-outcome report, and either
 * write a fresh ratchet baseline or check the report against the existing one.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CliIo } from "../cli.js";
import { guardExists, snapshotTasks } from "../complete/task-guard.js";
import { parseTasksMarkdown } from "../openspec/tasks-parser.js";
import { compareToBaseline, findOrphans, outcomesFromReport, readBaseline, writeBaseline } from "./baseline.js";
import { enumerateAllScenarios, enumerateChangeScenarios } from "./enumerate.js";
import { checkPlanBound, checkPlanComplete } from "./plan-checks.js";
import { buildReport, type CoverageGateResult, type ScenarioReport, summarizeReport } from "./report.js";

interface CoverOptions {
  cwd: string;
  changeId?: string;
  all: boolean;
  writeBaseline: boolean;
}

const EXIT_OK = 0;
const EXIT_REGRESSION = 1;
const EXIT_USAGE_ERROR = 3;

/** The scenario ids in a report, which is what the plan-unbound check compares against. */
const scenarioIds = (reports: ScenarioReport[]): string[] => reports.map((report) => report.scenarioId);

/**
 * Run the coverage gate without rendering it. Plugin and shell callers use this
 * shared result so they make decisions from the same scenario and plan outcomes.
 */
export async function runCoverage(opts: CoverOptions): Promise<CoverageGateResult> {
  const scenarios = opts.all
    ? await enumerateAllScenarios(opts.cwd)
    : await enumerateChangeScenarios(opts.cwd, opts.changeId as string);

  if (!opts.all && opts.changeId) await seedTaskGuard(opts.cwd, opts.changeId);

  if (scenarios.length === 0) {
    return { reports: [], adopted: [], regressions: [], improved: [], orphaned: [] };
  }

  const reports = await buildReport(opts.cwd, scenarios);

  if (opts.writeBaseline) {
    await writeBaseline(opts.cwd, outcomesFromReport(reports));
    return { reports, adopted: [], regressions: [], improved: [], orphaned: [] };
  }

  const baseline = await readBaseline(opts.cwd);
  const { adopted, regressions, improved } = compareToBaseline(reports, baseline);
  const orphaned = opts.all ? findOrphans(reports, baseline) : [];
  const silentIo: CliIo = { write: () => {}, writeErr: () => {} };
  const planComplete = await checkPlanComplete(opts, silentIo);
  const planBound =
    regressions.length === 0 && planComplete !== undefined
      ? undefined
      : await checkPlanBound(opts, scenarioIds(reports), silentIo);
  return { reports, adopted, regressions, improved, orphaned, planComplete, planBound };
}

/** Render the shared coverage result for the command line and return its exit code. */
export async function runCover(opts: CoverOptions, io: CliIo): Promise<number> {
  if (!(opts.all || opts.changeId)) {
    io.writeErr("ERROR: dod-guard cover needs a change id or --all.\n");
    return EXIT_USAGE_ERROR;
  }

  // writeBaseline replaces the whole scenarios map; a change-scoped run would drop the rest.
  if (opts.writeBaseline && !opts.all) {
    io.writeErr("ERROR: --write-baseline needs --all - a change-scoped run would drop every other scenario.\n");
    return EXIT_USAGE_ERROR;
  }

  const result = await runCoverage(opts);
  if (result.reports.length === 0) {
    io.write(
      opts.all
        ? "No scenarios found under openspec/specs. Nothing to cover.\n"
        : `No spec deltas found for change "${opts.changeId}". Nothing to cover.\n`,
    );
    return EXIT_OK;
  }

  for (const report of result.reports) io.write(`  ${report.outcome.padEnd(26)} ${report.scenarioId}\n`);
  const summary = summarizeReport(result.reports);
  io.write(`\n${result.reports.length} scenario(s): ${summary.bound} bound, ${summary.unwired} unwired\n`);

  if (opts.writeBaseline) {
    io.write(`\nwrote coverage-gate baseline for ${result.reports.length} scenario(s)\n`);
    return EXIT_OK;
  }

  for (const id of result.adopted) io.write(`  adopted: ${id}\n`);
  for (const id of result.improved) io.write(`  improved: ${id}\n`);
  for (const id of result.orphaned) io.write(`  orphaned: ${id}\n`);

  if (result.regressions.length === 0) {
    io.write(`\ncover OK - 0 regression(s)\n`);
    if (result.planComplete !== undefined) await checkPlanComplete(opts, io);
    else if (result.planBound !== undefined) await checkPlanBound(opts, scenarioIds(result.reports), io);
    return result.planComplete ?? result.planBound ?? EXIT_OK;
  }

  io.write(`\ncover FAILED - ${result.regressions.length} regression(s)\n\n`);
  for (const regression of result.regressions) {
    io.write(`  ${regression.scenarioId}: ${regression.before} before, ${regression.now} now\n`);
  }
  // A regression outranks a plan complaint in the exit code: a caller branching on
  // the code must be told about it. Both checks still run so their reports print.
  if (result.planComplete !== undefined) await checkPlanComplete(opts, io);
  if (result.planBound !== undefined) await checkPlanBound(opts, scenarioIds(result.reports), io);
  return EXIT_REGRESSION;
}

async function seedTaskGuard(cwd: string, changeId: string): Promise<void> {
  const tasksPath = path.join(cwd, "openspec", "changes", changeId, "tasks.md");
  if (await guardExists(tasksPath)) return;
  try {
    const content = await fs.readFile(tasksPath, "utf-8");
    await snapshotTasks(tasksPath, parseTasksMarkdown(content));
  } catch {
    // tasks.md may not exist yet for this change
  }
}
