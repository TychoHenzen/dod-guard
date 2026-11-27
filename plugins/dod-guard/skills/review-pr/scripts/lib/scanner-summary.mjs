import { clip } from "./finding-text.mjs";

// One file's kept scanner violations as the text of its finding: a thread or a
// body line. A file can hold hundreds of violations, so the text names the
// count, the top rules, and the first few by line; quality-guard lists the rest
// for the file.

// Violations a file shows in full before it is summarized.
const SHOWN = 5;
// Rules the counts name before the rest are counted as one.
const RULES_SHOWN = 3;
// ASSUMPTION: half of the 581 kept messages on PR 535 were 64 characters or
// fewer and the longest 169, so 120 keeps most of them whole while five items,
// the counts and a moved-location note fit one 2000-character thread.
const MESSAGE_SHOWN = 120;
// ASSUMPTION: quality-guard rule ids are short words (21 characters at most on
// PR 535). The report does not promise that, so each is clipped and a thread's
// largest size stays known.
const RULE_SHOWN = 40;

const ruleName = (rule) => `\`${clip(rule, RULE_SHOWN)}\``;

function item(violation) {
  return `- ${ruleName(violation.rule)} line ${violation.line}: ${clip(violation.message, MESSAGE_SHOWN)}`;
}

function ranked(violations) {
  const counts = new Map();
  for (const violation of violations) {
    counts.set(violation.rule, (counts.get(violation.rule) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(right[0]));
}

function ruleTally(violations) {
  const all = ranked(violations);
  const named = all.slice(0, RULES_SHOWN).map(([rule, count]) => `${ruleName(rule)} x${count}`);
  const rest = all.length - named.length;
  return rest > 0 ? [...named, `${rest} more`].join(", ") : named.join(", ");
}

// The one line a group shows in the review body.
function scannerHeadline(violations) {
  const findings = violations.length === 1 ? "finding" : "findings";
  return `${violations.length} quality-guard ${findings}: ${ruleTally(violations)}`;
}

const isExisting = (violation) => violation.existing === true;

// The ones the pull request added come first, so a fix starts with them even
// when the code already held more of the same.
function newFirst(sorted) {
  return [...sorted.filter((violation) => !isExisting(violation)), ...sorted.filter(isExisting)];
}

// A file with SHOWN violations or fewer renders its bullets in full.
function scannerBody(severity, sorted) {
  const header = `**${severity}** quality-guard structural findings (${sorted.length})`;
  if (sorted.length <= SHOWN) {
    return [header, "", ...sorted.map(item)].join("\n");
  }
  const mixed = sorted.some(isExisting) && !sorted.every(isExisting);
  const label = mixed ? `First ${SHOWN}, the ones this PR added first, then by line:` : `First ${SHOWN} by line:`;
  const rest = `...and ${sorted.length - SHOWN} more; run quality-guard on this file to list them.`;
  const items = newFirst(sorted).slice(0, SHOWN).map(item);
  return [header, "", `By rule: ${ruleTally(sorted)}.`, "", label, ...items, rest].join("\n");
}

export { MESSAGE_SHOWN, RULE_SHOWN, scannerBody, scannerHeadline };
