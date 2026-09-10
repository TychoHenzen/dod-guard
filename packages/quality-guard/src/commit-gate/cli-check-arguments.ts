import * as path from "node:path";
import type { CheckOptions } from "./check-options.js";
import type { CommandResult } from "./command-result.js";
import { usage } from "./cli-usage.js";
import { applyCheckOption } from "./cli-check-options.js";
function validTarget(value: string): boolean {
  return (
    Boolean(value.trim()) &&
    !path.isAbsolute(value) &&
    !/^[a-zA-Z]:[\\/]/.test(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}
function validCheckState(state: CheckOptions): CommandResult | undefined {
  if (state.intent === "refactor" && !state.target)
    return usage("refactor intent requires --target");
  if (state.target && !validTarget(state.target))
    return usage("--target must be a repository-relative path");
  return undefined;
}
function validCommandStart(args: string[]): boolean {
  return args[0] === "check" && args[1] === "--staged";
}
export function parseCheckArguments(
  args: string[],
): CheckOptions | CommandResult {
  if (!validCommandStart(args)) return usage();
  const state: CheckOptions = {
    json: false,
    intent: "change",
    target: undefined,
  };
  for (let index = 2; index < args.length; index += 1) {
    const next = applyCheckOption(args, index, state);
    if (typeof next !== "number") return next;
    index = next;
  }
  const error = validCheckState(state);
  if (error) return error;
  return state;
}
