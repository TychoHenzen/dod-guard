// The subset of Biome's include globs the width resolver can judge without
// guessing: `*`, `**` and literal segments. Other syntax is reported as
// unsupported so the caller falls back instead of misreading a pattern.

const NEGATION = /^!!?/;
const EXOTIC_SYNTAX = /[?[\]{}\\!]/;
const REGEX_SPECIAL = /[.+^$()|\\]/g;
const DOT_SEGMENTS = new Set(["", ".", ".."]);

function patternBody(pattern) {
  return pattern.replace(NEGATION, "");
}

function isSupportedSegment(segment) {
  if (segment === "**") return true;
  if (DOT_SEGMENTS.has(segment) || segment.includes("**")) return false;
  return !EXOTIC_SYNTAX.test(segment);
}

/** True when `pattern` uses syntax outside `*`, `**` and literal segments. */
export function isUnsupportedGlob(pattern) {
  if (typeof pattern !== "string") return true;
  return !patternBody(pattern).split("/").every(isSupportedSegment);
}

function segmentMatches(pattern, segment) {
  const source = pattern
    .split("*")
    .map((part) => part.replace(REGEX_SPECIAL, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`).test(segment);
}

// `**` matches zero segments first, then tries consuming one more.
function globstarMatches(pattern, path) {
  if (segmentsMatch(pattern.slice(1), path)) return true;
  return path.length > 0 && segmentsMatch(pattern, path.slice(1));
}

function segmentsMatch(pattern, path) {
  if (pattern.length === 0) return path.length === 0;
  if (pattern[0] === "**") return globstarMatches(pattern, path);
  if (path.length === 0 || !segmentMatches(pattern[0], path[0])) return false;
  return segmentsMatch(pattern.slice(1), path.slice(1));
}

// Biome treats a pattern that names a directory as covering everything
// beneath it, which is how `!**/dist` excludes files inside dist/.
function matchesPathOrAncestor(pattern, relPath) {
  const patternSegments = pattern.split("/");
  const pathSegments = relPath.split("/");
  for (let length = pathSegments.length; length > 0; length -= 1) {
    const prefix = pathSegments.slice(0, length);
    if (segmentsMatch(patternSegments, prefix)) return true;
  }
  return false;
}

/**
 * Evaluate a Biome `includes` list for a path relative to the list's anchor
 * directory. A missing list matches everything; otherwise the last matching
 * pattern decides, and `!` or `!!` excludes.
 */
export function listIncludes(patterns, relPath) {
  if (patterns === undefined) return true;
  let included = false;
  for (const pattern of patterns) {
    const body = patternBody(pattern);
    if (matchesPathOrAncestor(body, relPath)) {
      included = !NEGATION.test(pattern);
    }
  }
  return included;
}
