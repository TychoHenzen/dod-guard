// Builds the handoff comment text for handoff-build.mjs. Identity comes from the issue body, never from
// the evidence file, and stays there: each matrix row names its planned row and criterion by id, and the
// proofs join the rest of the row back from the planned matrix (lib/handoff-matrix.mjs). The evidence
// entry owns only what was observed. A previous handoff's ## Preflight checkpoint section is copied
// through, so a rebuild never drops it.
// The comment is short by design: lib/handoff-limits.mjs bounds every part of it, and a comment with
// any part over its limit, or over the handoff cap as a whole, is refused, never cut.

import { capProblem } from "../../../lib/github-text.mjs";
import { bodyLimitProblems, HANDOFF_LIMITS, lineProblem } from "../../../lib/handoff-limits.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { checkpointSection } from "../../../lib/preflight-checkpoint.mjs";
import { carryProblems, carryRecord, refuseCarry } from "./handoff-carry.mjs";
import { commentText, taskLine } from "./handoff-comment-text.mjs";
import { rowSetProblems, taskProblems } from "./handoff-evidence-problems.mjs";

// Keys come in the order lib/handoff-matrix.mjs reads them.
function matrixRow(row, entry) {
  const out = { id: row.id, contract: row.contract, status: entry.status, observed: entry.observed };
  if (Object.hasOwn(entry, "reason")) {
    out.reason = entry.reason;
  }
  if (Object.hasOwn(entry, "carryForward")) {
    out.carryForward = carryRecord(entry);
  }
  return out;
}

function carriedProblems(carried) {
  if (carried.error) {
    return [carried.error];
  }
  const size =
    carried.section && lineProblem("the carried ## Preflight checkpoint", carried.section, HANDOFF_LIMITS.checkpoint);
  return size ? [size] : [];
}

// Carry checks read fields the earlier checks validate, so they run only when those pass.
function buildProblems({ input, evidence, headSha, carried, carryCheck }) {
  const planned = input.plannedAcceptanceMatrix;
  const problems = [
    ...bodyLimitProblems(input),
    ...taskProblems(input.tasks, evidence.tasks),
    ...rowSetProblems(planned, evidence.rows),
    ...carriedProblems(carried),
  ];
  if (problems.length > 0) {
    return problems;
  }
  return carryProblems({ planned, rows: evidence.rows, headSha, carryCheck });
}

function sizeProblems(lines, tasks, rows) {
  const taskSizes = lines.map((line, at) => lineProblem(`task ${tasks[at].id} line`, line, HANDOFF_LIMITS.taskLine));
  const rowSizes = rows.map((row) => lineProblem(`matrix row ${row.id}`, JSON.stringify(row), HANDOFF_LIMITS.rowLine));
  return [...taskSizes, ...rowSizes].filter(Boolean);
}

// Returns { text } when every planned task and row has a well-formed entry, no entry is extra or
// repeated, and every part fits its limit, else { errors } naming each problem, with nothing built.
// A previousHandoff that carries a ## Preflight checkpoint section has it copied unchanged to the
// end of the text; one whose section the reader refuses, or that is over its limit, builds nothing.
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
  const rows = input.plannedAcceptanceMatrix.map((row) => matrixRow(row, evidence.rows[row.id]));
  const entries = new Map(evidence.tasks.map((entry) => [entry.id, entry]));
  const lines = input.tasks.map((task) => taskLine(task, entries.get(task.id)));
  const sizes = sizeProblems(lines, input.tasks, rows);
  if (sizes.length > 0) {
    return { errors: sizes };
  }
  const carriedText = (carried.section && `\n${carried.section}`) || "";
  const text = `${commentText(lines, rows, headSha)}${carriedText}`;
  const cap = capProblem("handoff", text, "the handoff comment");
  return cap === null ? { text } : { errors: [cap] };
}

export { build };
