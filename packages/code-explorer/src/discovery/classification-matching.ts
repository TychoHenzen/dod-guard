import type { ClassificationConfig } from "./classification-config.js";
import type { ClassificationOverride } from "./classification-override.js";
import type { ContentClass } from "./content-class.js";

export { markerClass } from "./classification-markers.js";

export function normalizeProjectPath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (unsafeProjectPath(normalized)) return undefined;
  return normalized;
}

function unsafeProjectPath(path: string): boolean {
  return (
    !path ||
    absoluteProjectPath(path) ||
    path.split("/").some(invalidProjectPathPart)
  );
}

function absoluteProjectPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:/.test(path);
}

function invalidProjectPathPart(part: string): boolean {
  return !part || part === "." || part === "..";
}

export function safeGlobMatches(path: string, glob: string): boolean {
  if (!isSafeProjectGlob(glob)) return false;
  const expression = glob
    .split("**")
    .map((part) =>
      part
        .replace(/[.]/g, "\\.")
        .replaceAll("*", "[^/]*")
        .replaceAll("?", "[^/]"),
    )
    .join(".*");
  return new RegExp(`^${expression}$`, "u").test(path);
}

function isSafeProjectGlob(glob: string): boolean {
  const normalized = normalizeProjectPath(glob);
  if (!normalized || normalized !== glob.replaceAll("\\", "/")) return false;
  return !(/[[\]{}()|+^$\\]/.test(glob) || glob.includes(":"));
}

export function lastConfiguredClass(
  path: string,
  config: ClassificationConfig,
): ContentClass | undefined {
  const ordered: ReadonlyArray<readonly [ContentClass, readonly string[]]> = [
    ["generated", config.generated],
    ["test", config.test],
    ["production", config.production],
  ];
  let matched: ContentClass | undefined;
  for (const [classification, globs] of ordered)
    for (const glob of globs)
      if (safeGlobMatches(path, glob)) matched = classification;
  return matched;
}

export function lastConfiguredOverride(
  path: string,
  config: ClassificationConfig,
): ClassificationOverride["class"] | undefined {
  let matched: ClassificationOverride["class"] | undefined;
  for (const override of config.overrides)
    if (safeGlobMatches(path, override.glob)) matched = override.class;
  return matched;
}
