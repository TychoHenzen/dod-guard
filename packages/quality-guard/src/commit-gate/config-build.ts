import { DEFAULT_CONFIG, type QualityConfig } from "./config-defaults.js";
import { ConfigError } from "./config-error.js";
import {
  keysOnly,
  parseDirections,
  parseGroups,
  parseHistory,
  parseScalar,
  parseStrings,
  record,
} from "./config-parse.js";

const CONFIG_KEYS = [
  "pathGroups",
  "dependencyDirections",
  "directTypeLimit",
  "genericBuckets",
  "generatedPaths",
  "testPaths",
  "lowLevelPathGroups",
  "fluentMarkers",
  "history",
];

function optionalPaths(input: Record<string, unknown>) {
  return {
    generatedPaths:
      input.generatedPaths === undefined
        ? []
        : parseStrings(input.generatedPaths, [], "generatedPaths"),
    testPaths:
      input.testPaths === undefined
        ? []
        : parseStrings(input.testPaths, [], "testPaths"),
    lowLevelPathGroups:
      input.lowLevelPathGroups === undefined
        ? []
        : parseStrings(input.lowLevelPathGroups, [], "lowLevelPathGroups"),
    fluentMarkers: parseStrings(
      input.fluentMarkers,
      DEFAULT_CONFIG.fluentMarkers,
      "fluentMarkers",
    ),
  };
}

function validateLowLevelPathGroups(
  pathGroups: Record<string, string[]>,
  lowLevelPathGroups: string[],
) {
  if (lowLevelPathGroups.some((name) => !Object.hasOwn(pathGroups, name)))
    throw new ConfigError(
      "lowLevelPathGroups references an unknown path group",
    );
}

function parseRoot(source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ConfigError("must contain valid JSON");
  }
  return record(parsed, "root");
}

export function parseQualityConfig(source: string): QualityConfig {
  const input = parseRoot(source);
  keysOnly(input, CONFIG_KEYS, "root");
  const pathGroups = parseGroups(input.pathGroups);
  const optional = optionalPaths(input);
  validateLowLevelPathGroups(pathGroups, optional.lowLevelPathGroups);
  return {
    pathGroups,
    dependencyDirections: parseDirections(
      input.dependencyDirections,
      pathGroups,
    ),
    directTypeLimit: parseScalar(
      input.directTypeLimit,
      DEFAULT_CONFIG.directTypeLimit,
      "directTypeLimit",
    ),
    genericBuckets: parseStrings(
      input.genericBuckets,
      DEFAULT_CONFIG.genericBuckets,
      "genericBuckets",
    ),
    ...optional,
    history: parseHistory(input.history),
  };
}
