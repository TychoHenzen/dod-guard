import type { CommandResult } from "./command-result.js";
import { parseCheckArguments, usage } from "./cli-arguments.js";
import { runCommittedCheck, runStagedCheck } from "./cli-decision.js";
import { exitCodeFor, renderDecision } from "./cli-render.js";

function isCommandResult(
  value: string | CommandResult,
): value is CommandResult {
  return typeof value !== "string";
}

function committedRef(args: string[]): string | CommandResult {
  const commit = args[2];
  if (!commit) return usage("--committed requires a Git ref");
  if (commit.startsWith("-")) return usage("--committed requires a Git ref");
  return commit;
}

export function runCommittedCommand(
  args: string[],
  root: string,
): CommandResult {
  const commit = committedRef(args);
  if (isCommandResult(commit)) return commit;
  const options = parseCheckArguments([
    "check",
    "--staged",
    "--json",
    ...args.slice(3),
  ]);
  if ("exitCode" in options) return options;
  try {
    const result = runCommittedCheck(root, commit, options);
    return {
      exitCode: exitCodeFor(result),
      output: renderDecision(result, true),
    };
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
}

export function runStagedCommand(args: string[], root: string): CommandResult {
  const options = parseCheckArguments(args);
  if ("exitCode" in options) return options;
  try {
    const result = runStagedCheck(root, options);
    return {
      exitCode: exitCodeFor(result),
      output: renderDecision(result, options.json),
    };
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
}
