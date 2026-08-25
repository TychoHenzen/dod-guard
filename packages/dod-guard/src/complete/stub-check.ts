/**
 * Mechanical stub/placeholder detection. Scans a test body for patterns
 * that indicate it is not a real test: empty body, placeholder markers,
 * missing assertions, or explicit not-implemented throws.
 */

export interface StubCheckResult {
  pass: boolean;
  reasons: string[];
}

const PLACEHOLDER_RE = /\b(TODO|FIXME|NOT\s+IMPLEMENTED|PLACEHOLDER)\b/i;

const NOT_IMPLEMENTED_RE = /throw\s+new\s+Error\s*\(\s*["']not\s+implemented["']\s*\)|raise\s+NotImplementedError/i;

const ASSERTION_TOKENS = [
  "assert",
  "expect(",
  "expect.",
  ".should",
  ".toBe",
  ".toEqual",
  ".toMatch",
  ".toThrow",
  ".toStrictEqual",
  ".toContain",
  ".toHaveLength",
  ".toHaveProperty",
  ".toHaveBeenCalled",
  ".rejects",
  ".resolves",
  "raises(",
  "throws(",
  "deepStrictEqual",
  "strictEqual",
  "notStrictEqual",
  "deepEqual",
  "notDeepEqual",
  "ok(",
  "fail(",
  "match(",
  "doesNotMatch(",
  "doesNotThrow(",
  "ifError(",
];

function isEmptyBody(body: string): boolean {
  const stripped = body
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/#.*$/gm, "")
    .trim();
  return stripped === "" || stripped === "{}" || stripped === "pass" || stripped === "return" || stripped === "return;";
}

function hasAssertions(body: string): boolean {
  const lower = body.toLowerCase();
  return ASSERTION_TOKENS.some((token) => lower.includes(token.toLowerCase()));
}

export function checkStub(testBody: string): StubCheckResult {
  const reasons: string[] = [];

  if (isEmptyBody(testBody)) {
    reasons.push("test body is empty or contains only a bare return");
  }

  if (PLACEHOLDER_RE.test(testBody)) {
    reasons.push("test body contains a placeholder marker (TODO/FIXME/NOT IMPLEMENTED)");
  }

  if (NOT_IMPLEMENTED_RE.test(testBody)) {
    reasons.push("test body throws a not-implemented error");
  }

  if (!(isEmptyBody(testBody) || hasAssertions(testBody))) {
    reasons.push("test body contains no assertions");
  }

  return { pass: reasons.length === 0, reasons };
}
