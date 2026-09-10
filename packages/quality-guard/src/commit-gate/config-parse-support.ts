import { DEFAULT_CONFIG } from "./config-defaults.js";
import { ConfigError } from "./config-error.js";
import { positiveInteger } from "./config-parse-paths.js";

export function record(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ConfigError(`${location} must be an object`);
  return value as Record<string, unknown>;
}

export function keysOnly(
  value: Record<string, unknown>,
  allowed: string[],
  location: string,
): void {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported)
    throw new ConfigError(`${location}.${unsupported} is not supported`);
}

export function parseHistory(value: unknown) {
  if (value === undefined) return { ...DEFAULT_CONFIG.history };
  const input = record(value, "history");
  keysOnly(input, ["maxFirstParentCommits"], "history");
  if (input.maxFirstParentCommits === undefined)
    throw new ConfigError("history must declare maxFirstParentCommits");
  return {
    maxFirstParentCommits: positiveInteger(
      input.maxFirstParentCommits,
      "history.maxFirstParentCommits",
    ),
  };
}
