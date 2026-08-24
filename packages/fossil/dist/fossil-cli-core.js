/**
 * fossil CLI entry point. CLI-only - there is no MCP server here, unlike the
 * sibling dod-guard and quality-guard packages. The isMainModule() guard
 * still matters: it lets tests import this module without triggering
 * process.exit.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { FossilAnalysisError } from "./analysis-error.js";
import { finalizeFossilReport, renderFossilReportJson, renderFossilReportTable } from "./output.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
export { FossilAnalysisError } from "./analysis-error.js";
export * from "./types.js";
const _filename = fileURLToPath(import.meta.url);
const DEFAULT_DAYS = 90;
const DEFAULT_GAP_HOURS = 48;
const DEFAULT_THRESHOLD = 0.4;
const DEFAULT_UNTRACKED_AGE_DAYS = 90;
/** Default analysis options. An empty extension list includes every extension. */
export const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS = {
    days: DEFAULT_DAYS,
    gapHours: DEFAULT_GAP_HOURS,
    threshold: DEFAULT_THRESHOLD,
    format: "table",
    extensions: [],
    untrackedAgeDays: DEFAULT_UNTRACKED_AGE_DAYS,
    exclude: [],
    verbose: false,
};
function validNumber(value, minimum, maximum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function isOptionsRecord(value) {
    return value !== null && typeof value === "object";
}
function validStringCollection(value, maximumLength) {
    return Array.isArray(value) && value.length <= maximumLength && value.every((item) => typeof item === "string");
}
/** Validates direct API options and returns fresh collections for each analysis. */
function validateNormalizedAnalysisOptions(options) {
    if (!(isOptionsRecord(options) &&
        validNumber(options.days, 1, 3650) &&
        validNumber(options.gapHours, 1, 8760) &&
        validNumber(options.threshold, 0, 1) &&
        validNumber(options.untrackedAgeDays, 1, 3650) &&
        (options.format === "table" || options.format === "json") &&
        validStringCollection(options.extensions, 64) &&
        options.extensions.every((extension) => extension.length > 0) &&
        validStringCollection(options.exclude, Number.MAX_SAFE_INTEGER) &&
        typeof options.verbose === "boolean"))
        throw new FossilAnalysisError({ code: "invalid_options", message: "Analysis options are invalid." });
    return {
        days: options.days,
        gapHours: options.gapHours,
        threshold: options.threshold,
        format: options.format,
        extensions: [...options.extensions],
        untrackedAgeDays: options.untrackedAgeDays,
        exclude: [...options.exclude],
        verbose: options.verbose,
    };
}
/** A command-line usage failure that callers map to the standard usage exit code. */
export class FossilUsageError extends Error {
    reported;
    exitCode = 2;
    constructor(message, reported = false) {
        super(message);
        this.reported = reported;
    }
}
/** Commander uses this internal outcome after it has successfully written help text. */
class FossilHelpDisplayed extends Error {
}
/** A compatibility wrapper for the dedicated non-repository analysis failure. */
export class NotRepositoryAnalysisError extends FossilAnalysisError {
    constructor(message = "not a Git repository") {
        super({ code: "not_repository", message });
    }
}
/** Runs the injected repository-analysis core and finalizes report-level statistics. */
export async function analyzeRepository(repositoryPath, options, core = analyzeRepositoryCore) {
    return finalizeFossilReport(await core(repositoryPath, validateNormalizedAnalysisOptions(options)));
}
function isMainModule() {
    const arg = process.argv[1];
    if (!arg)
        return false;
    try {
        return realpathSync(arg) === realpathSync(_filename);
    }
    catch {
        return arg === _filename;
    }
}
function commaSeparatedValues(value) {
    return value === undefined
        ? []
        : value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
}
function finiteNumber(value, fallback, option, minimum, maximum) {
    if (value === undefined)
        return fallback;
    const number = Number(value);
    if (value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum)
        return number;
    throw new FossilUsageError(`${option} must be a finite number from ${minimum} through ${maximum}.`);
}
function normalizeAnalyzeOptions(options) {
    const extensions = commaSeparatedValues(options.extensions);
    const format = options.format ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
    if (format !== "table" && format !== "json")
        throw new FossilUsageError("--format must be table or json.");
    if (extensions.length > 64)
        throw new FossilUsageError("--extensions accepts at most 64 nonempty values.");
    return validateNormalizedAnalysisOptions({
        days: finiteNumber(options.days, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.days, "--days", 1, 3650),
        gapHours: finiteNumber(options.gapHours, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.gapHours, "--gap-hours", 1, 8760),
        threshold: finiteNumber(options.threshold, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.threshold, "--threshold", 0, 1),
        format,
        extensions,
        untrackedAgeDays: finiteNumber(options.untrackedAge, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.untrackedAgeDays, "--untracked-age", 1, 3650),
        exclude: commaSeparatedValues(options.exclude),
        verbose: options.verbose ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.verbose,
    });
}
/** Creates the command boundary so analysis can be injected and tested without Git access. */
export function createFossilProgram({ analyze, cwd = process.cwd, stderr = process.stderr.write.bind(process.stderr), stdout = process.stdout.write.bind(process.stdout), }) {
    const program = new Command()
        .name("fossil")
        .configureOutput({ writeErr: stderr })
        .showHelpAfterError()
        .exitOverride((error) => {
        if (error.code === "commander.helpDisplayed")
            throw new FossilHelpDisplayed();
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
        .action(async (repositoryPath, options) => {
        const report = await analyzeRepository(repositoryPath ?? cwd(), normalizeAnalyzeOptions(options), analyze);
        if (report.options.format === "json")
            stdout(renderFossilReportJson(report));
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
/** Parses a CLI argument vector through the injected analysis command boundary. */
export async function runFossilCli(argv, dependencies) {
    const stderr = dependencies.stderr ?? process.stderr.write.bind(process.stderr);
    const program = createFossilProgram({ ...dependencies, stderr });
    try {
        await program.parseAsync([...argv], { from: "node" });
    }
    catch (error) {
        if (!(error instanceof FossilUsageError))
            throw error;
        const analyzeCommand = program.commands.find((command) => command.name() === "analyze");
        if (!error.reported)
            stderr(`error: ${error.message}\n${analyzeCommand?.helpInformation() ?? program.helpInformation()}`);
        throw error;
    }
}
function boundedAnalysisDiagnostic(error) {
    const prefix = "fossil: ";
    const suffix = "\n";
    const maximumMessageBytes = 4_096 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
    let message = "";
    for (const character of error.message || `analysis failed (${error.code})`) {
        const codePoint = character.codePointAt(0) ?? 0;
        const visible = character === "\n"
            ? "\\n"
            : character === "\r"
                ? "\\r"
                : character === "\t"
                    ? "\\t"
                    : codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
                        ? `\\x${codePoint.toString(16).padStart(2, "0")}`
                        : character;
        if (Buffer.byteLength(message) + Buffer.byteLength(visible) > maximumMessageBytes)
            break;
        message += visible;
    }
    return `${prefix}${message}${suffix}`;
}
/** Maps known process outcomes without changing the lower-level CLI boundary. */
export async function runFossilCliProcess(argv, dependencies) {
    try {
        await runFossilCli(argv, dependencies);
        return 0;
    }
    catch (error) {
        if (error instanceof FossilHelpDisplayed)
            return 0;
        if (error instanceof FossilUsageError)
            return error.exitCode;
        if (error instanceof FossilAnalysisError) {
            (dependencies.stderr ?? process.stderr.write.bind(process.stderr))(boundedAnalysisDiagnostic(error));
            return error.code === "invalid_options" ? 2 : 1;
        }
        throw error;
    }
}
async function main() {
    process.exitCode = await runFossilCliProcess(process.argv, { analyze: analyzeRepositoryCore });
}
if (isMainModule()) {
    main().catch((err) => {
        process.stderr.write(`fossil CLI failed: ${err}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=fossil-cli-core.js.map