function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function renderAdoptions(comparison, lines) {
  const recorded = comparison.adopted.reduce((sum, item) => sum + item.now, 0);
  const files = [
    ...new Set(comparison.adopted.map((item) => item.file)),
  ].sort();
  lines.push(
    `Adopted ${files.length} file(s) into the baseline ` +
      `(${recorded} violations recorded):`,
  );
  for (const file of files.slice(0, 20)) lines.push(`  ${file}`);
  if (files.length > 20) lines.push(`  ... ${files.length - 20} more`);
}

function renderRegressions(comparison) {
  if (comparison.regressions.length === 0) return ["No regressions."];
  const lines = ["REGRESSIONS (" + comparison.regressions.length + "):"];
  for (const item of comparison.regressions) {
    lines.push(
      "  " +
        item.file +
        "  " +
        item.rule +
        "  " +
        item.before +
        " -> " +
        item.now,
    );
  }
  return lines;
}

function renderComparison(comparison) {
  const lines = [
    "",
    "Baseline: " + comparison.totalBefore + " -> " + comparison.totalNow,
  ];
  lines.push(...renderRegressions(comparison));
  lines.push(
    `Improvements: ${comparison.improvements.length} (file, rule) pairs`,
  );
  if (comparison.adopted.length > 0) renderAdoptions(comparison, lines);
  return lines.join("\n");
}

export function renderText(result, top) {
  const { summary, comparison } = result;
  const lines = [];
  const counts = `${summary.errors} error, ${summary.warnings} warn`;
  lines.push(
    `Scanned ${result.fileCount} files \u2014 ${summary.total} violations ` +
      `(${counts})`,
  );
  lines.push("");
  lines.push("By rule:");
  for (const [rule, count] of topEntries(summary.byRule, 20))
    lines.push(`  ${String(count).padStart(6)}  ${rule}`);
  lines.push("");
  lines.push(`Worst files (top ${top}):`);
  for (const [file, count] of topEntries(summary.byFile, top))
    lines.push(`  ${String(count).padStart(6)}  ${file}`);
  if (comparison) lines.push(renderComparison(comparison));
  return lines.join("\n");
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
