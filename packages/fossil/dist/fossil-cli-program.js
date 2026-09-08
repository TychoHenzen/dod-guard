import { Command } from "commander";
import { FossilHelpDisplayed } from "./fossil-cli-types/fossil-help-displayed.js";
import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { analyzeRepository } from "./fossil-cli-analysis.js";
import { normalizeAnalyzeOptions } from "./fossil-cli-parse-options.js";
import { renderFossilReportJson, renderFossilReportTable } from "./output.js";
function commanderExitOverride(error) {
    if (error.code === "commander.helpDisplayed")
        throw new FossilHelpDisplayed();
    throw new FossilUsageError(error.message, true);
}
function commandRepositoryPath(repositoryPath, dependencies) {
    const cwd = dependencies.cwd ?? process.cwd;
    return repositoryPath ?? cwd();
}
function outputAnalysisReport(report, dependencies) {
    if (report.options.format === "json") {
        dependencies.stdout?.(renderFossilReportJson(report));
        return;
    }
    const noFindings = report.statistics.candidateFindingCount + report.statistics.workspaceDebrisCount === 0;
    if (noFindings) {
        dependencies.stdout?.("0 findings\n");
        return;
    }
    dependencies.stdout?.(`${renderFossilReportTable(report, { isTty: Boolean(process.stdout.isTTY) })}\n`);
}
async function analyzeCommand(repositoryPath, options, dependencies) {
    const report = await analyzeRepository(commandRepositoryPath(repositoryPath, dependencies), normalizeAnalyzeOptions(options), dependencies.analyze);
    outputAnalysisReport(report, dependencies);
}
/** Creates the command boundary so analysis can be injected and tested without Git access. */
export function createFossilProgram({ analyze, cwd = process.cwd, stderr = process.stderr.write.bind(process.stderr), stdout = process.stdout.write.bind(process.stdout), }) {
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
        .action((repositoryPath, options) => analyzeCommand(repositoryPath, options, { analyze, cwd, stderr, stdout }));
    return program;
}
//# sourceMappingURL=fossil-cli-program.js.map