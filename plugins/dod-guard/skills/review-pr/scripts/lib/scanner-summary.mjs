// A review body is capped by GitHub at 65536 characters, and one kept scanner
// violation costs a bullet. So the body and inline comments carry a summary per
// file, and the complete list goes into separate PR comments.

// Violations a file shows in full before it is summarized.
const SHOWN = 5;
// Characters of scanner text the review body may carry; the rest of the body
// (plan slots, judged findings, dropped block) has the other part of the limit.
const BODY_BUDGET = 30_000;
// A scanner comment part stays well under GitHub's 65536-character comment limit.
const PART_LIMIT = 60_000;
const COMMENT_MARKER = "dod-guard:review-pr-scanner";

function byLineThenRule(violations) {
  return [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

function item(violation) {
  return `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`;
}

function tally(violations, key, label, format) {
  const counts = new Map();
  for (const violation of violations) {
    counts.set(violation[key], (counts.get(violation[key]) ?? 0) + 1);
  }
  const ranked = [...counts].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(right[0]));
  return `${label}: ${ranked.map(([name, count]) => `${format(name)} x${count}`).join(", ")}.`;
}

// A file with SHOWN violations or fewer renders its bullets as before.
function scannerBody(severity, sorted) {
  const header = `**${severity}** quality-guard structural findings (${sorted.length})`;
  if (sorted.length <= SHOWN) {
    return [header, "", ...sorted.map(item)].join("\n");
  }
  const bySeverity = tally(sorted, "severity", "By severity", String);
  const byRule = tally(sorted, "rule", "By rule", (name) => `\`${name}\``);
  const counts = `${bySeverity} ${byRule}`;
  const rest = `...and ${sorted.length - SHOWN} more, in the scanner findings comments on this pull request.`;
  return [header, "", counts, "", `First ${SHOWN} by line:`, ...sorted.slice(0, SHOWN).map(item), rest].join("\n");
}

// Scanner entries take body space until the budget is used; later ones are
// counted instead of rendered. Other entries always render.
function fitScanner(entries, budget = BODY_BUDGET) {
  let used = 0;
  let omitted = 0;
  const texts = [];
  for (const { scanner, text } of entries) {
    if (scanner && used + text.length > budget) {
      omitted += 1;
    } else {
      used += scanner ? text.length : 0;
      texts.push(text);
    }
  }
  return { texts, omitted };
}

function fileSection([file, violations]) {
  return [`### \`${file}\` (${violations.length})`, "", ...byLineThenRule(violations).map(item), ""];
}

function marker(headSha, part, parts) {
  return `<!-- ${COMMENT_MARKER} head=${headSha} part=${part}/${parts} -->`;
}

function splitParts(lines) {
  const parts = [[]];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > PART_LIMIT && parts.at(-1).length > 0) {
      parts.push([]);
      size = 0;
    }
    parts.at(-1).push(line);
    size += line.length + 1;
  }
  return parts;
}

// One comment body per part, each starting with a marker that names the head,
// so a retry can tell which parts are already posted.
function fullListComments(headSha, byFile) {
  const lines = [...byFile].flatMap(fileSection);
  const parts = splitParts(lines);
  return parts.map((part, index) => {
    const heading = `## dod-guard scanner findings (part ${index + 1} of ${parts.length})`;
    return { body: [marker(headSha, index + 1, parts.length), heading, "", ...part].join("\n") };
  });
}

export { COMMENT_MARKER, fitScanner, fullListComments, SHOWN, scannerBody };
