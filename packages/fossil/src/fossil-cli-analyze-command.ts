import { type Command } from "commander";
import type { RawAnalyzeOptions } from "./fossil-cli-types/index.js";

export function addAnalyzeCommand(
  program: Command,
  action: (
    repositoryPath: string | undefined,
    options: RawAnalyzeOptions,
  ) => Promise<void>,
): void {
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
    .action(action);
}
