// Markdown for the pull-request gate: a full log kept as a build artifact, and one short comment that points at it.

export const COMMENT_MARKER = "<!-- quality-pr-gate -->";
const MAX_COMMENT_FINDINGS = 25;

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  );
}

function bullet(finding) {
  return `- \`${finding.file}:${finding.line}\` ${finding.rule} (${finding.severity}): ${finding.message}`;
}

function section(title, findings, limit = Number.POSITIVE_INFINITY) {
  if (findings.length === 0) return [];
  const more = findings.length > limit ? [`- ... and ${findings.length - limit} more in the full log`] : [];
  return [`## ${title} (${findings.length})`, "", ...sortFindings(findings).slice(0, limit).map(bullet), ...more, ""];
}

function grownSection(worsened) {
  if (worsened.length === 0) return [];
  const rows = worsened.map(
    (finding) => `- \`${finding.file}:${finding.line}\` ${finding.rule}: ${finding.was.message} -> ${finding.message}`,
  );
  return [`## Pre-existing findings that grew (${worsened.length})`, "", ...rows, ""];
}

function requirement({ top, low }) {
  return [top > 0 ? `${top} medium/high` : "", low > 0 ? `${low} low` : ""].filter(Boolean).join(" or ");
}

export function quotaText({ satisfied, available, fixed, required, targets }) {
  if (targets.top === 0 && targets.low === 0) return "Pre-existing quota: off.";
  if (available.top + available.low === 0) return "Pre-existing quota: nothing to pay down in the changed files.";
  return (
    `Pre-existing quota ${satisfied ? "met" : "NOT met"}: remove ${requirement(required)} finding(s) that were ` +
    `already in the changed files (removed ${fixed.top} medium/high and ${fixed.low} low; ` +
    `${available.top} medium/high and ${available.low} low were there).`
  );
}

const verdict = (gate) => (gate.passed ? "PASS" : "FAIL");

// New findings under the blocking threshold (for example medium ones at --block-on=high). They never block, but they
// are counted and listed so the debt a pull request adds stays visible.
const nonBlocking = (gate, classified) => classified.fresh.filter((finding) => !gate.blocking.includes(finding));

export function renderReport({ gate, classified, mergeBase, changedCount }) {
  const header = [
    "# Quality gate report",
    "",
    `**Result: ${verdict(gate)}**`,
    "",
    `Compared ${changedCount} changed file(s) with merge base \`${mergeBase}\`. Only findings that are new in this ` +
      "pull request can block it; pre-existing ones are listed here and counted toward the quota.",
    "",
    quotaText(gate.quota),
    "",
  ];
  return [
    ...header,
    ...section("New findings that block", gate.blocking),
    ...section("New findings below the blocking threshold", nonBlocking(gate, classified)),
    ...section("Pre-existing findings removed by this pull request", classified.resolved),
    ...section("Pre-existing findings still open in the changed files", classified.existing),
    ...grownSection(classified.worsened),
    ...section("Findings that moved between changed files (not new)", classified.moved),
  ].join("\n");
}

export function renderComment({ gate, classified, link }) {
  const log = link ? `[full log](${link})` : "the quality-gate-report build artifact";
  // Moved findings are still open debt; they just changed files.
  const open = classified.existing.length + classified.moved.length;
  return [
    COMMENT_MARKER,
    `### Quality gate: ${verdict(gate)}`,
    "",
    `- New blocking findings: ${gate.blocking.length}`,
    `- New findings below the blocking threshold: ${nonBlocking(gate, classified).length} (listed in ${log})`,
    `- ${quotaText(gate.quota)}`,
    `- Pre-existing findings still open in the changed files: ${open}. Every one is listed in ${log}; they do not ` +
      "need individual fixes.",
    "",
    ...section("New findings that block", gate.blocking, MAX_COMMENT_FINDINGS),
  ].join("\n");
}
