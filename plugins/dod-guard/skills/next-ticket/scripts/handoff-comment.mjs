// Builds the handoff comment text for handoff-build.mjs. Identity comes from the
// issue body, never from the evidence file: each matrix row's id, contract, path,
// proof, expected and evidence ids come from the planned acceptance matrix, and
// each task bullet's id, functional slice and evidence ids come from the task
// list. The evidence entry owns only what was observed.
// A previous handoff's ## Preflight checkpoint section is copied through, so a rebuild never drops it.

import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { checkpointSection } from "../../../lib/preflight-checkpoint.mjs";
import { evidenceValues } from "./convergence-core.mjs";
import { carryProblems, carryRecord, refuseCarry } from "./handoff-carry.mjs";
import { rowSetProblems, taskProblems } from "./handoff-evidence-problems.mjs";

// A row whose status is one of these needs no remainder entry.
const SETTLED = new Set(["pass", "inapplicable"]);

// Keys come in the order post-push and the reader expect.
function matrixRow(row, entry, headSha) {
  const out = {
    id: row.id,
    contract: row.contract,
    path: row.path,
    proof: row.proof,
    expected: row.expected,
    observed: entry.observed,
    status: entry.status,
    evidence: row.evidence,
    headSha,
  };
  if (Object.hasOwn(entry, "carryForward")) {
    out.carryForward = carryRecord(entry, headSha);
  }
  if (Object.hasOwn(entry, "reason")) {
    out.reason = entry.reason;
  }
  return out;
}

function oneLine(text) {
  return String(text).replace(/\s+/g, " ");
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

// Carry checks read fields the earlier checks validate, so they run only when those pass.
function buildProblems({ input, evidence, headSha, carried, carryCheck }) {
  const planned = input.plannedAcceptanceMatrix;
  const problems = [...taskProblems(input.tasks, evidence.tasks), ...rowSetProblems(planned, evidence.rows)];
  if (carried.error) {
    problems.push(carried.error);
  }
  if (problems.length > 0) {
    return problems;
  }
  return carryProblems({ planned, rows: evidence.rows, headSha, carryCheck });
}

// Returns { text } when every planned task and row has a well-formed entry and no
// entry is extra or repeated, else { errors } naming each mismatch, with nothing built.
// A previousHandoff that carries a ## Preflight checkpoint section has it copied unchanged to the
// end of the text; one whose section the reader refuses builds nothing.
function build({ body, evidence, headSha, previousHandoff = "", carryCheck = refuseCarry }) {
  const { input, errors } = parseIssueBodyRecords(body);
  if (errors.length > 0) {
    return { errors };
  }
  const carried = checkpointSection(previousHandoff);
  const problems = buildProblems({ input, evidence, headSha, carried, carryCheck });
  if (problems.length > 0) {
    return { errors: problems };
  }
  const planned = input.plannedAcceptanceMatrix;
  const rows = planned.map((row) => matrixRow(row, evidence.rows[row.id], headSha));
  const entries = new Map(evidence.tasks.map((entry) => [entry.id, entry]));
  const bullets = input.tasks.map((task) => taskBullet(task, entries.get(task.id)));
  const carriedText = (carried.section && `\n${carried.section}`) || "";
  return { text: `${commentText(bullets, rows)}${carriedText}` };
}

export { build };
