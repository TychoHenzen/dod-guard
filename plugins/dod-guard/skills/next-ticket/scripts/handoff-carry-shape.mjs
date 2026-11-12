// Shape checks on an evidence row's carryForward entry: an object of fromHead and
// paths, and nothing else. The revisions themselves are verified in handoff-carry.mjs.
import { isPlainObject, isText, isTextList } from "./handoff-values.mjs";

const CARRY_FIELDS = new Set(["fromHead", "paths"]);

function carryShapeProblems(label, carry) {
  const problems = Object.keys(carry)
    .filter((key) => !CARRY_FIELDS.has(key))
    .map((key) => `${label} field ${key} is not fromHead or paths`);
  if (!isText(carry.fromHead)) {
    problems.push(`${label} needs a fromHead`);
  }
  if (!isTextList(carry.paths)) {
    problems.push(`${label} needs a non-empty paths list`);
  }
  return problems;
}

// An evidence entry may declare that its row, observed at fromHead, still holds at the new head.
function carryEntryProblems(id, entry) {
  if (!Object.hasOwn(entry, "carryForward")) {
    return [];
  }
  const label = `row ${id} entry carryForward`;
  if (!isPlainObject(entry.carryForward)) {
    return [`${label} must be an object with fromHead and paths`];
  }
  return carryShapeProblems(label, entry.carryForward);
}

export { carryEntryProblems };
