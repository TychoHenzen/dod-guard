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
  assert.ok(result.errors.some((error) => error.includes("missing passing acceptance row for AC-missing")));
});

test("requires an independently fetched head instead of trusting matrix-owned metadata", () => {
  const result = validateAcceptanceMatrix({
    matrix: { headSha: HEAD_SHA, rows: completeRows() },
  });

  assert.equal(result.valid, false);
  assert.equal(result.headSha, null);
  assert.ok(result.errors.includes("acceptance matrix needs an independently fetched current pushed head SHA"));
});

test("requires distinct rows for mandatory path categories", () => {
  const result = validateAcceptanceMatrix({
    matrix: [row("identity, interactive control, browser/e2e, data/error, recovery", 1)],
    headSha: HEAD_SHA,
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.filter((error) => error.startsWith("missing acceptance row for ")).length,
    ACCEPTANCE_MATRIX_PATHS.length - 1,
  );
});

test("requires a passing row for every acceptance contract", () => {
  const matrix = completeRows().map((entry, index) =>
    index === 0
      ? { ...entry, status: "inapplicable", reason: "No separate identity surface exists." }
      : entry,
  );
  const result = validateAcceptanceMatrix({
    matrix,
    headSha: HEAD_SHA,
    requiredContracts: ["AC-1"],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("missing passing acceptance row for AC-1"));
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

// A refinement row: no observed result and no head yet, status pending.
function plannedRow(path, index, overrides = {}) {
  const { observed, headSha, ...planned } = row(path, index, { status: "pending" });
  return { ...planned, ...overrides };
}

function plannedRows() {
  return ACCEPTANCE_MATRIX_PATHS.map((path, index) => plannedRow(path, index + 1));
}

function validatePlanned(matrix, requiredContracts = ["AC-1"]) {
  return validateAcceptanceMatrix({ matrix, requiredContracts, mode: "planned" });
}

test("planned mode accepts pending rows with no observed result or head", () => {
  const matrix = plannedRows().map((entry, index) =>
    index === 2 ? { ...entry, status: "inapplicable", reason: "No browser surface exists." } : entry,
  );

  const result = validatePlanned(matrix);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.headSha, null);
});

test("planned mode rejects every status that is not a planned status", () => {
  for (const status of ["pass", "failed", "blocked", "unverified"]) {
    const matrix = plannedRows().map((entry) => (entry.path === "recovery" ? { ...entry, status } : entry));

    assert.deepEqual(validatePlanned(matrix).errors, [`row-5 has status ${status}, which is not a planned status`]);
  }
  const unknown = plannedRows().map((entry) => (entry.path === "recovery" ? { ...entry, status: "done" } : entry));
  assert.deepEqual(validatePlanned(unknown).errors, ["row-5 has unsupported status done"]);
});

test("planned mode names a missing path, criterion, field, and inapplicable reason", () => {
  const withoutRecovery = plannedRows().filter((entry) => entry.path !== "recovery");
  assert.deepEqual(validatePlanned(withoutRecovery).errors, ["missing acceptance row for recovery"]);

  assert.deepEqual(validatePlanned(plannedRows(), ["AC-1", "AC-2"]).errors, [
    "missing pending acceptance row for AC-2",
  ]);

  const { proof, ...withoutProof } = plannedRows()[0];
  assert.deepEqual(validatePlanned([withoutProof, ...plannedRows().slice(1)]).errors, ["row-1 is missing proof"]);

  const noReason = plannedRows().map((entry, index) => (index === 2 ? { ...entry, status: "inapplicable" } : entry));
  assert.deepEqual(validatePlanned(noReason).errors, ["row-3 marked inapplicable without an explicit reason"]);
});

test("planned mode needs a pending row for each criterion, not only an inapplicable one", () => {
  const matrix = plannedRows().map((entry, index) =>
    index === 0 ? { ...entry, status: "inapplicable", reason: "No identity surface exists." } : entry,
  );

  assert.deepEqual(validatePlanned(matrix).errors, ["missing pending acceptance row for AC-1"]);
});

test("observed mode still rejects a pending row and stays the default", () => {
  const matrix = completeRows().map((entry) => (entry.path === "recovery" ? { ...entry, status: "pending" } : entry));
  const result = validateAcceptanceMatrix({ matrix, headSha: HEAD_SHA });

  assert.ok(result.errors.includes("row-5 has unsupported status pending"));
  assert.ok(result.errors.includes("row-5 has non-passing status pending"));
  assert.throws(() => validateAcceptanceMatrix({ matrix, mode: "draft" }), /unknown acceptance matrix mode draft/);
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
