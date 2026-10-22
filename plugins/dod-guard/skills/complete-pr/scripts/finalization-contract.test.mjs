import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStructuredFinalization } from "./finalization-gate.mjs";
import { validConvergenceInput } from "./fixtures/convergence-input.mjs";

test("finalization gate blocks stale or unmapped user-path evidence", () => {
  const valid = evaluateStructuredFinalization(validConvergenceInput());
  assert.equal(valid.nextStep, "project-status.mjs");

  const missingUserPath = validConvergenceInput();
  missingUserPath.acceptanceMatrix = missingUserPath.acceptanceMatrix.filter((row) => row.path !== "browser/e2e");
  const missingUserPathResult = evaluateStructuredFinalization(missingUserPath);
  assert.equal(missingUserPathResult.nextStep, "stop");
  assert.ok(missingUserPathResult.remainder.some((entry) => entry.includes("browser/e2e")));

  const staleEvidence = validConvergenceInput();
  staleEvidence.acceptanceMatrix = staleEvidence.acceptanceMatrix.map((row) => ({ ...row, headSha: "old-head" }));
  const staleEvidenceResult = evaluateStructuredFinalization(staleEvidence);
  assert.equal(staleEvidenceResult.nextStep, "stop");
  assert.ok(staleEvidenceResult.remainder.some((entry) => entry.includes("expected proof-head")));

  const staleLens = validConvergenceInput();
  staleLens.reviewLenses[0] = {
    ...staleLens.reviewLenses[0],
    headSha: "old-head",
  };
  const staleLensResult = evaluateStructuredFinalization(staleLens);
  assert.equal(staleLensResult.nextStep, "stop");
  assert.ok(staleLensResult.remainder.some((entry) => entry.includes("not bound to handoff head proof-head")));

  const staleReferencedRow = validConvergenceInput();
  staleReferencedRow.acceptanceMatrix[0] = {
    ...staleReferencedRow.acceptanceMatrix[0],
    headSha: "old-head",
  };
  const staleReferencedRowResult = evaluateStructuredFinalization(staleReferencedRow);
  assert.equal(staleReferencedRowResult.nextStep, "stop");
  assert.ok(
    staleReferencedRowResult.remainder.some((entry) =>
      entry.includes("implementation review lens acceptance evidence matrix-evidence-1 is bound to old-head"),
    ),
  );

  const missingHead = validConvergenceInput();
  delete missingHead.headSha;
  const missingHeadResult = evaluateStructuredFinalization(missingHead);
  assert.equal(missingHeadResult.nextStep, "stop");
  assert.ok(missingHeadResult.remainder.some((entry) => entry.includes("exact pushed head")));

  const unmappedUserPath = validConvergenceInput();
  unmappedUserPath.reviewLenses = unmappedUserPath.reviewLenses.map((lens) =>
    lens.id === "wiring/usability" ? { ...lens, evidence: "missing-user-path-proof" } : lens,
  );
  const unmappedUserPathResult = evaluateStructuredFinalization(unmappedUserPath);
  assert.equal(unmappedUserPathResult.nextStep, "stop");
  assert.ok(
    unmappedUserPathResult.remainder.some((entry) =>
      entry.includes("references undeclared evidence missing-user-path-proof"),
    ),
  );

  const missingLensMatrixEvidence = validConvergenceInput();
  delete missingLensMatrixEvidence.reviewLenses[0].acceptanceEvidence;
  const missingLensMatrixEvidenceResult = evaluateStructuredFinalization(missingLensMatrixEvidence);
  assert.equal(missingLensMatrixEvidenceResult.nextStep, "stop");
  assert.ok(
    missingLensMatrixEvidenceResult.remainder.some((entry) =>
      entry.includes("implementation review lens needs acceptance and verification evidence"),
    ),
  );

  const unmappedLensAcceptance = validConvergenceInput();
  unmappedLensAcceptance.reviewLenses[0] = {
    ...unmappedLensAcceptance.reviewLenses[0],
    acceptanceEvidence: "unmapped-acceptance-proof",
  };
  const unmappedLensAcceptanceResult = evaluateStructuredFinalization(unmappedLensAcceptance);
  assert.equal(unmappedLensAcceptanceResult.nextStep, "stop");
  assert.ok(
    unmappedLensAcceptanceResult.remainder.some((entry) =>
      entry.includes("references undeclared acceptance evidence unmapped-acceptance-proof"),
    ),
  );

  const missingOwnerEvidence = validConvergenceInput();
  delete missingOwnerEvidence.tasks[0].verificationEvidence;
  const missingOwnerEvidenceResult = evaluateStructuredFinalization(missingOwnerEvidence);
  assert.equal(missingOwnerEvidenceResult.nextStep, "stop");
  assert.ok(
    missingOwnerEvidenceResult.remainder.some((entry) =>
      entry.includes("implementation owner task needs mapped verification evidence"),
    ),
  );

  const crossWiredEvidence = validConvergenceInput();
  crossWiredEvidence.reviewLenses[0] = {
    ...crossWiredEvidence.reviewLenses[0],
    acceptanceEvidence: crossWiredEvidence.acceptanceMatrix[1].evidence,
    verificationEvidence: crossWiredEvidence.acceptanceMatrix[0].proof,
  };
  crossWiredEvidence.tasks[0].acceptanceEvidence[0] = crossWiredEvidence.acceptanceMatrix[1].evidence;
  crossWiredEvidence.tasks[0].verificationEvidence[0] = crossWiredEvidence.acceptanceMatrix[0].proof;
  const crossWiredResult = evaluateStructuredFinalization(crossWiredEvidence);
  assert.equal(crossWiredResult.nextStep, "stop");
  assert.ok(crossWiredResult.remainder.some((entry) => entry.includes("must share one acceptance-matrix row")));

  const missingOwner = validConvergenceInput();
  missingOwner.reviewLenses[0].owner = "missing-task";
  const missingOwnerResult = evaluateStructuredFinalization(missingOwner);
  assert.equal(missingOwnerResult.nextStep, "stop");
  assert.ok(missingOwnerResult.remainder.some((entry) => entry.includes("references missing owner missing-task")));

  const unmappedSlice = validConvergenceInput();
  unmappedSlice.tasks[0].child = "missing-flow";
  const unmappedSliceResult = evaluateStructuredFinalization(unmappedSlice);
  assert.equal(unmappedSliceResult.nextStep, "stop");
  assert.ok(
    unmappedSliceResult.remainder.some((entry) => entry.includes("references missing functional slice missing-flow")),
  );
});

test("finalization gate returns an actionable remainder for malformed handoff input", () => {
  const result = evaluateStructuredFinalization(null);

  assert.equal(result.outcome, "actionable remainder");
  assert.deepEqual(result.remainder, ["finalization handoff must be an object"]);
  assert.equal(result.nextStep, "stop");
});

test("finalization gate rejects the ordinary delivery bypass", () => {
  const result = evaluateStructuredFinalization({ path: "ordinary" });

  assert.equal(result.outcome, "actionable remainder");
  assert.equal(result.nextStep, "stop");
  assert.ok(result.remainder.some((entry) => entry.includes("ordinary delivery path")));
});
