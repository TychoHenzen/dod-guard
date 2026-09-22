import type { AcknowledgeOptions } from "./acknowledge-options.js";
import { acknowledgeUsage } from "./cli-usage.js";
import type { CommandResult } from "./command-result.js";

type AcknowledgementState = {
  findingId?: string;
  reason?: string;
  author?: string;
  committedRef?: string;
};

function optionName(arg: string): string | undefined {
  return ["--finding", "--reason", "--author", "--committed"].find(
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
  state: AcknowledgementState,
): void {
  if (name === "--finding") state.findingId = value;
  if (name === "--reason") state.reason = value;
  if (name === "--author") state.author = value;
  if (name === "--committed") state.committedRef = value;
}

function validAcknowledgement(
  state: AcknowledgementState,
): CommandResult | undefined {
  const missing = [
    {
      value: state.findingId,
      message: "--finding requires a finding identifier",
    },
    { value: state.reason, message: "--reason requires a non-empty reason" },
    { value: state.author, message: "--author requires a non-empty author" },
  ].find(({ value }) => !value?.trim());
  if (missing) return acknowledgeUsage(missing.message);
  if (state.committedRef !== undefined && !state.committedRef.trim())
    return acknowledgeUsage("--committed requires a Git ref");
  return undefined;
}

function acknowledgementOptions(
  state: AcknowledgementState,
): AcknowledgeOptions {
  return {
    findingId: state.findingId!.trim(),
    reason: state.reason!.trim(),
    author: state.author!.trim(),
    ...(state.committedRef ? { committedRef: state.committedRef.trim() } : {}),
  };
}

export function parseAcknowledgeArguments(
  args: string[],
): AcknowledgeOptions | CommandResult {
  if (args[0] !== "acknowledge") return acknowledgeUsage();
  const state: AcknowledgementState = {};
  for (let index = 1; index < args.length; index += 1) {
    const name = optionName(args[index]);
    if (!name) return acknowledgeUsage(`unsupported option ${args[index]}`);
    const result = optionValue(args, index, name);
    applyAcknowledgement(name, result.value, state);
    index = result.next;
  }
  const error = validAcknowledgement(state);
  if (error) return error;
  return acknowledgementOptions(state);
}
