import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStructuredFinalization } from "./finalization-gate.mjs";
import { validConvergenceInput } from "./fixtures/convergence-input.mjs";

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
