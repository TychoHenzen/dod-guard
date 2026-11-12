// The opening lines of the gate report and of its comment.
import { quotaText } from "./pr-gate-quota.mjs";
import { nonBlocking } from "./pr-gate-sections.mjs";

export const verdict = (gate) => (gate.passed ? "PASS" : "FAIL");

const SETTING_CHANGED_TEXT =
  "This pull request changes .quality-guard.json. " +
  "The setting from the merge base was applied to both scans, " +
  "so the change takes effect after merge.";

export function reportHeader({
  gate,
  mergeBase,
  changedCount,
  settingChanged,
}) {
  return [
    "# Quality gate report",
    "",
    `**Result: ${verdict(gate)}**`,
    "",
    `Compared ${changedCount} changed file(s) ` +
      `with merge base \`${mergeBase}\`. ` +
      "Only findings that are new in this pull request can block it; " +
      "pre-existing ones are listed here and counted toward the quota.",
    "",
    quotaText(gate.quota),
    "",
    ...(settingChanged ? [SETTING_CHANGED_TEXT, ""] : []),
  ];
}

// The bullets that appear only when files were skipped or the setting changed.
function optionalBullets({ skipped, log, settingChanged }) {
  return [
    ...(skipped.length > 0
      ? [
          `- Changed files skipped by an exclusion: ${skipped.length} ` +
            `(listed in ${log})`,
        ]
      : []),
    ...(settingChanged
      ? [
          "- This pull request changes .quality-guard.json; " +
            "the merge-base setting applied.",
        ]
      : []),
  ];
}

export function commentSummary({
  gate,
  classified,
  link,
  skipped,
  settingChanged,
}) {
  const log = link
    ? `[full log](${link})`
    : "the quality-gate-report build artifact";
  // Moved findings are still open debt; they just changed files.
  const open = classified.existing.length + classified.moved.length;
  return [
    `- New blocking findings: ${gate.blocking.length}`,
    `- New findings below the blocking threshold: ` +
      `${nonBlocking(gate, classified).length} (listed in ${log})`,
    `- ${quotaText(gate.quota)}`,
    `- Pre-existing findings still open in the changed files: ${open}. ` +
      `Every one is listed in ${log}; they do not need individual fixes.`,
    ...optionalBullets({ skipped, log, settingChanged }),
  ];
}
