// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import test from "node:test";
import { carryForwardErrors, DIFF_CHECK } from "./carry-forward-record.mjs";

const HEAD = "abc12345";
const BASE = "def56789";
const LABEL = "row R1";

function wellFormed(overrides = {}) {
  return {
    baseHead: BASE,
    newHead: HEAD,
    paths: ["src/a.mjs"],
    diffCheck: DIFF_CHECK,
    ...overrides,
  };
}

function rowWith(carryForward) {
  return { id: "R1", headSha: HEAD, carryForward };
}

test("accepts a well formed record", () => {
  assert.deepEqual(carryForwardErrors(rowWith(wellFormed()), LABEL), []);
});

test("accepts a row without the record", () => {
  assert.deepEqual(carryForwardErrors({ id: "R1", headSha: HEAD }, LABEL), []);
});

test("rejects a record without a text baseHead", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ baseHead: "  " })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward baseHead is not a commit sha"]);
});

test("rejects a baseHead that is a branch name", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ baseHead: "main" })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward baseHead is not a commit sha"]);
});

test("rejects a different-case copy of the row head", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ baseHead: HEAD.toUpperCase() })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward baseHead equals the row head"]);
});

test("rejects a whitespace-padded copy of the row head", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ baseHead: ` ${HEAD}\n` })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward baseHead equals the row head"]);
});

test("rejects a record with an extra key", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ note: "hand edited" })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward field note is not part of the record"]);
});

test("rejects a record whose baseHead equals the row head", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ baseHead: HEAD })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward baseHead equals the row head"]);
});

test("rejects a record whose newHead is not the row head", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ newHead: BASE })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward newHead is not the row head"]);
});

test("rejects a record with an empty paths list", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ paths: [] })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward needs a non-empty paths list"]);
});

test("rejects a record with a wrong diffCheck", () => {
  const errors = carryForwardErrors(rowWith(wellFormed({ diffCheck: "full" })), LABEL);
  assert.deepEqual(errors, ["row R1 carryForward diffCheck is not whitespace-comment-only"]);
});

test("rejects a record that is not an object", () => {
  assert.deepEqual(carryForwardErrors(rowWith("whitespace-comment-only"), LABEL), [
    "row R1 carryForward is not an object",
  ]);
});
