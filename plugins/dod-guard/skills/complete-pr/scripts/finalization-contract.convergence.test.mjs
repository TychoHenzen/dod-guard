import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConvergence, scenarioResult } from "../../next-ticket/scripts/structured-workflow-proof.mjs";
import { validConvergenceInput } from "./fixtures/convergence-input.mjs";

test("finalization relies on executable functional convergence proof", () => {
  assert.equal(scenarioResult("passing").outcome, "verified");
  const passing = evaluateConvergence(validConvergenceInput());
  assert.equal(passing.outcome, "verified");
  const resultInput = validConvergenceInput();
  resultInput.tasks[0].child = "missing-flow";
  resultInput.children[0].id = "implemented-flow";
  const result = evaluateConvergence(resultInput);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("missing functional slice")));
  assert.ok(result.remainder.some((entry) => entry.includes("implemented-flow slice needs an owning task")));
  assert.ok(!result.remainder.some((entry) => entry.includes("review lens")));

  const missingLensInput = validConvergenceInput();
  missingLensInput.reviewLenses = missingLensInput.reviewLenses.slice(0, 1);
  const missingLens = evaluateConvergence(missingLensInput);
  assert.equal(missingLens.outcome, "actionable remainder");
  assert.ok(missingLens.remainder.some((entry) => entry.includes("wiring/usability review lens needs an owning task")));

  const duplicateSliceInput = validConvergenceInput();
  duplicateSliceInput.tasks[1].child = "search-flow";
  duplicateSliceInput.tasks[1].evidence = "other-proof";
  const duplicateSlice = evaluateConvergence(duplicateSliceInput);

  assert.ok(
    duplicateSlice.remainder.some((entry) => entry.includes("search-flow slice has more than one owning task")),
  );
  assert.equal(duplicateSlice.outcome, "actionable remainder");

  const duplicateEvidenceInput = validConvergenceInput();
  duplicateEvidenceInput.tasks[1].evidence = duplicateEvidenceInput.tasks[0].evidence;
  const duplicateEvidence = evaluateConvergence(duplicateEvidenceInput);

  assert.ok(
    duplicateEvidence.remainder.some((entry) => entry.includes("evidence commit-proof is mapped more than once")),
  );
  assert.equal(duplicateEvidence.outcome, "actionable remainder");
});

test("convergence rejects orphaned acceptance-matrix evidence", () => {
  const orphaned = validConvergenceInput();
  orphaned.acceptanceMatrix.push({
    id: "AC-1-orphan",
    contract: "AC-1",
    path: "quality-extra",
    proof: "matrix-proof-orphan",
    expected: "pass",
    observed: "pass",
    status: "pass",
    evidence: "matrix-evidence-orphan",
    headSha: "proof-head",
  });
  const result = evaluateConvergence(orphaned);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("matrix-evidence-orphan is not owned")));
  assert.ok(result.remainder.some((entry) => entry.includes("matrix-proof-orphan is not owned")));
});
