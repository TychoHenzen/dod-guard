// Structural rules judge a touched file's design, so they cover the whole file.
const WHOLE_FILE_RULES = new Set([
  "file-length",
  "function-length",
  "complexity",
  "param-count",
  "nesting-depth",
  "types-per-file",
  "duplicate-block",
  "else-branch",
  "unnamed-tuple",
  "dead-export",
  "unused-local",
  "test-only-export",
  "output-parameter",
  "flag-parameter",
  "stateless-method",
  "build-entrypoint",
  "test-entrypoint",
]);
const LINE_RULES = new Set([
  "line-length",
  "comment-bloat",
  "commented-out-code",
  "comment-restates-code",
  "comment-metadata",
  "comment-placeholder",
  "comment-missing-reference",
  "todo-marker",
  "naming-encoding",
  "wildcard-import",
]);

// A rule in neither set, such as one quality-guard adds later, returns
// undefined and is treated as line-scoped, so it can never flood a review.
function ruleScope(rule) {
  if (WHOLE_FILE_RULES.has(rule)) {
    return "file";
  }
  if (LINE_RULES.has(rule)) {
    return "line";
  }
  return undefined;
}

export { ruleScope };
