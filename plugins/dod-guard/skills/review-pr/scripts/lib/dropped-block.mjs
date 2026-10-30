import { groupBy } from "./group-by.mjs";

// Characters the dropped block may use. The review body also carries the plan
// slots and up to 30000 characters of scanner summary (scanner-summary.mjs),
// so this keeps the whole body clear of GitHub's 65536-character limit however
// many violations a review drops.
const DROPPED_BUDGET = 12_000;
// A cited question is shown at most this long; the full text is in the plan.
const QUESTION_SHOWN = 200;

// A file name or answer id holding HTML could close the details block early.
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function shortened(text) {
  const value = String(text ?? "");
  return value.length > QUESTION_SHOWN ? `${value.slice(0, QUESTION_SHOWN)}...` : value;
}

const idNumber = (id) => Number(String(id).slice(1));

// S3, S4, S5, S9 becomes "S3-S5, S9".
function idRanges(ids) {
  const numbers = [...new Set(ids.map(idNumber))].sort((left, right) => left - right);
  const ranges = [];
  for (const number of numbers) {
    const last = ranges.at(-1);
    if (last && number === last[1] + 1) {
      last[1] = number;
    } else {
      ranges.push([number, number]);
    }
  }
  return ranges.map(([from, to]) => (from === to ? `S${from}` : `S${from}-S${to}`)).join(", ");
}

// One line per rule, reason, and cited answer within a file.
function ruleLines(inFile) {
  const lines = [];
  for (const [rule, inRule] of groupBy(inFile, "rule")) {
    const cited = groupBy(
      inRule.map((item) => ({ ...item, cite: `${item.reason}, ${escapeHtml(item.answer)}` })),
      "cite",
    );
    for (const [cite, items] of cited) {
      lines.push(`- \`${rule}\` (${cite}) x${items.length}: ${idRanges(items.map((item) => item.id))}`);
    }
  }
  return lines;
}

function fileSections(dropped) {
  return [...groupBy(dropped, "file")].map(([file, inFile]) => ({
    lines: ["", `**${escapeHtml(file)}**`, "", ...ruleLines(inFile)],
    items: inFile,
  }));
}

// One entry per cited answer id, in first-cited order.
function citedLines(shown) {
  const texts = new Map();
  for (const { answer, answerText } of shown) {
    if (!texts.has(answer)) {
      texts.set(answer, answerText);
    }
  }
  return [...texts].map(([answer, text]) => `- ${escapeHtml(answer)}: ${escapeHtml(shortened(text))}`);
}

const size = (lines) => lines.reduce((total, line) => total + line.length + 1, 0);

// Whole file sections go in until the budget is used; the rest are counted.
function fitSections(sections, budget) {
  const shown = [];
  let used = 0;
  for (const section of sections) {
    const cost = size(section.lines) + size(citedLines(section.items));
    if (used + cost > budget) {
      break;
    }
    shown.push(section);
    used += cost;
  }
  return shown;
}

function overflowLine(sections, shown) {
  const rest = sections.slice(shown.length);
  const count = rest.reduce((total, section) => total + section.items.length, 0);
  return `...and ${count} more dropped findings across ${rest.length} more files, counted but not listed.`;
}

// Dropped violations collapse to counts and S id ranges per file, rule, and
// cited answer, and the block stops at DROPPED_BUDGET, so a review dropping
// thousands of findings still posts. A file too large for the budget is
// counted, not listed. Returns null when nothing was dropped.
function droppedBlock(dropped, budget = DROPPED_BUDGET) {
  if (dropped.length === 0) {
    return null;
  }
  const sections = fileSections(dropped);
  const shown = fitSections(sections, budget);
  const lines = ["<details>", `<summary>Dropped scanner findings (${dropped.length})</summary>`];
  lines.push(...shown.flatMap((section) => section.lines));
  if (shown.length < sections.length) {
    lines.push("", overflowLine(sections, shown));
  }
  const cited = citedLines(shown.flatMap((section) => section.items));
  lines.push("", "**Cited questions**", "", ...cited, "</details>");
  return lines.join("\n");
}

export { DROPPED_BUDGET, droppedBlock, idRanges };
