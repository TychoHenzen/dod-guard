/**
 * Glob matching for the solve allow-list check.
 *
 * Three wildcards are supported.
 *   `*`  matches inside one path segment.
 *   `**` matches across segments, and a trailing slash also matches zero.
 *   `?`  matches exactly one character.
 * Every other character is literal.
 */

/** Regex metacharacters that must be escaped in a literal run. */
const REGEX_SPECIALS = /[.+^${}()|\\]/g;

/** Splits a pattern into wildcard tokens and literal runs. */
const GLOB_TOKENS = /\*\*\/|\*\*|\*|\?|[^*?]+/g;

/** Matches the `b/` side of a `diff --git a/X b/Y` header. A path may hold
 *  spaces, which git leaves unquoted, so both sides are non-greedy. */
const DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+?)$/gm;

function translateToken(token: string): string {
  if (token === "**/") return "(?:[^/]*/)*";
  if (token === "**") return ".*";
  if (token === "*") return "[^/]*";
  if (token === "?") return "[^/]";
  return token.replace(REGEX_SPECIALS, "\\$&");
}

/**
 * Test a path against a single glob pattern. An empty pattern matches nothing.
 */
export function matchGlob(filePath: string, pattern: string): boolean {
  if (!pattern) return false;
  const tokens = pattern.match(GLOB_TOKENS) ?? [];
  const body = tokens.map(translateToken).join("");
  try {
    return new RegExp(`^${body}$`).test(filePath);
  } catch {
    // A pattern that is not a valid regex body matches nothing.
    return false;
  }
}

/**
 * Collect the files a unified diff touches and return the deduplicated ones
 * that match none of the given patterns. An empty or absent pattern list
 * allows everything, so it yields no violations.
 */
export function filesMatchGlob(diff: string, patterns?: string[]): string[] {
  if (!(patterns?.length && diff.trim())) return [];

  const touched = new Set<string>();
  for (const match of diff.matchAll(DIFF_HEADER)) {
    const file = match[2].trim();
    if (file) touched.add(file);
  }

  return [...touched].filter((file) => !patterns.some((p) => matchGlob(file, p)));
}
