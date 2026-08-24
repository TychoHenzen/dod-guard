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
import { finalizeFossilReport, renderFossilReportJson } from "./output.js";
import type { AnalyzeRepositoryResult, NormalizedAnalysisOptions } from "./types.js";

export { FossilAnalysisError } from "./analysis-error.js";
export * from "./types.js";

const _filename = fileURLToPath(import.meta.url);

/** Default analysis options. An empty extension list includes every extension. */
export const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS: NormalizedAnalysisOptions = {
  days: 90,
  gapHours: 48,
  threshold: 0.4,
  format: "table",
  extensions: [],
  untrackedAgeDays: 90,
  exclude: [],
  verbose: false,
};

export type RepositoryAnalysisCore = (
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
) => Promise<AnalyzeRepositoryResult>;
export type AnalyzeCommandHandler = RepositoryAnalysisCore;

/** A command-line usage failure that callers map to the standard usage exit code. */
export class FossilUsageError extends Error {
  readonly exitCode = 2;

  constructor(
    message: string,
    readonly reported = false,
  ) {
    super(message);
  }
}

/** A compatibility wrapper for the dedicated non-repository analysis failure. */
export class NotRepositoryAnalysisError extends FossilAnalysisError {
  constructor(message = "not a Git repository") {
    super({ code: "not_repository", message });
  }
}

export interface FossilCliDependencies {
  readonly analyze: AnalyzeCommandHandler;
  readonly cwd?: () => string;
  readonly stderr?: (message: string) => void;
  readonly stdout?: (message: string) => void;
}

async function unavailableRepositoryAnalysisCore(): Promise<AnalyzeRepositoryResult> {
  throw new Error("Repository analysis is not configured.");
}

/** Runs the injected repository-analysis core and finalizes report-level statistics. */
export async function analyzeRepository(
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
  core: RepositoryAnalysisCore = unavailableRepositoryAnalysisCore,
): Promise<AnalyzeRepositoryResult> {
  return finalizeFossilReport(await core(repositoryPath, options));
}

interface RawAnalyzeOptions {
  readonly days?: string;
  readonly gapHours?: string;
  readonly threshold?: string;
  readonly format?: string;
  readonly extensions?: string;
  readonly untrackedAge?: string;
  readonly exclude?: string;
  readonly verbose?: boolean;
}

function isMainModule(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(_filename);
  } catch {
    return arg === _filename;
  }
}

function commaSeparatedValues(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function finiteNumber(
  value: string | undefined,
  fallback: number,
  option: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum) return number;
  throw new FossilUsageError(`${option} must be a finite number from ${minimum} through ${maximum}.`);
}

function normalizeAnalyzeOptions(options: RawAnalyzeOptions): NormalizedAnalysisOptions {
  const extensions = commaSeparatedValues(options.extensions);
  const format = options.format ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.format;
  if (format !== "table" && format !== "json") throw new FossilUsageError("--format must be table or json.");
  if (extensions.length > 64) throw new FossilUsageError("--extensions accepts at most 64 nonempty values.");
  return {
    days: finiteNumber(options.days, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.days, "--days", 1, 3650),
    gapHours: finiteNumber(options.gapHours, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.gapHours, "--gap-hours", 1, 8760),
    threshold: finiteNumber(options.threshold, DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.threshold, "--threshold", 0, 1),
    format,
    extensions,
    untrackedAgeDays: finiteNumber(
      options.untrackedAge,
      DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.untrackedAgeDays,
      "--untracked-age",
      1,
      3650,
    ),
    exclude: commaSeparatedValues(options.exclude),
    verbose: options.verbose ?? DEFAULT_NORMALIZED_ANALYSIS_OPTIONS.verbose,
  };
}

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
      else if (report.statistics.candidateFindingCount === 0 && report.statistics.workspaceDebrisCount === 0)
        stdout("0 findings\n");
    });
  return program;
}

/** Parses a CLI argument vector through the injected analysis command boundary. */
export async function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void> {
  const stderr = dependencies.stderr ?? process.stderr.write.bind(process.stderr);
  const program = createFossilProgram({ ...dependencies, stderr });
  try {
    await program.parseAsync([...argv], { from: "node" });
  } catch (error) {
    if (!(error instanceof FossilUsageError)) throw error;
    const analyzeCommand = program.commands.find((command) => command.name() === "analyze");
    if (!error.reported)
      stderr(`error: ${error.message}\n${analyzeCommand?.helpInformation() ?? program.helpInformation()}`);
    throw error;
  }
}

function boundedAnalysisDiagnostic(error: FossilAnalysisError): string {
  const prefix = "fossil: ";
  const suffix = "\n";
  const maximumMessageBytes = 4_096 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  let message = "";
  for (const character of error.message || `analysis failed (${error.code})`) {
    const codePoint = character.codePointAt(0) ?? 0;
    const visible =
      character === "\n"
        ? "\\n"
        : character === "\r"
          ? "\\r"
          : character === "\t"
            ? "\\t"
            : codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
              ? `\\x${codePoint.toString(16).padStart(2, "0")}`
              : character;
    if (Buffer.byteLength(message) + Buffer.byteLength(visible) > maximumMessageBytes) break;
    message += visible;
  }
  return `${prefix}${message}${suffix}`;
}

/** Maps known process outcomes without changing the lower-level CLI boundary. */
export async function runFossilCliProcess(
  argv: readonly string[],
  dependencies: FossilCliDependencies,
): Promise<number> {
  try {
    await runFossilCli(argv, dependencies);
    return 0;
  } catch (error) {
    if (error instanceof FossilUsageError) return error.exitCode;
    if (error instanceof FossilAnalysisError) {
      (dependencies.stderr ?? process.stderr.write.bind(process.stderr))(boundedAnalysisDiagnostic(error));
      return error.code === "invalid_options" ? 2 : 1;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runFossilCliProcess(process.argv, { analyze: unavailableRepositoryAnalysisCore });
}

if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`fossil CLI failed: ${err}\n`);
    process.exit(1);
  });
}
