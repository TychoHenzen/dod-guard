import type { CommandResult } from "./command-result.js";

export function usage(message?: string): CommandResult {
  const usageText =
    "Usage: quality-guard check --staged [--intent change|refactor] " +
    "[--target <repository-relative-path>] [--json]";
  return {
    exitCode: 3,
    output: `${message ? `Usage error: ${message}\n` : ""}${usageText}`,
  };
}

export function acknowledgeUsage(message?: string): CommandResult {
  const usageText =
    "Usage: quality-guard acknowledge --finding <finding-id> " +
    "--reason <reason> --author <author>";
  return {
    exitCode: 3,
    output: `${message ? `Usage error: ${message}\n` : ""}${usageText}`,
  };
}
