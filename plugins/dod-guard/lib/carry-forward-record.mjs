// A carryForward record on an observed acceptance row says the row's proof was
// carried from baseHead to the row head, and that the diff between them touched
// only whitespace and comments. The record is optional; when present, each check
// below must hold, and each failing check yields one message.
const DIFF_CHECK = "whitespace-comment-only";
const NOT_OBJECT_MESSAGE = "carryForward is not an object";

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

// Each check takes the record and the row it sits on, and holds when the record is valid.
const CHECKS = Object.freeze([
  { holds: (record) => isText(record.baseHead), message: "carryForward needs a baseHead" },
  {
    holds: (record, row) => record.baseHead !== row.headSha,
    message: "carryForward baseHead equals the row head",
  },
  { holds: (record, row) => record.newHead === row.headSha, message: "carryForward newHead is not the row head" },
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
  return CHECKS.filter((check) => !check.holds(record, row)).map((check) => `${label} ${check.message}`);
}

export { carryForwardErrors, DIFF_CHECK };
