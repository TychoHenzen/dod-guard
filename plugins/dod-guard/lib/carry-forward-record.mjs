// A carryForward record on an observed acceptance row says the row's proof was
// carried from baseHead to the row head, and that the diff between them touched
// only whitespace and comments. The record is optional; when present, each check
// below must hold, and each failing check yields one message.
import { isPlainObject, isTextList } from "./handoff-values.mjs";

const DIFF_CHECK = "whitespace-comment-only";
const NOT_OBJECT_MESSAGE = "carryForward is not an object";
const RECORD_FIELDS = new Set(["baseHead", "newHead", "paths", "diffCheck"]);
const COMMIT_SHA = /^[0-9a-f]{7,64}$/;

// Equivalent spellings of one commit (case, surrounding whitespace) compare equal.
function spelled(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

// Each check takes the record and the row it sits on, and holds when the record is valid.
const CHECKS = Object.freeze([
  {
    holds: (record) => COMMIT_SHA.test(spelled(record.baseHead)),
    message: "carryForward baseHead is not a commit sha",
  },
  {
    holds: (record, row) => spelled(record.baseHead) !== spelled(row.headSha),
    message: "carryForward baseHead equals the row head",
  },
  {
    holds: (record, row) => spelled(record.newHead) === spelled(row.headSha),
    message: "carryForward newHead is not the row head",
  },
  { holds: (record) => isTextList(record.paths), message: "carryForward needs a non-empty paths list" },
  {
    holds: (record) => record.diffCheck === DIFF_CHECK,
    message: "carryForward diffCheck is not whitespace-comment-only",
  },
]);

function carryForwardErrors(row, label) {
  const record = row.carryForward;
  if (record === null || record === undefined) {
    return [];
  }
  if (!isPlainObject(record)) {
    return [`${label} ${NOT_OBJECT_MESSAGE}`];
  }
  const failed = CHECKS.filter((check) => !check.holds(record, row)).map((check) => check.message);
  const foreign = Object.keys(record)
    .filter((key) => !RECORD_FIELDS.has(key))
    .map((key) => `carryForward field ${key} is not part of the record`);
  return [...failed, ...foreign].map((message) => `${label} ${message}`);
}

export { COMMIT_SHA, carryForwardErrors, DIFF_CHECK };
