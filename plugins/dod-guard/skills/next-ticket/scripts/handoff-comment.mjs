// Builds the handoff comment text for handoff-build.mjs. Identity comes from the
// issue body, never from the evidence file: each matrix row's id, contract, path,
// proof, expected and evidence ids come from the planned acceptance matrix, and
// each task bullet's id, functional slice and evidence ids come from the task
// list. The evidence entry owns only what was observed.
// A previous handoff's ## Preflight checkpoint section is copied through, so a rebuild never drops it.

import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { checkpointSection } from "../../../lib/preflight-checkpoint.mjs";
import { carryProblems, carryRecord, refuseCarry } from "./handoff-carry.mjs";
import { commentText, taskBullet } from "./handoff-comment-text.mjs";
import { rowSetProblems, taskProblems } from "./handoff-evidence-problems.mjs";

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
