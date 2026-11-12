// Text of the implementation handoff comment for handoff-comment.mjs: one bullet per task and the
// acceptance matrix block with its remainder line.
import { evidenceValues } from "./convergence-core.mjs";

// A row whose status is one of these needs no remainder entry.
const SETTLED = new Set(["pass", "inapplicable"]);

function oneLine(text) {
  return String(text).replace(/\s+/gu, " ");
}

// The bullet names the task's functional slice (or its parent-level marker) and its
// planned evidence ids, all from the task list, so the comment maps each task to its child.
function taskOwner(task) {
  if (task.child) {
    return `slice ${task.child}`;
  }
  return `parent-level ${task.parentLevel ?? "none"}`;
}

function taskBullet(task, entry) {
  const owner = taskOwner(task);
  const evidence = evidenceValues(task.evidence).join(", ");
  const done = `commit ${entry.commit}, files ${entry.files.join(", ")}`;
  return `- ${task.id} (${owner}): ${done}, evidence ${evidence}, result ${oneLine(entry.result)}`;
}

function remainderText(rows) {
  const open = rows.filter((row) => !SETTLED.has(row.status)).map((row) => row.id);
  if (open.length === 0) {
    return "none";
  }
  return open.join(", ");
}

function commentText(bullets, rows) {
  const remainder = remainderText(rows);
  return (
    "## Implementation handoff\n\n" +
    `${bullets.join("\n")}\n` +
    "\n## Acceptance matrix\n\n```json\n" +
    `${JSON.stringify(rows, null, 2)}\n` +
    "```\n\n" +
    `Remainder: ${remainder}\n`
  );
}

export { commentText, taskBullet };
