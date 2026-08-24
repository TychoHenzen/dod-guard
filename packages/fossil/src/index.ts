/**
 * fossil CLI entry point. CLI-only - there is no MCP server here, unlike the
 * sibling dod-guard and quality-guard packages. The isMainModule() guard
 * still matters: it lets tests import this module without triggering
 * process.exit.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { NormalizedAnalysisOptions } from "./types.js";

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

export type AnalyzeCommandHandler = (repositoryPath: string, options: NormalizedAnalysisOptions) => Promise<void>;

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

export interface FossilCliDependencies {
  readonly analyze: AnalyzeCommandHandler;
  readonly cwd?: () => string;
  readonly stderr?: (message: string) => void;
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
    .action(async (repositoryPath: string | undefined, options: RawAnalyzeOptions) =>
      analyze(repositoryPath ?? cwd(), normalizeAnalyzeOptions(options)),
    );
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

async function main(): Promise<void> {
  await runFossilCli(process.argv, { analyze: async () => undefined });
}

if (isMainModule()) {
  main().catch((err) => {
    if (err instanceof FossilUsageError) {
      process.exitCode = err.exitCode;
      return;
    }
    process.stderr.write(`fossil CLI failed: ${err}\n`);
    process.exit(1);
  });
}
