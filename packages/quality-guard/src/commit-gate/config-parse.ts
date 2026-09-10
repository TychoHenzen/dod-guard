import { ConfigError } from "./config-error.js";
import type { QualityConfig } from "./config-defaults.js";
import { pathList, positiveInteger } from "./config-parse-paths.js";
import { keysOnly, parseHistory, record } from "./config-parse-support.js";

export { keysOnly, parseHistory, record } from "./config-parse-support.js";

export function parseGroups(value: unknown): Record<string, string[]> {
  if (value === undefined) return {};
  const groups = record(value, "pathGroups");
  const result: Record<string, string[]> = {};
  for (const [name, patterns] of Object.entries(groups)) {
    if (!name.trim())
      throw new ConfigError("pathGroups contains an empty group name");
    result[name] = pathList(patterns, `pathGroups.${name}`);
  }
  return result;
}
function parseDirection(
  item: unknown,
  index: number,
  groups: Record<string, string[]>,
) {
  const location = `dependencyDirections[${index}]`;
  const direction = record(item, location);
  keysOnly(direction, ["from", "to", "allowed"], location);
  assertDirectionTypes(direction, location);
  assertKnownGroups(direction, groups, location);
  return { from: direction.from, to: direction.to, allowed: direction.allowed };
}
function assertDirectionTypes(
  direction: Record<string, unknown>,
  location: string,
): asserts direction is { from: string; to: string; allowed: boolean } {
  if (
    typeof direction.from !== "string" ||
    typeof direction.to !== "string" ||
    typeof direction.allowed !== "boolean"
  ) {
    throw new ConfigError(
      `${location} requires string from/to and boolean allowed`,
    );
  }
}
function assertKnownGroups(
  direction: { from: string; to: string },
  groups: Record<string, string[]>,
  location: string,
): void {
  if (!(direction.from in groups) || !(direction.to in groups))
    throw new ConfigError(`${location} references an unknown path group`);
}
export function parseDirections(
  value: unknown,
  groups: Record<string, string[]>,
): QualityConfig["dependencyDirections"] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new ConfigError("dependencyDirections must be an array");
  return value.map((item, index) => parseDirection(item, index, groups));
}
export function parseScalar(
  value: unknown,
  fallback: number,
  location: string,
): number {
  return value === undefined ? fallback : positiveInteger(value, location);
}
export function parseStrings(
  value: unknown,
  fallback: string[],
  location: string,
): string[] {
  return value === undefined ? [...fallback] : pathList(value, location);
}
