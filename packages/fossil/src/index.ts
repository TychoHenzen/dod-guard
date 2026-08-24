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

export interface FossilCliDependencies {
  readonly analyze: AnalyzeCommandHandler;
  readonly cwd?: () => string;
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

/** Creates the command boundary so analysis can be injected and tested without Git access. */
export function createFossilProgram({ analyze, cwd = process.cwd }: FossilCliDependencies): Command {
  const program = new Command().name("fossil");
  program
    .command("analyze [repo-path]")
    .action(async (repositoryPath: string | undefined) =>
      analyze(repositoryPath ?? cwd(), DEFAULT_NORMALIZED_ANALYSIS_OPTIONS),
    );
  return program;
}

/** Parses a CLI argument vector through the injected analysis command boundary. */
export async function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void> {
  await createFossilProgram(dependencies).parseAsync([...argv], { from: "node" });
}

async function main(): Promise<void> {
  await runFossilCli(process.argv, { analyze: async () => undefined });
}

if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`fossil CLI failed: ${err}\n`);
    process.exit(1);
  });
}
