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
  };
}

export function parseQualityConfig(source: string): QualityConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ConfigError("must contain valid JSON");
  }
  const input = record(parsed, "root");
  keysOnly(input, CONFIG_KEYS, "root");
  const pathGroups = parseGroups(input.pathGroups);
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
    ...optionalPaths(input),
    history: parseHistory(input.history),
  };
}
