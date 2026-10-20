import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCEPTANCE_MATRIX_PATHS } from "../../../lib/acceptance-matrix.mjs";
import {
  reviewLenses as buildReviewLenses,
  recordsWithRequiredKeys,
} from "../../next-ticket/scripts/convergence-builders.mjs";
import {
  evaluateConvergence,
  REQUIRED_REVIEW_LENSES,
  scenarioResult,
} from "../../next-ticket/scripts/structured-workflow-proof.mjs";

const validConvergenceInput = () => {
  const reviewLenses = buildReviewLenses({ headSha: "proof-head", prefix: "matrix-" });
  return {
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit-proof", ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
        acceptanceEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `matrix-evidence-${index + 1}`),
        verificationEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `matrix-proof-${index + 1}`),
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
    acceptanceMatrix: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((path, index) => ({
      id: `AC-1-${index + 1}`,
      contract: "AC-1",
      path,
      proof: `matrix-proof-${index + 1}`,
      expected: "pass",
      observed: "pass",
      status: "pass",
      evidence: `matrix-evidence-${index + 1}`,
      headSha: "proof-head",
    })),
    headSha: "proof-head",
  };
};

test("routes a valid functional decomposition through executable convergence proof", () => {
  assert.equal(scenarioResult("passing").outcome, "verified");
  const passing = evaluateConvergence(validConvergenceInput());
  assert.equal(passing.outcome, "verified");
  assert.ok(!passing.remainder.some((entry) => entry.includes("review lens")));
});

test("allows an explicitly parent-level convergence task", () => {
  const parentLevel = validConvergenceInput();
  parentLevel.tasks = [
    {
      id: "task-1",
      parentLevel: "convergence",
      evidence: ["commit-proof", ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
      acceptanceEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `matrix-evidence-${index + 1}`),
      verificationEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `matrix-proof-${index + 1}`),
    },
  ];
  parentLevel.children = [];
  const parentLevelResult = evaluateConvergence(parentLevel);
  assert.equal(parentLevelResult.outcome, "verified");
  assert.ok(!parentLevelResult.remainder.some((entry) => entry.includes("acceptance")));
});

test("rejects missing and duplicate review lenses", () => {
  const missingLens = validConvergenceInput();
  missingLens.reviewLenses = missingLens.reviewLenses.slice(0, -1);
  const missingLensResult = evaluateConvergence(missingLens);
  assert.ok(
    missingLensResult.remainder.some((entry) => entry.includes("reliability review lens needs an owning task")),
  );

  const duplicateLens = validConvergenceInput();
  duplicateLens.reviewLenses.push({ ...duplicateLens.reviewLenses[0] });
  const duplicateLensResult = evaluateConvergence(duplicateLens);
  assert.ok(
    duplicateLensResult.remainder.some((entry) =>
      entry.includes("implementation review lens is declared more than once"),
    ),
  );
});

test("rejects a task that references a missing functional slice", () => {
  const input = validConvergenceInput();
  input.tasks[0].child = "missing-flow";
  const result = evaluateConvergence(input);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("missing functional slice")));
});

test("rejects a functional slice without an owning task", () => {
  const input = validConvergenceInput();
  input.children[0].id = "implemented-flow";
  const result = evaluateConvergence(input);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("implemented-flow slice needs an owning task")));
});

test("rejects duplicate functional slices and evidence", () => {
  const duplicate = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [
      { id: "task-1", child: "same-flow", evidence: "same-proof" },
      { id: "task-2", child: "same-flow", evidence: "other-proof" },
    ],
    children: [
      { id: "same-flow", evidence: "same-proof" },
      { id: "same-flow", evidence: "other-evidence" },
    ],
  });

  assert.ok(duplicate.remainder.some((entry) => entry.includes("same-flow functional slice is linked more than once")));
  assert.ok(duplicate.remainder.some((entry) => entry.includes("evidence same-proof is mapped more than once")));
});

test("rejects review-lens evidence owned by another mapping", () => {
  const unmappedInput = validConvergenceInput();
  unmappedInput.tasks[0].evidence = unmappedInput.tasks[0].evidence.filter(
    (evidence) => evidence !== "lens-implementation",
  );
  unmappedInput.children[0].evidence = "lens-implementation";
  const unmappedEvidence = evaluateConvergence(unmappedInput);
  assert.ok(unmappedEvidence.remainder.some((entry) => entry.includes("references evidence owned by search-flow")));
  assert.ok(!unmappedEvidence.remainder.some((entry) => entry.includes("needs an owning task")));
});
