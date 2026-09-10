import { ConfigError } from "./config-error.js";

export function pathList(value: unknown, location: string): string[] {
  assertPathList(value, location);
  const result = value.map((item) => (item as string).trim());
  assertUniquePaths(result, location);
  assertRelativePaths(result, location);
  return result;
}

function assertPathList(
  value: unknown,
  location: string,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new ConfigError(
      `${location} must be a non-empty array of path patterns`,
    );
  if (value.some((item) => typeof item !== "string" || !item.trim()))
    throw new ConfigError(`${location} must contain non-empty strings`);
}

function assertUniquePaths(paths: string[], location: string): void {
  if (new Set(paths).size !== paths.length)
    throw new ConfigError(`${location} contains a duplicate path pattern`);
}

function assertRelativePaths(paths: string[], location: string): void {
  if (
    paths.some((item) => item.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(item))
  )
    throw new ConfigError(`${location} paths must be repository-relative`);
}

export function positiveInteger(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new ConfigError(`${location} must be a positive integer`);
  return value;
}
