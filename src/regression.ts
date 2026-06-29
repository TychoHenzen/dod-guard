/**
 * Extract a single metric number from a regression command's stdout.
 *
 * - When `extract` (a regex source string) is given, capture group 1 is parsed
 *   as the number. If the regex does not match (or group 1 is not numeric),
 *   returns null — it never silently falls back to a stray number elsewhere.
 * - Without `extract`, the LAST number in stdout is used (tools typically print
 *   the headline metric last). Decimals and negatives are supported.
 * - Returns null when no number can be parsed. The caller treats null as a
 *   fail-safe FAIL — a regression proof never auto-passes on output it cannot
 *   parse (mirrors the mutation predicate's unparseable path).
 */
export function extractNumber(stdout: string, extract?: string): number | null {
  if (extract) {
    const match = stdout.match(new RegExp(extract));
    if (!match || match[1] === undefined) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  const numbers = stdout.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const value = Number(numbers[numbers.length - 1]);
  return Number.isFinite(value) ? value : null;
}
