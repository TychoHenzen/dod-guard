/**
 * `dod-guard steps <change-id>`: derive `openspec/changes/<id>/steps.json`
 * from that change's own `tasks.md`, using `dod-guard cover`'s report to
 * fill in a bound task's `verify_cmd`. Calls the same functions `cover`'s
 * own CLI command calls (`enumerateChangeScenarios` + `buildReport`)
 * in-process, rather than shelling back into this binary's own CLI.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CliIo } from "../cli.js";
import { enumerateChangeScenarios } from "../cover/enumerate.js";
import { buildReport } from "../cover/report.js";
import { buildSteps } from "./build-steps.js";
import { fetchInstructions, fetchStatus } from "./fetch-instructions.js";
import { parseTasksMarkdown } from "./tasks-parser.js";

const EXIT_OK = 0;
const EXIT_USAGE_ERROR = 3;

async function readTasksMarkdown(resolvedOutputPath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(resolvedOutputPath, "utf-8");
  } catch {
    return undefined;
  }
}

export async function runSteps(opts: { changeId: string; cwd: string }, io: CliIo): Promise<number> {
  if (!opts.changeId) {
    io.writeErr("ERROR: dod-guard steps needs a change id.\n");
    return EXIT_USAGE_ERROR;
  }

  let resolvedOutputPath: string;
  try {
    resolvedOutputPath = (await fetchInstructions(opts.changeId, opts.cwd, "tasks")).resolvedOutputPath;
  } catch (err) {
    io.writeErr(`ERROR: could not resolve tasks.md for "${opts.changeId}": ${(err as Error).message}\n`);
    return EXIT_USAGE_ERROR;
  }

  const content = await readTasksMarkdown(resolvedOutputPath);
  if (content === undefined) {
    io.writeErr(`ERROR: change "${opts.changeId}" has no tasks.md at ${resolvedOutputPath}.\n`);
    return EXIT_USAGE_ERROR;
  }

  const items = parseTasksMarkdown(content);
  const scenarios = await enumerateChangeScenarios(opts.cwd, opts.changeId);
  const coverReports = await buildReport(opts.cwd, scenarios);
  const steps = buildSteps(items, coverReports);
  const { artifacts } = await fetchStatus(opts.changeId, opts.cwd);

  const outPath = path.join(opts.cwd, "openspec", "changes", opts.changeId, "steps.json");
  const plan = { goal: opts.changeId, cwd: opts.cwd, plan_source: opts.changeId, plan_artifacts: artifacts, steps };
  await fs.writeFile(outPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");

  io.write(`wrote ${steps.length} step(s) to ${outPath}\n`);
  return EXIT_OK;
}
