// Output formatting: human text, machine JSON, and step-plan grouping.

const SEVERITY_ORDER = { error: 0, warn: 1 };

/**
 * Rules ordered by how much they should be fixed first. Structural problems
 * come before cosmetic ones because fixing structure moves the cosmetic
 * numbers for free, and cosmetic fixes applied first get thrown away.
 */
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

export function summarize(violations) {
  const byRule = {};
  const byFile = {};
  let errors = 0;
  for (const violation of violations) {
    byRule[violation.rule] = (byRule[violation.rule] ?? 0) + 1;
    byFile[violation.file] = (byFile[violation.file] ?? 0) + 1;
    if (violation.severity === "error") errors += 1;
  }
  return { total: violations.length, errors, warnings: violations.length - errors, byRule, byFile };
}

/**
 * Group violations into per-file work units, ordered worst-first. Each unit is
 * one atomic refactoring step: one file, every rule it violates, fixed in one
 * pass so the file is only touched once.
 */
export function toWorkUnits(violations) {
  const byFile = new Map();
  for (const violation of sortViolations(violations)) {
    const unit = byFile.get(violation.file) ?? { file: violation.file, errors: 0, warnings: 0, rules: {}, items: [] };
    unit.items.push(violation);
    unit.rules[violation.rule] = (unit.rules[violation.rule] ?? 0) + 1;
    if (violation.severity === "error") unit.errors += 1;
    else unit.warnings += 1;
    byFile.set(violation.file, unit);
  }
  return [...byFile.values()].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
}

function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function renderComparison(comparison) {
  const lines = [""];
  lines.push(`Baseline: ${comparison.totalBefore} -> ${comparison.totalNow}`);
  if (comparison.regressions.length > 0) {
    lines.push(`REGRESSIONS (${comparison.regressions.length}):`);
    for (const item of comparison.regressions) {
      lines.push(`  ${item.file}  ${item.rule}  ${item.before} -> ${item.now}`);
    }
  } else {
    lines.push("No regressions.");
  }
  lines.push(`Improvements: ${comparison.improvements.length} (file, rule) pairs`);
  return lines.join("\n");
}

export function renderText(result, top) {
  const { summary, violations, comparison } = result;
  const lines = [];
  const counts = `${summary.errors} error, ${summary.warnings} warn`;
  lines.push(`Scanned ${result.fileCount} files — ${summary.total} violations (${counts})`);
  lines.push("");
  lines.push("By rule:");
  for (const [rule, count] of topEntries(summary.byRule, 20)) lines.push(`  ${String(count).padStart(6)}  ${rule}`);
  lines.push("");
  lines.push(`Worst files (top ${top}):`);
  for (const [file, count] of topEntries(summary.byFile, top)) lines.push(`  ${String(count).padStart(6)}  ${file}`);
  if (comparison) lines.push(renderComparison(comparison));
  return lines.join("\n");
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
