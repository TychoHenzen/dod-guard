import { normalizeWorkspacePath } from "./workspace-path-rules.js";

const MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH = 256;
const MAXIMUM_CALLER_EXCLUSION_GLOBS = 64;
const MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES = 4_096;

function callerGlobMatches(path: string, pattern: string): boolean {
  const normalizedPattern = normalizeWorkspacePath(pattern);
  if (normalizedPattern.length === 0 || normalizedPattern.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH) return false;
  let previous = Array(path.length + 1).fill(false);
  previous[0] = true;
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const recursiveWildcard = character === "*" && normalizedPattern[index + 1] === "*";
    if (recursiveWildcard) index += 1;
    const current = Array(path.length + 1).fill(false);
    for (let pathIndex = 0; pathIndex <= path.length; pathIndex += 1) {
      if (character === "*") {
        current[pathIndex] =
          previous[pathIndex] ||
          (pathIndex > 0 && (recursiveWildcard || path[pathIndex - 1] !== "/") && current[pathIndex - 1]);
      } else if (pathIndex > 0 && character === "?")
        current[pathIndex] = path[pathIndex - 1] !== "/" && previous[pathIndex - 1];
      else if (pathIndex > 0) current[pathIndex] = character === path[pathIndex - 1] && previous[pathIndex - 1];
    }
    previous = current;
  }
  return previous[path.length];
}

function callerExclusionPatterns(patterns: readonly string[]): readonly string[] {
  const accepted: string[] = [];
  let byteLength = 0;
  for (const pattern of patterns) {
    const normalized = normalizeWorkspacePath(pattern);
    if (
      accepted.length >= MAXIMUM_CALLER_EXCLUSION_GLOBS ||
      normalized.length === 0 ||
      normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_LENGTH ||
      byteLength + normalized.length > MAXIMUM_CALLER_EXCLUSION_GLOB_BYTES ||
      normalized.includes("\0") ||
      normalized.startsWith("/") ||
      normalized.split("/").includes("..")
    )
      continue;
    accepted.push(normalized);
    byteLength += normalized.length;
  }
  return accepted;
}

/** Filters repository-relative discovery paths with bounded `*`, `?`, and `**` caller exclusion globs. */
export function filterWorkspaceDiscoveryPaths(
  paths: readonly string[],
  excludePatterns: readonly string[],
): readonly string[] {
  const acceptedPatterns = callerExclusionPatterns(excludePatterns);
  return paths
    .map(normalizeWorkspacePath)
    .filter((path) => !acceptedPatterns.some((pattern) => callerGlobMatches(path, pattern)));
}
