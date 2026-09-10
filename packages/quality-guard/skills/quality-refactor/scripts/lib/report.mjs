import { renderJson, renderText } from "./report-render.mjs";

const SEVERITY_ORDER = { error: 0, warn: 1 };
const RULE_ORDER = [
  "dead-export",
  "test-only-export",
  "commented-out-code",
  "duplicate-block",
  "types-per-file",
  "file-length",
  "complexity",
  "function-length",
  "nesting-depth",
  "param-count",
  "unnamed-tuple",
  "else-branch",
  "stateless-method",
  "comment-bloat",
  "comment-restates-code",
  "todo-marker",
  "assumption-marker",
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
  increment(summary.byRule, violation.rule);
  increment(summary.byFile, violation.file);
  summary.errors += violation.severity === "error";
}

export function summarize(violations) {
  const summary = {
    total: violations.length,
    errors: 0,
    byRule: {},
    byFile: {},
  };
  for (const violation of violations) recordSummary(summary, violation);
  return {
    total: summary.total,
    errors: summary.errors,
    warnings: summary.total - summary.errors,
    byRule: summary.byRule,
    byFile: summary.byFile,
  };
}

function addToWorkUnit(byFile, violation) {
  const unit = byFile.get(violation.file) ?? {
    file: violation.file,
    errors: 0,
    warnings: 0,
    rules: {},
    items: [],
  };
  unit.items.push(violation);
  increment(unit.rules, violation.rule);
  unit.errors += violation.severity === "error";
  unit.warnings += violation.severity !== "error";
  byFile.set(violation.file, unit);
}

export function toWorkUnits(violations) {
  const byFile = new Map();
  for (const violation of sortViolations(violations))
    addToWorkUnit(byFile, violation);
  return [...byFile.values()].sort(
    (a, b) => b.errors - a.errors || b.warnings - a.warnings,
  );
}

export { renderJson, renderText };
