// The checks handoff-build.mjs runs on the evidence file, which supplies only
// what was observed: tasks[] of { id, commit, result } and rows{} keyed
// by row id of { observed, status, reason?, carryForward? } where carryForward is
// { fromHead, paths } (handoff-build.mjs --root checks it). Every planned task and row needs
// exactly one entry, and no entry may name a task or row the body does not plan
// or carry another field. Each check returns one message per problem.

import { isPlainObject, isText } from "../../../lib/handoff-values.mjs";
import { ACCEPTANCE_MATRIX_STATUSES } from "../../../lib/matrix-observed-status.mjs";
import { carryEntryProblems } from "./handoff-carry-shape.mjs";

const STATUSES = new Set(ACCEPTANCE_MATRIX_STATUSES);
const ROW_FIELDS = new Set(["observed", "status", "reason", "carryForward"]);
const TASK_FIELDS = new Set(["id", "commit", "result"]);
// ASSUMPTION: a task proven by remote state alone has no commit, so it writes
// "none" and its result names the state; any other commit is a git sha.
const COMMIT = /^(?:[0-9a-f]{7,40}|none)$/;
// Fields an older handoff line held that the evidence file no longer takes, with the reason.
const RETIRED_TASK_FIELDS = Object.freeze({ files: "the commit names its files" });

// ASSUMPTION: an entry that is not a JSON object counts as missing, since the
// plan names no error for it and reading its fields would throw.
function hasEntry(rows, id) {
  return Object.hasOwn(rows, id) && isPlainObject(rows[id]);
}

function foreignFieldProblems(label, entry, allowed, retired = {}) {
  return Object.keys(entry)
    .filter((key) => !allowed.has(key))
    .map((key) =>
      Object.hasOwn(retired, key)
        ? `${label} entry field ${key} is no longer part of the handoff: ${retired[key]}`
        : `${label} entry field ${key} comes from the plan, not the evidence file`,
    );
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
  problems.push(...carryEntryProblems(id, entry));
  return problems;
}

function taskEntryProblems(entry) {
  const problems = foreignFieldProblems(`task ${entry.id}`, entry, TASK_FIELDS, RETIRED_TASK_FIELDS);
  if (!COMMIT.test(String(entry.commit ?? ""))) {
    problems.push(`task ${entry.id} entry commit must be a git sha of 7 to 40 hex digits, or none`);
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

export { rowSetProblems, taskProblems };
