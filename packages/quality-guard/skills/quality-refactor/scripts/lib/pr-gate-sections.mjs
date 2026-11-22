// Markdown sections for the pull-request gate report.

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

function bullet(finding) {
  return (
    `- \`${finding.file}:${finding.line}\` ${finding.rule} ` +
    `(${finding.severity}): ${finding.message}`
  );
}

export function section(title, findings, limit = Number.POSITIVE_INFINITY) {
  if (findings.length === 0) return [];
  const more =
    findings.length > limit
      ? [`- ... and ${findings.length - limit} more in the full log`]
      : [];
  return [
    `## ${title} (${findings.length})`,
    "",
    ...sortFindings(findings).slice(0, limit).map(bullet),
    ...more,
    "",
  ];
}

export function grownSection(worsened) {
  if (worsened.length === 0) return [];
  const rows = worsened.map(
    (finding) =>
      `- \`${finding.file}:${finding.line}\` ${finding.rule}: ` +
      `${finding.was.message} -> ${finding.message}`,
  );
  return [
    `## Pre-existing findings that grew (${worsened.length})`,
    "",
    ...rows,
    "",
  ];
}

// New findings under the blocking threshold (for example medium ones at
// --block-on=high). They never block, but they are counted and listed so
// the debt a pull request adds stays visible.
export const nonBlocking = (gate, classified) =>
  classified.fresh.filter((finding) => !gate.blocking.includes(finding));

export function skippedSection(skipped) {
  if (skipped.length === 0) return [];
  const rows = skipped.map((path) => `- \`${path}\``);
  return [
    `## Changed files skipped by an exclusion (${skipped.length})`,
    "",
    ...rows,
    "",
  ];
}
