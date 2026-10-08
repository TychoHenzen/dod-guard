import { renderJson, renderText } from "./report-render.mjs";
import { requireSeverity } from "./severity.mjs";
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const RULE_ORDER = [
  "dead-export",
  "test-only-export",
  "commented-out-code",
  "duplicate-block",
  "types-per-file",
  "file-length",
  "partial-type-length",
  "complexity",
  "function-length",
  "nesting-depth",
  "param-count",
  "unnamed-tuple",
  "else-branch",
  "stateless-method",
  "comment-bloat",
  "comment-restates-code",
  "comment-missing-reference",
  "output-parameter",
  "flag-parameter",
  "naming-encoding",
  "comment-metadata",
  "comment-placeholder",
  "build-entrypoint",
  "test-entrypoint",
  "todo-marker",
  "line-length",
];

function rank(violation) {
  const byRule = RULE_ORDER.indexOf(violation.rule);
  return [SEVERITY_ORDER[violation.severity] ?? 9, byRule === -1 ? 99 : byRule];
}

export function sortViolations(violations) {
  return [...violations].sort((a, b) => {
    const [sa, ra] = rank(a);
    const [sb, rb] = rank(b);
    if (sa !== sb) return sa - sb;
    if (ra !== rb) return ra - rb;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
}

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function recordSummary(summary, violation) {
  const severity = requireSeverity(violation.severity);
  increment(summary.byRule, violation.rule);
  increment(summary.byFile, violation.file);
  summary[severity] += 1;
}

export function summarize(violations) {
  const summary = {
    total: violations.length,
    high: 0,
    medium: 0,
    low: 0,
    byRule: {},
    byFile: {},
  };
  for (const violation of violations) recordSummary(summary, violation);
  return {
    total: summary.total,
    high: summary.high,
    medium: summary.medium,
    low: summary.low,
    byRule: summary.byRule,
    byFile: summary.byFile,
  };
}

function addToWorkUnit(byFile, violation) {
  const unit = byFile.get(violation.file) ?? {
    file: violation.file,
    high: 0,
    medium: 0,
    low: 0,
    rules: {},
    items: [],
  };
  const severity = requireSeverity(violation.severity);
  unit.items.push(violation);
  increment(unit.rules, violation.rule);
  unit[severity] += 1;
  byFile.set(violation.file, unit);
}

export function toWorkUnits(violations) {
  const byFile = new Map();
  for (const violation of sortViolations(violations))
    addToWorkUnit(byFile, violation);
  return [...byFile.values()].sort(
    (a, b) =>
      b.high - a.high || b.medium - a.medium || b.low - a.low,
  );
}
export { renderJson, renderText };
