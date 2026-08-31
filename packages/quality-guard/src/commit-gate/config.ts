export interface DependencyDirection {
  from: string;
  to: string;
  allowed: boolean;
}

export interface QualityConfig {
  pathGroups: Record<string, string[]>;
  dependencyDirections: DependencyDirection[];
  directTypeLimit: number;
  genericBuckets: string[];
  generatedPaths: string[];
  testPaths: string[];
  history: { maxFirstParentCommits: number };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid .quality-guard.json: ${message}`);
    this.name = "ConfigError";
  }
}

const DEFAULT_CONFIG: QualityConfig = {
  pathGroups: {},
  dependencyDirections: [],
  directTypeLimit: 12,
  genericBuckets: ["utils", "common", "helpers", "shared", "misc"],
  generatedPaths: [],
  testPaths: [],
  history: { maxFirstParentCommits: 200 },
};

function record(value: unknown, location: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function keysOnly(value: Record<string, unknown>, allowed: string[], location: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ConfigError(`${location}.${key} is not supported`);
  }
}

function pathList(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ConfigError(`${location} must be a non-empty array of path patterns`);
  }
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length) throw new ConfigError(`${location} contains a duplicate path pattern`);
  if (result.some((item) => item.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(item))) {
    throw new ConfigError(`${location} paths must be repository-relative`);
  }
  return result;
}

function stringList(value: unknown, location: string): string[] {
  return pathList(value, location);
}

function positiveInteger(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ConfigError(`${location} must be a positive integer`);
  }
  return value;
}

/**
 * ASSUMPTION: OpenSpec specifies configuration semantics, but not JSON shapes.
 * This parser deliberately uses explicit named records and direction objects.
 */
export function parseQualityConfig(source: string): QualityConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ConfigError("must contain valid JSON");
  }
  const input = record(parsed, "root");
  keysOnly(
    input,
    [
      "pathGroups",
      "dependencyDirections",
      "directTypeLimit",
      "genericBuckets",
      "generatedPaths",
      "testPaths",
      "history",
    ],
    "root",
  );
  const pathGroups: Record<string, string[]> = {};
  if (input.pathGroups !== undefined) {
    const groups = record(input.pathGroups, "pathGroups");
    for (const [name, patterns] of Object.entries(groups)) {
      if (!name.trim()) throw new ConfigError("pathGroups contains an empty group name");
      pathGroups[name] = pathList(patterns, `pathGroups.${name}`);
    }
  }
  const dependencyDirections: DependencyDirection[] = [];
  if (input.dependencyDirections !== undefined) {
    if (!Array.isArray(input.dependencyDirections)) throw new ConfigError("dependencyDirections must be an array");
    for (const [index, item] of input.dependencyDirections.entries()) {
      const direction = record(item, `dependencyDirections[${index}]`);
      keysOnly(direction, ["from", "to", "allowed"], `dependencyDirections[${index}]`);
      if (
        typeof direction.from !== "string" ||
        typeof direction.to !== "string" ||
        typeof direction.allowed !== "boolean"
      ) {
        throw new ConfigError(`dependencyDirections[${index}] requires string from/to and boolean allowed`);
      }
      if (!(direction.from in pathGroups && direction.to in pathGroups)) {
        throw new ConfigError(`dependencyDirections[${index}] references an unknown path group`);
      }
      dependencyDirections.push({ from: direction.from, to: direction.to, allowed: direction.allowed });
    }
  }
  let history = { ...DEFAULT_CONFIG.history };
  if (input.history !== undefined) {
    const historyInput = record(input.history, "history");
    keysOnly(historyInput, ["maxFirstParentCommits"], "history");
    if (historyInput.maxFirstParentCommits === undefined)
      throw new ConfigError("history must declare maxFirstParentCommits");
    history = {
      maxFirstParentCommits: positiveInteger(historyInput.maxFirstParentCommits, "history.maxFirstParentCommits"),
    };
  }
  return {
    pathGroups,
    dependencyDirections,
    directTypeLimit:
      input.directTypeLimit === undefined
        ? DEFAULT_CONFIG.directTypeLimit
        : positiveInteger(input.directTypeLimit, "directTypeLimit"),
    genericBuckets:
      input.genericBuckets === undefined
        ? [...DEFAULT_CONFIG.genericBuckets]
        : stringList(input.genericBuckets, "genericBuckets"),
    generatedPaths: input.generatedPaths === undefined ? [] : stringList(input.generatedPaths, "generatedPaths"),
    testPaths: input.testPaths === undefined ? [] : stringList(input.testPaths, "testPaths"),
    history,
  };
}
