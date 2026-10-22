// The checks handoff-build.mjs runs on the evidence file, which supplies only
// what was observed: tasks[] of { id, commit, files[], result } and rows{} keyed
// by row id of { observed, status, reason? }. Every planned task and row needs
// exactly one entry, and no entry may name a task or row the body does not plan
// or carry another field. Each check returns one message per problem.
import { ACCEPTANCE_MATRIX_STATUSES } from "../../../lib/acceptance-matrix.mjs";

const STATUSES = new Set(ACCEPTANCE_MATRIX_STATUSES);
const ROW_FIELDS = new Set(["observed", "status", "reason"]);
const TASK_FIELDS = new Set(["id", "commit", "files", "result"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

// ASSUMPTION: an entry that is not a JSON object counts as missing, since the
// plan names no error for it and reading its fields would throw.
function hasEntry(rows, id) {
  return Object.hasOwn(rows, id) && isPlainObject(rows[id]);
}

function foreignFieldProblems(label, entry, allowed) {
  return Object.keys(entry)
    .filter((key) => !allowed.has(key))
    .map((key) => `${label} entry field ${key} comes from the plan, not the evidence file`);
}

function rowProblems(id, entry) {
  const problems = foreignFieldProblems(`row ${id}`, entry, ROW_FIELDS);
  if (!isText(entry.observed)) {
    problems.push(`row ${id} entry needs a non-empty observed`);
  }
  if (!STATUSES.has(entry.status)) {
    problems.push(`row ${id} entry status must be one of ${[...STATUSES].join(", ")}`);
  }
  if (Object.hasOwn(entry, "reason") && !isText(entry.reason)) {
    problems.push(`row ${id} entry reason must be non-empty text`);
  }
  return problems;
}

function hasFiles(entry) {
  return Array.isArray(entry.files) && entry.files.length > 0 && entry.files.every(isText);
}

function taskEntryProblems(entry) {
  const problems = foreignFieldProblems(`task ${entry.id}`, entry, TASK_FIELDS);
  if (!isText(entry.commit)) {
    problems.push(`task ${entry.id} entry needs a commit`);
  }
  if (!hasFiles(entry)) {
    problems.push(`task ${entry.id} entry needs a non-empty files list`);
  }
  if (!isText(entry.result)) {
    problems.push(`task ${entry.id} entry needs a result`);
  }
  return problems;
}

// One message per extra copy, so an id that appears three times is named twice.
function duplicateIdProblems(entryIds) {
  const seen = new Set();
  const problems = [];
  for (const id of entryIds) {
    if (seen.has(id)) {
      problems.push(`task entry ${id} appears more than once`);
    }
    seen.add(id);
  }
  return problems;
}

function taskProblems(planned, entries) {
  const plannedIds = new Set(planned.map((task) => task.id));
  const entryIds = entries.map((entry) => entry?.id);
  return [
    ...planned.filter((task) => !entryIds.includes(task.id)).map((task) => `task ${task.id} has no evidence entry`),
    ...entryIds.filter((id) => !plannedIds.has(id)).map((id) => `task entry ${id} matches no planned task`),
    ...duplicateIdProblems(entryIds.filter((id) => plannedIds.has(id))),
    ...entries.filter((entry) => isPlainObject(entry) && plannedIds.has(entry.id)).flatMap(taskEntryProblems),
  ];
}

function rowSetProblems(planned, rows) {
  const plannedIds = new Set(planned.map((row) => row.id));
  return [
    ...planned.filter((row) => !hasEntry(rows, row.id)).map((row) => `row ${row.id} has no evidence entry`),
    ...Object.keys(rows)
      .filter((key) => !plannedIds.has(key))
      .map((key) => `evidence entry ${key} matches no planned row`),
    ...planned.filter((row) => hasEntry(rows, row.id)).flatMap((row) => rowProblems(row.id, rows[row.id])),
  ];
}

export { isPlainObject, rowSetProblems, taskProblems };
