import { groupBy } from "./group-by.mjs";

// A file name or answer id holding HTML could close the details block early.
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function droppedItem({ id, line, reason, answer, message }) {
  return `${id} line ${line} (${reason}, ${escapeHtml(answer)}): ${escapeHtml(message)}`;
}

// One entry per cited answer id, in first-cited order, so a question cited by
// many findings is listed once with its text.
function citedLines(dropped) {
  const texts = new Map();
  for (const { answer, answerText } of dropped) {
    if (!texts.has(answer)) {
      texts.set(answer, answerText);
    }
  }
  return [...texts].map(([answer, text]) => `- ${escapeHtml(answer)}: ${escapeHtml(text)}`);
}

// One line per file and rule rather than per violation keeps a #935-scale
// review (370 dropped) far under GitHub's body limit, while every S id, line,
// reason, message, and cited question stays visible. Returns null when nothing
// was dropped.
function droppedBlock(dropped) {
  if (dropped.length === 0) {
    return null;
  }
  const lines = ["<details>", `<summary>Dropped scanner findings (${dropped.length})</summary>`];
  for (const [file, inFile] of groupBy(dropped, "file")) {
    lines.push("", `**${escapeHtml(file)}**`, "");
    for (const [rule, items] of groupBy(inFile, "rule")) {
      lines.push(`- \`${rule}\`: ${items.map(droppedItem).join("; ")}`);
    }
  }
  lines.push("", "**Cited questions**", "", ...citedLines(dropped));
  lines.push("</details>");
  return lines.join("\n");
}

export { droppedBlock };
