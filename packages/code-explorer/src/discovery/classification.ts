import { readFileSync } from "node:fs";
import process from "node:process";
import type { ClassificationConfig } from "./classification-config.js";
import { parseClassificationConfig } from "./classification-config-parser.js";
import {
  type DiscoveryFilterOptions,
  matchesDiscoveryFilters as matchesFilters,
} from "./classification-filters.js";
import {
  lastConfiguredClass,
  lastConfiguredOverride,
  markerClass,
  normalizeProjectPath,
} from "./classification-matching.js";
import type { ClassificationSource } from "./classification-source.js";
import { classificationConfigPath } from "./config-path.js";
import type { ClassificationConfigStatus } from "./config-status.js";
import type { ContentClass } from "./content-class.js";
import type { PathClassification } from "./path-classification.js";

export type { ClassificationConfig } from "./classification-config.js";
export { parseClassificationConfig } from "./classification-config-parser.js";
export type { ClassificationOverride } from "./classification-override.js";
export type { ClassificationSource } from "./classification-source.js";
export type { ClassificationConfigStatus } from "./config-status.js";
export type { ContentClass } from "./content-class.js";
export type { PathClassification } from "./path-classification.js";

const emptyConfig: ClassificationConfig = {
  generated: [],
  test: [],
  production: [],
  overrides: [],
};
/** Loads only the narrow classification configuration language. Invalid files
 * keep default discovery usable. */
export function loadClassificationConfig(
  projectRoot: string,
  platform = process.platform,
): { config: ClassificationConfig; status: ClassificationConfigStatus } {
  try {
    const configPath = classificationConfigPath(projectRoot, platform);
    if (!configPath)
      return {
        config: emptyConfig,
        status: { classification_config_invalid: false },
      };
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return {
      config: parseClassificationConfig(parsed),
      status: { classification_config_invalid: false },
    };
  } catch {
    return {
      config: emptyConfig,
      status: { classification_config_invalid: true },
    };
  }
}
/** Applies explicit rules before generated, test, production, then unknown
 * marker classes. */
export function classifyProjectPath(
  path: string,
  config: ClassificationConfig = emptyConfig,
  generatedHeader = false,
): PathClassification {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return { content: "unknown", source: "unknown" };
  const override = lastConfiguredOverride(normalized, config);
  if (override) return { content: override, source: "configuration_override" };
  const explicit = lastConfiguredClass(normalized, config);
  if (explicit) return { content: explicit, source: "configuration" };
  const marker = markerClass(normalized, generatedHeader);
  return marker
    ? { content: marker, source: markerSource(marker) }
    : { content: "unknown", source: "unknown" };
}

function markerSource(marker: ContentClass): ClassificationSource {
  if (marker === "generated") return "generated_marker";
  if (marker === "test") return "test_marker";
  return "production_marker";
}
export function matchesDiscoveryFilters(
  ...args: [
    path: string,
    classification: PathClassification,
    filters: DiscoveryFilterOptions,
    candidate: { language?: string; kind?: string },
  ]
): boolean {
  const [path, classification, filters, candidate] = args;
  const normalized = normalizeProjectPath(path);
  return (
    normalized !== undefined &&
    matchesFilters(normalized, classification, filters, candidate)
  );
}
