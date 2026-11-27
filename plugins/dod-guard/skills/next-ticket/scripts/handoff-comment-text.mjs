// Text of the implementation handoff comment for handoff-comment.mjs: one line per task and the
// acceptance matrix block with its remainder line. Each task line names its task by id and each row
// names its planned row and criterion by id; the issue body above the comment holds the rest (the
// task's slice and evidence ids, the row's path, proof, expected and evidence ids), and the commit
// names the files. Nothing the body or git already holds is copied here.

// A row whose status is one of these needs no remainder entry.
const SETTLED = new Set(["pass", "inapplicable"]);

function oneLine(text) {
  return String(text).replace(/\s+/gu, " ").trim();
}

function taskLine(task, entry) {
  return `- ${task.id}: commit ${entry.commit}. ${oneLine(entry.result)}`;
}

// One row per line, so the block is one JSON object that a reader parses whole
// and a person reads row by row.
function matrixBlock(rows, headSha) {
  const body = rows.map((row) => JSON.stringify(row)).join(",\n");
  return `{"headSha":${JSON.stringify(headSha)},"rows":[\n${body}\n]}`;
}

function remainderText(rows) {
  const open = rows.filter((row) => !SETTLED.has(row.status)).map((row) => row.id);
  if (open.length === 0) {
    return "none";
  }
  return open.join(", ");
}

function commentText(lines, rows, headSha) {
  return (
    "## Implementation handoff\n\n" +
    `${lines.join("\n")}\n` +
    "\n## Acceptance matrix\n\n```json\n" +
    `${matrixBlock(rows, headSha)}\n` +
    "```\n\n" +
    `Remainder: ${remainderText(rows)}\n`
  );
}

export { commentText, taskLine };
