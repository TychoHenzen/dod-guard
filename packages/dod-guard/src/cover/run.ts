/**
 * `dod-guard cover` top-level orchestration: enumerate scenarios (one change's
 * deltas, or the whole main tree), build the three-outcome report, and either
 * write a fresh ratchet baseline or check the report against the existing one.
 */
import type { CliIo } from "../cli.js";
import { compareToBaseline, outcomesFromReport, readBaseline, writeBaseline } from "./baseline.js";
import { enumerateAllScenarios, enumerateChangeScenarios } from "./enumerate.js";
import { buildReport, summarizeReport } from "./report.js";

interface CoverOptions {
  cwd: string;
  changeId?: string;
  all: boolean;
  writeBaseline: boolean;
}

const EXIT_OK = 0;
const EXIT_REGRESSION = 1;
const EXIT_USAGE_ERROR = 3;

export async function runCover(opts: CoverOptions, io: CliIo): Promise<number> {
  if (!(opts.all || opts.changeId)) {
    io.writeErr("ERROR: dod-guard cover needs a change id or --all.\n");
    return EXIT_USAGE_ERROR;
  }

  const scenarios = opts.all
    ? await enumerateAllScenarios(opts.cwd)
    : await enumerateChangeScenarios(opts.cwd, opts.changeId as string);

  if (scenarios.length === 0) {
    io.write(
      opts.all
        ? "No scenarios found under openspec/specs. Nothing to cover.\n"
        : `No spec deltas found for change "${opts.changeId}". Nothing to cover.\n`,
    );
    return EXIT_OK;
  }

  const reports = await buildReport(opts.cwd, scenarios);
  for (const report of reports) {
    io.write(`  ${report.outcome.padEnd(26)} ${report.scenarioId}\n`);
  }

  const summary = summarizeReport(reports);
  io.write(
    `\n${reports.length} scenario(s): ${summary["covered-and-integrated"]} covered-and-integrated, ` +
      `${summary["covered-but-not-integrated"]} covered-but-not-integrated, ${summary.unwired} unwired, ` +
      `${summary.failed} failed\n`,
  );

  if (opts.writeBaseline) {
    await writeBaseline(opts.cwd, outcomesFromReport(reports));
    io.write(`\nwrote coverage-gate baseline for ${reports.length} scenario(s)\n`);
    return EXIT_OK;
  }

  const baseline = await readBaseline(opts.cwd);
  const { adopted, regressions } = compareToBaseline(reports, baseline);
  for (const id of adopted) io.write(`  adopted: ${id}\n`);

  if (regressions.length === 0) {
    io.write(`\ncover OK - 0 regression(s)\n`);
    return EXIT_OK;
  }

  io.write(`\ncover FAILED - ${regressions.length} regression(s)\n\n`);
  for (const r of regressions) io.write(`  ${r.scenarioId}: ${r.before} before, ${r.now} now\n`);
  return EXIT_REGRESSION;
}
