import type { CheckOptions } from "./check-options.js";
import type { CommandResult } from "./command-result.js";
import { usage } from "./cli-usage.js";

function intentOption(
  args: string[],
  index: number,
): number | CommandResult | { value: "change" | "refactor"; next: number } {
  const arg = args[index];
  const inline = arg.startsWith("--intent=");
  const value = inline ? arg.slice("--intent=".length) : args[index + 1];
  if (value !== "change" && value !== "refactor")
    return usage(`unsupported intent ${value ?? ""}`.trim());
  return { value, next: inline ? index : index + 1 };
}

function targetOption(
  args: string[],
  index: number,
): number | CommandResult | { value: string; next: number } {
  const arg = args[index];
  const inline = arg.startsWith("--target=");
  const value = inline ? arg.slice("--target=".length) : args[index + 1];
  if (!inline && !value)
    return usage("--target requires a repository-relative path");
  return { value: value ?? "", next: inline ? index : index + 1 };
}

function jsonOption(
  args: string[],
  index: number,
  state: { json: boolean },
): number | undefined {
  if (args[index] !== "--json") return undefined;
  state.json = true;
  return index;
}

function intentOptionResult(
  args: string[],
  index: number,
  state: { intent: "change" | "refactor" },
): number | CommandResult | undefined {
  const arg = args[index];
  if (!(arg === "--intent" || arg.startsWith("--intent="))) return undefined;
  const result = intentOption(args, index);
  if (typeof result === "number" || "exitCode" in result) return result;
  state.intent = result.value;
  return result.next;
}

function targetOptionResult(
  args: string[],
  index: number,
  state: { target?: string },
): number | CommandResult | undefined {
  const arg = args[index];
  if (!(arg === "--target" || arg.startsWith("--target="))) return undefined;
  const result = targetOption(args, index);
  if (typeof result === "number" || "exitCode" in result) return result;
  state.target = result.value;
  return result.next;
}

function firstOptionResult(
  results: Array<number | CommandResult | undefined>,
  arg: string,
): number | CommandResult {
  const result = results.find((item) => item !== undefined);
  if (result === undefined) return usage(`unsupported option ${arg}`);
  return result;
}

export function applyCheckOption(
  args: string[],
  index: number,
  state: CheckOptions,
): number | CommandResult {
  const arg = args[index];
  return firstOptionResult(
    [
      jsonOption(args, index, state),
      intentOptionResult(args, index, state),
      targetOptionResult(args, index, state),
    ],
    arg,
  );
}
