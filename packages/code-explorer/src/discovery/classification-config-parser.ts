import type { ClassificationConfig } from "./classification-config.js";
import type { ClassificationOverride } from "./classification-override.js";
import type { ContentClass } from "./content-class.js";
import { normalizeProjectPath } from "./classification-matching.js";

const keys = ["generated", "test", "production", "overrides"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSafeProjectGlob(glob: string): boolean {
  const normalized = normalizeProjectPath(glob);
  if (!normalized || normalized !== glob.replaceAll("\\", "/")) return false;
  return !(/[[\]{}()|+^$\\]/.test(glob) || glob.includes(":"));
}

function parseGlobArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) => typeof entry !== "string" || !isSafeProjectGlob(entry),
    )
  )
    throw new Error("classification_config_invalid");
  return [...value];
}

function validOverride(
  entry: unknown,
): entry is { glob: string; class: Exclude<ContentClass, "unknown"> } {
  if (
    !isRecord(entry) ||
    Object.keys(entry).length !== 2 ||
    !("glob" in entry) ||
    !("class" in entry)
  )
    return false;
  return (
    typeof entry.glob === "string" &&
    isSafeProjectGlob(entry.glob) &&
    (entry.class === "generated" ||
      entry.class === "test" ||
      entry.class === "production")
  );
}

function parseOverride(entry: unknown): ClassificationOverride {
  if (!validOverride(entry)) throw new Error("classification_config_invalid");
  return { glob: entry.glob, class: entry.class };
}

function parseOverrides(value: unknown): ClassificationOverride[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("classification_config_invalid");
  return value.map(parseOverride);
}

export function parseClassificationConfig(
  value: unknown,
): ClassificationConfig {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    )
  )
    throw new Error("classification_config_invalid");
  return {
    generated: parseGlobArray(value.generated),
    test: parseGlobArray(value.test),
    production: parseGlobArray(value.production),
    overrides: parseOverrides(value.overrides),
  };
}
