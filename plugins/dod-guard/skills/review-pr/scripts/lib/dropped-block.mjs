// A file name or answer id holding HTML could close the details block early.
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    groups.set(item[key], [...(groups.get(item[key]) ?? []), item]);
  }
  return groups;
}

function droppedItem({ id, line, reason, answer }) {
  return `${id} line ${line} (${reason}, ${escapeHtml(answer)})`;
}

// One line per file and rule rather than per violation keeps a #935-scale
// review (370 dropped) far under GitHub's body limit, while every S id, line,
// reason, and cited answer stays visible. Returns null when nothing was dropped.
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
  lines.push("</details>");
  return lines.join("\n");
}

export { droppedBlock };
