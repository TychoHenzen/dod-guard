function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function renderText(result, top) {
  const { summary } = result;
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
  return lines.join("\n");
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
