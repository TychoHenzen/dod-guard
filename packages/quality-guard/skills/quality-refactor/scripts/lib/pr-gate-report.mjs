// Markdown for the pull-request gate: a full log kept as a build artifact,
// and one short comment that points at it.
import { commentSummary, reportHeader, verdict } from "./pr-gate-lead.mjs";
import {
  grownSection,
  nonBlocking,
  section,
  skippedSection,
} from "./pr-gate-sections.mjs";

export const COMMENT_MARKER = "<!-- quality-pr-gate -->";
const MAX_COMMENT_FINDINGS = 25;

export function renderReport(summary) {
  const { gate, classified, skipped = [] } = summary;
  return [
    ...reportHeader(summary),
    ...skippedSection(skipped),
    ...section("New findings that block", gate.blocking),
    ...section(
      "New findings below the blocking threshold",
      nonBlocking(gate, classified),
    ),
    ...section(
      "Pre-existing findings removed by this pull request",
      classified.resolved,
    ),
    ...section(
      "Pre-existing findings still open in the changed files",
      classified.existing,
    ),
    ...grownSection(classified.worsened),
    ...section(
      "Findings that moved between changed files (not new)",
      classified.moved,
    ),
  ].join("\n");
}

export function renderComment({
  gate,
  classified,
  link,
  skipped = [],
  settingChanged = false,
}) {
  return [
    COMMENT_MARKER,
    `### Quality gate: ${verdict(gate)}`,
    "",
    ...commentSummary({ gate, classified, link, skipped, settingChanged }),
    "",
    ...section("New findings that block", gate.blocking, MAX_COMMENT_FINDINGS),
  ].join("\n");
}
