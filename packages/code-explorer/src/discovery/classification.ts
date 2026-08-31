import { readFileSync } from "node:fs";
import { classificationConfigPath } from "./config-path.js";

export type ContentClass = "generated" | "test" | "production" | "unknown";
export type ClassificationSource =
  | "configuration"
  | "configuration_override"
  | "generated_marker"
  | "test_marker"
  | "production_marker"
  | "unknown";
export type PathClassification = { content: ContentClass; source: ClassificationSource };

export type ClassificationConfig = {
  generated: readonly string[];
  test: readonly string[];
  production: readonly string[];
  overrides: readonly ClassificationOverride[];
};

export type ClassificationOverride = { glob: string; class: Exclude<ContentClass, "unknown"> };

export type ClassificationConfigStatus = { classification_config_invalid: boolean };

const emptyConfig: ClassificationConfig = { generated: [], test: [], production: [], overrides: [] };
const keys = ["generated", "test", "production", "overrides"] as const;

/** Loads only the narrow classification configuration language. Invalid files keep default discovery usable. */
export function loadClassificationConfig(
  projectRoot: string,
  platform = process.platform,
): {
  config: ClassificationConfig;
  status: ClassificationConfigStatus;
} {
  try {
    const configPath = classificationConfigPath(projectRoot, platform);
    if (!configPath) return { config: emptyConfig, status: { classification_config_invalid: false } };
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return { config: parseClassificationConfig(parsed), status: { classification_config_invalid: false } };
  } catch {
    return { config: emptyConfig, status: { classification_config_invalid: true } };
  }
}

/** Validates the checked configuration shape without accepting regexes or escaping project paths. */
export function parseClassificationConfig(value: unknown): ClassificationConfig {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key as (typeof keys)[number])))
    throw new Error("classification_config_invalid");
  return {
    generated: parseGlobArray(value.generated),
    test: parseGlobArray(value.test),
    production: parseGlobArray(value.production),
    overrides: parseOverrides(value.overrides),
  };
}

/** Applies explicit rules before generated, test, production, then unknown marker classes. */
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
  if (generatedHeader || matchesGeneratedMarker(normalized))
    return { content: "generated", source: "generated_marker" };
  if (matchesTestMarker(normalized)) return { content: "test", source: "test_marker" };
  if (matchesProductionMarker(normalized)) return { content: "production", source: "production_marker" };
  return { content: "unknown", source: "unknown" };
}

/** Filters before ranking so rejected candidates cannot affect a later result limit. */
export function matchesDiscoveryFilters(
  path: string,
  classification: PathClassification,
  filters: {
    path_globs?: readonly string[];
    language?: string;
    languages?: readonly string[];
    kind?: string;
    kinds?: readonly string[];
    content?: "all" | "production" | "tests";
    include_generated?: boolean;
  },
  candidate: { language?: string; kind?: string },
): boolean {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return false;
  if (filters.path_globs?.length && !filters.path_globs.some((glob) => safeGlobMatches(normalized, glob))) return false;
  const languages = filters.languages ?? (filters.language ? [filters.language] : undefined);
  if (languages?.length && !(candidate.language && languages.includes(candidate.language))) return false;
  const kinds = filters.kinds ?? (filters.kind ? [filters.kind] : undefined);
  if (kinds?.length && !(candidate.kind && kinds.includes(candidate.kind))) return false;
  if (classification.content === "generated" && !filters.include_generated) return false;
  if (filters.content === "production") return classification.content === "production";
  if (filters.content === "tests") return classification.content === "test";
  return true;
}

function lastConfiguredClass(path: string, config: ClassificationConfig): ContentClass | undefined {
  const ordered: ReadonlyArray<readonly [ContentClass, readonly string[]]> = [
    ["generated", config.generated],
    ["test", config.test],
    ["production", config.production],
  ];
  let matched: ContentClass | undefined;
  for (const [classification, globs] of ordered)
    for (const glob of globs) if (safeGlobMatches(path, glob)) matched = classification;
  return matched;
}

function lastConfiguredOverride(path: string, config: ClassificationConfig): ClassificationOverride["class"] | undefined {
  let matched: ClassificationOverride["class"] | undefined;
  for (const override of config.overrides) if (safeGlobMatches(path, override.glob)) matched = override.class;
  return matched;
}

function parseGlobArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !isSafeProjectGlob(entry)))
    throw new Error("classification_config_invalid");
  return [...value];
}

function parseOverrides(value: unknown): ClassificationOverride[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("classification_config_invalid");
  return value.map((entry) => {
    if (!isRecord(entry) || Object.keys(entry).length !== 2 || !("glob" in entry) || !("class" in entry))
      throw new Error("classification_config_invalid");
    if (
      typeof entry.glob !== "string" ||
      !isSafeProjectGlob(entry.glob) ||
      (entry.class !== "generated" && entry.class !== "test" && entry.class !== "production")
    )
      throw new Error("classification_config_invalid");
    return { glob: entry.glob, class: entry.class };
  });
}

function isSafeProjectGlob(glob: string): boolean {
  const normalized = normalizeProjectPath(glob);
  if (!normalized || normalized !== glob.replaceAll("\\", "/")) return false;
  return !(/[[\]{}()|+^$\\]/.test(glob) || glob.includes(":"));
}

function safeGlobMatches(path: string, glob: string): boolean {
  if (!isSafeProjectGlob(glob)) return false;
  const expression = glob
    .split("**")
    .map((part) => part.replace(/[.]/g, "\\.").replaceAll("*", "[^/]*").replaceAll("?", "[^/]"))
    .join(".*");
  return new RegExp(`^${expression}$`, "u").test(path);
}

function normalizeProjectPath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return undefined;
  const parts = normalized.split("/");
  return parts.some((part) => !part || part === "." || part === "..") ? undefined : normalized;
}

function matchesGeneratedMarker(path: string): boolean {
  return (
    path.split("/").some((part) => /^(dist|target|bin|obj|\.venv|generated|auto-generated)$/iu.test(part)) ||
    /\.g\.(cs|ts)$/iu.test(path) ||
    /(^|\/)(?:generated|auto-generated)\.[^.]+$/iu.test(path) ||
    /(?:^|\/).+\.(?:generated|designer)\.(?:cs|ts|js)$/iu.test(path)
  );
}

function matchesTestMarker(path: string): boolean {
  return (
    path.split("/").some((part) => /^(test|tests|__tests__)$/iu.test(part)) ||
    /(?:^|[._-])(test|spec)\.[^.]+$/iu.test(path) ||
    /(?:^|\/)[^/]*(?:Tests|Test)\.(?:cs|vb)$/iu.test(path) ||
    /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.pyi?$/iu.test(path) ||
    /(?:^|\/)[^/]+_test\.rs$/iu.test(path)
  );
}

function matchesProductionMarker(path: string): boolean {
  return /^(src|lib|app)\//iu.test(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
