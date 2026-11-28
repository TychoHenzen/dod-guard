import assert from "node:assert/strict";
import test from "node:test";
import { ACCEPTANCE_MATRIX_PATHS, validateAcceptanceMatrix } from "./acceptance-matrix.mjs";
import { joinPlannedRows, readHandoffMatrix } from "./handoff-matrix.mjs";

const HEAD_SHA = "abc1234";
const ISSUE = 1055;
const OTHER_ISSUE = 1206;
const ACCEPTS = "row-1 acceptsResiduals must be true when present";
const NOT_ISSUES = "row-1 deferredTo must be a non-empty list of issue numbers";
const NOT_PASS = "row-1 defers residuals, so its status must be pass";
const NOT_ACCEPTED = "row-1 defers residuals, but its planned row does not accept them";

function rows(status, first = {}) {
  return ACCEPTANCE_MATRIX_PATHS.map((path, index) => {
    const n = index + 1;
    const row = {
      id: `row-${n}`,
      contract: `AC-${n}`,
      path,
      proof: `proof-${n}`,
      expected: `expected-${n}`,
      observed: `observed-${n}`,
      status,
      evidence: `ev-${n}`,
      headSha: HEAD_SHA,
    };
    if (n === 1) {
      return { ...row, ...first };
    }
    return row;
  });
}

function observed(first) {
  return validateAcceptanceMatrix({ matrix: rows("pass", first), headSha: HEAD_SHA }).errors;
}

function planned(first) {
  return validateAcceptanceMatrix({ matrix: rows("pending", first), mode: "planned" }).errors;
}

test("a planned row may accept residuals", () => {
  assert.deepEqual(planned({ acceptsResiduals: true }), []);
});

test("a planned row's acceptsResiduals must be true when present", () => {
  for (const value of ["yes", false, 1]) {
    assert.deepEqual(planned({ acceptsResiduals: value }), [ACCEPTS]);
  }
});

test("a passing row may defer residuals its planned row accepts", () => {
  assert.deepEqual(observed({ acceptsResiduals: true, deferredTo: [ISSUE, OTHER_ISSUE] }), []);
});

test("a row may not defer residuals its planned row does not accept", () => {
  assert.deepEqual(observed({ deferredTo: [ISSUE] }), [NOT_ACCEPTED]);
});

test("an inapplicable row may not defer residuals", () => {
  const row = { acceptsResiduals: true, deferredTo: [ISSUE], status: "inapplicable", reason: "none" };
  assert.deepEqual(observed(row), [NOT_PASS]);
});

test("a failed row may not defer residuals and still fails", () => {
  const row = { acceptsResiduals: true, deferredTo: [ISSUE], status: "failed" };
  assert.deepEqual(observed(row), [NOT_PASS, "row-1 has non-passing status failed"]);
});

test("deferredTo must be a non-empty list of positive integer issue numbers", () => {
  for (const value of [[], ["1055"], [0], [-3], [1.5], "1055", null]) {
    assert.deepEqual(observed({ acceptsResiduals: true, deferredTo: value }), [NOT_ISSUES]);
  }
});

test("a compact row's deferredTo and its planned row's acceptsResiduals survive the join", () => {
  const matrix = {
    headSha: HEAD_SHA,
    rows: [{ id: "R1", contract: "AC-1", status: "pass", observed: "x", deferredTo: [ISSUE] }],
  };
  const text = ["## Acceptance matrix", "", "```json", JSON.stringify(matrix), "```", ""].join("\n");
  const plannedRows = [
    {
      id: "R1",
      contract: "AC-1",
      path: "scan",
      proof: "p",
      expected: "e",
      evidence: "ev",
      status: "pending",
      acceptsResiduals: true,
    },
  ];

  const read = readHandoffMatrix(text);
  assert.equal(read.error, undefined);
  const { rows: joined, problems } = joinPlannedRows(read, plannedRows);

  assert.deepEqual(problems, []);
  assert.deepEqual(joined[0].deferredTo, [ISSUE]);
  assert.equal(joined[0].acceptsResiduals, true);
  assert.deepEqual(Object.keys(joined[0]).slice(-2), ["deferredTo", "acceptsResiduals"]);
});
