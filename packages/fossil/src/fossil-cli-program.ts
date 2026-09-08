import { Command } from "commander";
import {
  FossilHelpDisplayed,
} from "./fossil-cli-types/fossil-help-displayed.js";
import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { analyzeRepository } from "./fossil-cli-analysis.js";
import { normalizeAnalyzeOptions } from "./fossil-cli-parse-options.js";
import { renderFossilReportJson, renderFossilReportTable } from "./output.js";
import type {
  AnalyzeCommandHandler,
} from "./fossil-cli-types/analyze-command-handler.js";
import type {
  FossilCliDependencies,
} from "./fossil-cli-types/fossil-cli-dependencies.js";
import type {
  RawAnalyzeOptions,
} from "./fossil-cli-types/raw-analyze-options.js";

function commanderExitOverride(error: {
  code?: string;
  message: string;
}): never {
  if (error.code === "commander.helpDisplayed") throw new FossilHelpDisplayed();
  throw new FossilUsageError(error.message, true);
}

function commandRepositoryPath(
  repositoryPath: string | undefined,
  dependencies: FossilCliDependencies,
): string {
  const cwd = dependencies.cwd ?? process.cwd;
  return repositoryPath ?? cwd();
}

function outputAnalysisReport(
  report: Awaited<ReturnType<typeof analyzeRepository>>,
  dependencies: FossilCliDependencies,
): void {
  if (report.options.format === "json") {
    dependencies.stdout?.(renderFossilReportJson(report));
    return;
  }
  const noFindings =
    report.statistics.candidateFindingCount +
      report.statistics.workspaceDebrisCount ===
    0;
  if (noFindings) {
    dependencies.stdout?.("0 findings\n");
    return;
  }
  dependencies.stdout?.(
    `${renderFossilReportTable(report, {
      isTty: Boolean(process.stdout.isTTY),
    })}\n`,
  );
}

async function analyzeCommand(
  repositoryPath: string | undefined,
  options: RawAnalyzeOptions,
  dependencies: FossilCliDependencies,
): Promise<void> {
  const report = await analyzeRepository(
    commandRepositoryPath(repositoryPath, dependencies),
    normalizeAnalyzeOptions(options),
    dependencies.analyze,
  );
  outputAnalysisReport(report, dependencies);
}

/** Creates the command boundary so analysis can be injected in tests. */
export function createFossilProgram({
  analyze,
  cwd = process.cwd,
  stderr = process.stderr.write.bind(process.stderr),
  stdout = process.stdout.write.bind(process.stdout),
}: FossilCliDependencies): Command {
  const program = new Command()
    .name("fossil")
    .configureOutput({ writeErr: stderr })
    .showHelpAfterError()
    .exitOverride(commanderExitOverride);
  program
    .command("analyze [repo-path]")
    .option("--days <days>")
    .option("--gap-hours <hours>")
    .option("--threshold <threshold>")
    .option("--format <format>")
    .option("--extensions <extensions>")
    .option("--untracked-age <days>")
    .option("--exclude <patterns>")
    .option("--verbose")
    .action((repositoryPath: string | undefined, options: RawAnalyzeOptions) =>
      analyzeCommand(repositoryPath, options, { analyze, cwd, stderr, stdout }),
    );
  return program;
}
