import type { AcknowledgeOptions } from "./acknowledge-options.js";
import type { CommandResult } from "./command-result.js";
import { acknowledgeUsage } from "./cli-usage.js";

function optionName(arg: string): string | undefined {
  return ["--finding", "--reason", "--author"].find(
    (flag) => arg === flag || arg.startsWith(`${flag}=`),
  );
}

function optionValue(
  args: string[],
  index: number,
  name: string,
): { value: string | undefined; next: number } {
  const arg = args[index];
  return arg.startsWith(`${name}=`)
    ? { value: inlineValue(arg, name.length + 1), next: index }
    : { value: args[index + 1], next: index + 1 };
}

function inlineValue(value: string, start: number): string {
  let result = "";
  for (let index = start; index < value.length; index += 1)
    result += value[index];
  return result;
}

function applyAcknowledgement(
  name: string,
  value: string | undefined,
  state: { findingId?: string; reason?: string; author?: string },
): void {
  if (name === "--finding") state.findingId = value;
  if (name === "--reason") state.reason = value;
  if (name === "--author") state.author = value;
}

function validAcknowledgement(state: {
  findingId?: string;
  reason?: string;
  author?: string;
}): CommandResult | undefined {
  if (!state.findingId?.trim())
    return acknowledgeUsage("--finding requires a finding identifier");
  if (!state.reason?.trim())
    return acknowledgeUsage("--reason requires a non-empty reason");
  if (!state.author?.trim())
    return acknowledgeUsage("--author requires a non-empty author");
  return undefined;
}

export function parseAcknowledgeArguments(
  args: string[],
): AcknowledgeOptions | CommandResult {
  if (args[0] !== "acknowledge") return acknowledgeUsage();
  const state: { findingId?: string; reason?: string; author?: string } = {};
  for (let index = 1; index < args.length; index += 1) {
    const name = optionName(args[index]);
    if (!name) return acknowledgeUsage(`unsupported option ${args[index]}`);
    const result = optionValue(args, index, name);
    applyAcknowledgement(name, result.value, state);
    index = result.next;
  }
  const error = validAcknowledgement(state);
  if (error) return error;
  return {
    findingId: state.findingId!.trim(),
    reason: state.reason!.trim(),
    author: state.author!.trim(),
  };
}
