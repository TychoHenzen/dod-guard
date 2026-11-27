import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyLimitProblems, HANDOFF_LIMITS, lineProblem } from "./handoff-limits.mjs";

const ids = (prefix, count) => Array.from({ length: count }, (_, at) => ({ id: `${prefix}${at}`, contract: "AC-1" }));

test("passes a body at its limits", () => {
  const input = { tasks: ids("T", HANDOFF_LIMITS.tasks), plannedAcceptanceMatrix: ids("R", HANDOFF_LIMITS.rows) };
  assert.deepEqual(bodyLimitProblems(input), []);
  assert.equal(lineProblem("a line", "x".repeat(10), 10), null);
});

test("names each count and id over its limit, and asks for a split, not a cut", () => {
  const long = "x".repeat(HANDOFF_LIMITS.id + 1);
  const input = {
    tasks: [...ids("T", HANDOFF_LIMITS.tasks), { id: long }],
    plannedAcceptanceMatrix: [...ids("R", HANDOFF_LIMITS.rows), { id: "R99", contract: long }],
  };
  assert.deepEqual(bodyLimitProblems(input), [
    "task-list has 13 entries, over the 12 the handoff holds; split the PBI",
    "planned-acceptance-matrix has 17 entries, over the 16 the handoff holds; split the PBI",
    `task id ${long} is longer than 16 characters`,
    `planned row contract ${long} is longer than 16 characters`,
  ]);
  assert.equal(
    lineProblem("a line", "x".repeat(11), 10),
    "a line is 11 characters, over the 10-character limit; write it shorter, do not cut it off",
  );
});

test("reads a body without its records as no problem, leaving that to the record checks", () => {
  assert.deepEqual(bodyLimitProblems({}), []);
});
