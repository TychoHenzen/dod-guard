import { Command } from "commander";
import { FossilHelpDisplayed } from "./fossil-cli-types/fossil-help-displayed.js";
import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { analyzeRepository } from "./fossil-cli-analysis.js";
import { normalizeAnalyzeOptions } from "./fossil-cli-parse-options.js";
import { renderFossilReportJson, renderFossilReportTable } from "./output.js";
import type { AnalyzeCommandHandler } from "./fossil-cli-types/analyze-command-handler.js";
import type { FossilCliDependencies } from "./fossil-cli-types/fossil-cli-dependencies.js";
import type { RawAnalyzeOptions } from "./fossil-cli-types/raw-analyze-options.js";

/** Creates the command boundary so analysis can be injected and tested without Git access. */
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
    .exitOverride((error) => {
      if (error.code === "commander.helpDisplayed") throw new FossilHelpDisplayed();
      throw new FossilUsageError(error.message, true);
    });
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
    .action(async (repositoryPath: string | undefined, options: RawAnalyzeOptions) => {
      const report = await analyzeRepository(repositoryPath ?? cwd(), normalizeAnalyzeOptions(options), analyze);
      if (report.options.format === "json") stdout(renderFossilReportJson(report));
      else {
        const noFindings = report.statistics.candidateFindingCount + report.statistics.workspaceDebrisCount === 0;
        if (noFindings) {
          stdout("0 findings\n");
          return;
        }
        stdout(`${renderFossilReportTable(report, { isTty: Boolean(process.stdout.isTTY) })}\n`);
      }
    });
  return program;
}
