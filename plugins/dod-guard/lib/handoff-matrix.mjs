// Reads the acceptance matrix of a next-ticket implementation handoff. The
// matrix is one JSON value in a fenced json block under `## Acceptance matrix`,
// not a markdown table: the post-push proof and the handoff comment must agree
// on one matrix, and a table beside a block would be two copies that drift
// apart. A table-only matrix is therefore reported as a missing block.
//
// Two shapes are read. handoff-build.mjs writes an object { headSha, rows }:
// the head is stated once, and each row holds only what the work observed (id,
// contract, status, observed, and reason or carryForward when they apply).
// The issue body's planned matrix owns the rest of each row, and
// joinPlannedRows puts it back by row id. Handoffs posted before 2026-11-27
// hold the older shape, a JSON array of full rows that each copied the planned
// fields and the head; such rows are read as they are and joined to nothing.
// Every function is pure; fetching the handoff comment belongs to the callers.
import { lines, markdownSection, markedLines } from "./acceptance-criteria.mjs";
import { DIFF_CHECK } from "./carry-forward-record.mjs";
import { isPlainObject } from "./handoff-values.mjs";
import { jsonBlock } from "./record-readers.mjs";

const MATRIX_HEADING = "## Acceptance matrix";
const ROW_FIELDS = new Set(["id", "contract", "status", "observed", "reason", "carryForward"]);
const CARRY_FIELDS = new Set(["fromHead", "paths"]);
// The fields a full row takes from its planned row, in the order a full row lists them.
const PLANNED_FIELDS = ["path", "proof", "expected"];

// A second heading would be a second matrix, and the proof would read only the
// first, so two headings are refused instead of one being silently ignored.
function matrixHeadingCount(text) {
  return markedLines(text).filter((line) => !line.fenced && line.text.trimEnd() === MATRIX_HEADING).length;
}

function rowLabel(row, at) {
  return typeof row?.id === "string" ? `row ${row.id}` : `row ${at + 1}`;
}

function carryProblems(label, carry) {
  if (carry === undefined) {
    return [];
  }
  if (!isPlainObject(carry)) {
    return [`acceptance matrix ${label} carryForward is not an object of fromHead and paths`];
  }
  return Object.keys(carry)
    .filter((key) => !CARRY_FIELDS.has(key))
    .map((key) => `acceptance matrix ${label} carryForward holds ${key}, which is not fromHead or paths`);
}

// A field outside ROW_FIELDS is a copy of the planned row or of the head, which
// the compact shape states once, so it is refused rather than read.
function compactRowProblems(row, at) {
  const label = rowLabel(row, at);
  if (!isPlainObject(row)) {
    return [`acceptance matrix ${label} is not an object`];
  }
  const foreign = Object.keys(row)
    .filter((key) => !ROW_FIELDS.has(key))
    .map((key) => `acceptance matrix ${label} holds ${key}, which the issue body or the matrix head owns`);
  const unnamed = typeof row.id === "string" && row.id !== "" ? [] : [`acceptance matrix ${label} needs an id`];
  return [...unnamed, ...foreign, ...carryProblems(label, row.carryForward)];
}

function compactProblems(value) {
  const problems = Object.keys(value)
    .filter((key) => key !== "headSha" && key !== "rows")
    .map((key) => `acceptance matrix holds ${key}, which is not headSha or rows`);
  if (typeof value.headSha !== "string" || value.headSha.trim() === "") {
    problems.push("acceptance matrix needs a headSha");
  }
  if (!Array.isArray(value.rows)) {
    problems.push("acceptance matrix rows is not a JSON array");
    return problems;
  }
  return [...problems, ...value.rows.flatMap(compactRowProblems)];
}

// The carry record a full row holds: the matrix head is its new head, and the
// builder writes a carry only after its diff check passed.
function fullCarry(carry, headSha) {
  return { baseHead: carry.fromHead, newHead: headSha, paths: carry.paths, diffCheck: DIFF_CHECK };
}

function stampedRow(row, headSha) {
  const { carryForward, ...rest } = row;
  const stamped = { ...rest, headSha };
  if (carryForward !== undefined) {
    stamped.carryForward = fullCarry(carryForward, headSha);
  }
  return stamped;
}

// Returns { rows, headSha, compact } with the matrix rows, else { error } naming
// what is wrong. Rows of the compact shape carry the matrix head, so callers that
// only read ids, statuses and heads treat both shapes alike.
function readHandoffMatrix(text) {
  if (matrixHeadingCount(text) > 1) {
    return { error: `handoff has more than one ${MATRIX_HEADING} section` };
  }
  const section = markdownSection(lines(text), "Acceptance matrix");
  if (section === "") {
    return { error: `handoff has no ${MATRIX_HEADING} section` };
  }
  const block = jsonBlock(section);
  if (block.error) {
    return { error: `acceptance matrix ${block.error}` };
  }
  if (Array.isArray(block.value)) {
    return { rows: block.value, headSha: block.value[0]?.headSha, compact: false };
  }
  if (!isPlainObject(block.value)) {
    return { error: "acceptance matrix is not a JSON object of headSha and rows" };
  }
  const problems = compactProblems(block.value);
  if (problems.length > 0) {
    return { error: problems.join("; ") };
  }
  const { headSha, rows } = block.value;
  return { rows: rows.map((row) => stampedRow(row, headSha)), headSha, compact: true };
}

// The full row in the order the older shape wrote it, with the planned fields
// taken from the issue body.
function joinedRow(row, planned) {
  const joined = { id: row.id, contract: row.contract };
  for (const field of PLANNED_FIELDS) {
    joined[field] = planned[field];
  }
  Object.assign(joined, { observed: row.observed, status: row.status, evidence: planned.evidence });
  joined.headSha = row.headSha;
  if (Object.hasOwn(row, "carryForward")) {
    joined.carryForward = row.carryForward;
  }
  if (Object.hasOwn(row, "reason")) {
    joined.reason = row.reason;
  }
  return joined;
}

function rowProblems(row, planned, seen) {
  if (seen.has(row.id)) {
    return [`acceptance matrix row ${row.id} appears more than once`];
  }
  seen.add(row.id);
  if (planned === undefined) {
    return [`acceptance matrix row ${row.id} matches no planned row in the issue body`];
  }
  if (row.contract !== planned.contract) {
    const named = JSON.stringify(row.contract ?? null);
    return [`acceptance matrix row ${row.id} names contract ${named}, but its planned row names ${planned.contract}`];
  }
  return [];
}

// Returns { rows, problems }. A compact matrix's rows are joined by id to the
// planned rows; each row with no planned row, each planned row with no row, a
// repeated row and a contract that disagrees is one problem, and such a row is
// passed on as read. The older shape already holds its planned fields, so its
// rows are returned unchanged with no problems.
function joinPlannedRows(read, plannedRows) {
  if (!read.compact) {
    return { rows: read.rows, problems: [] };
  }
  const planned = Array.isArray(plannedRows) ? plannedRows : [];
  const byId = new Map(planned.map((row) => [row.id, row]));
  const seen = new Set();
  const problems = read.rows.flatMap((row) => rowProblems(row, byId.get(row.id), seen));
  for (const row of planned) {
    if (!seen.has(row.id)) {
      problems.push(`planned row ${row.id} has no acceptance matrix row`);
    }
  }
  const rows = read.rows.map((row) => {
    const plannedRow = byId.get(row.id);
    return plannedRow === undefined ? row : joinedRow(row, plannedRow);
  });
  return { rows, problems };
}

export { joinPlannedRows, readHandoffMatrix };
