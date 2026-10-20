import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewLenses as buildReviewLenses,
  recordsWithRequiredKeys,
} from "../../next-ticket/scripts/convergence-builders.mjs";
import { acceptanceMatrix as buildAcceptanceMatrix } from "../../next-ticket/scripts/passing-matrix.mjs";
import {
  evaluateConvergence,
  REQUIRED_REVIEW_LENSES,
  scenarioResult,
} from "../../next-ticket/scripts/structured-workflow-proof.mjs";
import { evaluateStructuredFinalization } from "./finalization-gate.mjs";

const validConvergenceInput = () => {
  const reviewLenses = buildReviewLenses({ headSha: "proof-head", prefix: "matrix-" });
  const acceptanceMatrix = buildAcceptanceMatrix("proof-head", "AC-1", "matrix-");
  return {
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit-proof", ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
        acceptanceEvidence: acceptanceMatrix.map((row) => row.evidence),
        verificationEvidence: acceptanceMatrix.map((row) => row.proof),
      },
      {
        id: "task-2",
        child: "settings-flow",
        evidence: "settings-proof",
      },
    ],
    children: [
      { id: "search-flow", evidence: "slice-proof" },
      { id: "settings-flow", evidence: "settings-slice-proof" },
    ],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
    acceptanceMatrix,
    headSha: "proof-head",
  };
};

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

test("finalization gate binds cross-cutting lenses to their user paths", () => {
  const wrongWiringPath = validConvergenceInput();
  wrongWiringPath.reviewLenses = wrongWiringPath.reviewLenses.map((lens) =>
    lens.id === "wiring/usability"
      ? { ...lens, acceptanceEvidence: "matrix-evidence-1", verificationEvidence: "matrix-proof-1" }
      : lens,
  );
  const wrongWiringResult = evaluateStructuredFinalization(wrongWiringPath);
  assert.ok(
    wrongWiringResult.remainder.some((entry) =>
      entry.includes("wiring/usability review lens must cover required path(s)"),
    ),
  );

  const nearMatchPath = validConvergenceInput();
  nearMatchPath.acceptanceMatrix[2] = { ...nearMatchPath.acceptanceMatrix[2], path: "browser/e2e-fake" };
  const nearMatchResult = evaluateStructuredFinalization(nearMatchPath);
  assert.ok(
    nearMatchResult.remainder.some((entry) =>
      entry.includes("wiring/usability review lens must cover required path(s)"),
    ),
  );

  const inapplicableBrowser = validConvergenceInput();
  inapplicableBrowser.acceptanceMatrix[2] = {
    ...inapplicableBrowser.acceptanceMatrix[2],
    status: "inapplicable",
    reason: "The supported surface is a native command palette, not a browser UI.",
  };
  const inapplicableBrowserResult = evaluateStructuredFinalization(inapplicableBrowser);
  assert.equal(inapplicableBrowserResult.nextStep, "project-status.mjs");

  const reorderedEvidence = validConvergenceInput();
  reorderedEvidence.reviewLenses = reorderedEvidence.reviewLenses.map((lens) =>
    lens.id === "wiring/usability"
      ? {
          ...lens,
          acceptanceEvidence: ["matrix-evidence-3", "matrix-evidence-2"],
          verificationEvidence: ["matrix-proof-3", "matrix-proof-2"],
        }
      : lens,
  );
  const reorderedEvidenceResult = evaluateStructuredFinalization(reorderedEvidence);
  assert.equal(reorderedEvidenceResult.nextStep, "project-status.mjs");

  const reusedRow = validConvergenceInput();
  reusedRow.reviewLenses = reusedRow.reviewLenses.map((lens) =>
    lens.id === "reliability"
      ? { ...lens, acceptanceEvidence: "matrix-evidence-6", verificationEvidence: "matrix-proof-6" }
      : lens,
  );
  const reusedRowResult = evaluateStructuredFinalization(reusedRow);
  assert.ok(
    reusedRowResult.remainder.some((entry) => entry.includes("reliability review lens reuses acceptance-matrix row")),
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
