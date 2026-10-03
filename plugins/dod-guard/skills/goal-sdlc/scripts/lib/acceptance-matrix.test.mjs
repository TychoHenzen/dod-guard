import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTANCE_MATRIX_PATHS,
  ACCEPTANCE_MATRIX_STATUSES,
  validateAcceptanceMatrix,
} from "./acceptance-matrix.mjs";

const HEAD_SHA = "abc1234";

function row(path, index, overrides = {}) {
  return {
    id: `row-${index}`,
    contract: index === 1 ? "AC-1" : `path-${index}`,
    path,
    proof: `proof-${index}`,
    expected: `expected-${index}`,
    observed: `observed-${index}`,
    status: "pass",
    evidence: `evidence-${index}`,
    headSha: HEAD_SHA,
    ...overrides,
  };
}

function completeRows() {
  return ACCEPTANCE_MATRIX_PATHS.map((path, index) => row(path, index + 1));
}

test("acceptance matrix accepts complete evidence for every required path and contract", () => {
  const result = validateAcceptanceMatrix({
    matrix: completeRows(),
    headSha: HEAD_SHA,
    requiredContracts: ["AC-1"],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
test("inapplicable paths require an explicit reason and remain valid", () => {
  const matrix = completeRows().map((entry, index) =>
    index === 2
      ? row(entry.path, index + 1, {
          status: "inapplicable",
          reason: "This command-line PBI has no browser or end-to-end surface.",
        })
      : entry,
  );

  const result = validateAcceptanceMatrix({ matrix, headSha: HEAD_SHA });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
test("missing, non-passing, and stale rows fail closed", () => {
  const matrix = completeRows()
    .filter((entry) => entry.path !== "recovery")
    .map((entry) => (entry.path === "data/error" ? { ...entry, status: "unverified" } : entry))
    .map((entry) => (entry.path === "browser/e2e" ? { ...entry, headSha: "old-head" } : entry));

  const result = validateAcceptanceMatrix({
    matrix,
    headSha: HEAD_SHA,
    requiredContracts: ["AC-1", "AC-missing"],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("non-passing status unverified")));
  assert.ok(result.errors.some((error) => error.includes("expected abc1234")));
  assert.ok(result.errors.some((error) => error.includes("missing acceptance row for recovery")));
  assert.ok(result.errors.some((error) => error.includes("missing acceptance row for AC-missing")));
});

test("failed and blocked statuses cannot masquerade as acceptance", () => {
  for (const status of ["failed", "blocked"]) {
    const result = validateAcceptanceMatrix({
      matrix: completeRows().map((entry) =>
        entry.path === "recovery" ? { ...entry, status } : entry,
      ),
      headSha: HEAD_SHA,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes(`non-passing status ${status}`)));
  }
});

test("matrix statuses stay behavior-oriented rather than numeric quality gates", () => {
  assert.deepEqual(ACCEPTANCE_MATRIX_STATUSES, [
    "pass",
    "unverified",
    "failed",
    "blocked",
    "inapplicable",
  ]);
  const result = validateAcceptanceMatrix({
    matrix: completeRows().map((entry) => ({ ...entry, coverage: 100 })),
    headSha: HEAD_SHA,
  });
  assert.equal(result.valid, true);
  assert.ok(result.rows.every((entry) => entry.status === "pass"));
});
