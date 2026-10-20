import assert from "node:assert/strict";
import test from "node:test";
import { ACCEPTANCE_MATRIX_PATHS } from "../../../lib/acceptance-matrix.mjs";
import { reviewLenses as buildReviewLenses, recordsWithRequiredKeys } from "./convergence-builders.mjs";
import { acceptanceMatrix } from "./passing-matrix.mjs";
import { PASSING_SECTION_LINE } from "./structured-workflow-fixtures.mjs";
import { evaluateConvergence, REQUIRED_REVIEW_LENSES, renderConvergence } from "./structured-workflow-proof.mjs";

test("structured proof produces passing and actionable outcomes", () => {
  const reviewLenses = buildReviewLenses({
    owner: (_, index) => ["search-flow"][index] ?? "task-1",
    headSha: "abc1234",
  });
  const complete = evaluateConvergence({
    headSha: "abc1234",
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: [
          "commit abc123; test passed",
          ...REQUIRED_REVIEW_LENSES.filter((id) => id !== "implementation").map((id) => `lens-${id}`),
        ],
        acceptanceEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `evidence-${index + 1}`),
        verificationEvidence: [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((_, index) => `proof-${index + 1}`),
      },
    ],
    children: [{ id: "search-flow", evidence: ["mapped", "lens-implementation"] }],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "structured proof passed" }],
    acceptanceMatrix: acceptanceMatrix("abc1234"),
    contradictions: [],
  });
  assert.equal(complete.outcome, "verified");
  assert.deepEqual(complete.remainder, []);
  const oneCleanSection = { outcome: "actionable remainder", remainder: ["x"], sections: { "Plan and tasks": [] } };
  assert.match(renderConvergence(oneCleanSection), PASSING_SECTION_LINE);
  assert.deepEqual(complete.sections, {
    "Requirements and clarifications": [],
    "Plan and tasks": [],
    "Functional decomposition": [],
    "Acceptance and verification": [],
  });

  const incomplete = evaluateConvergence({
    records: { requirements: true, clarifications: true, "implementation-plan": true },
    tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
    children: [{ id: "implementation", evidence: "mapped" }],
    reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "mapped" }],
    acceptance: [{ id: "AC-2", evidence: "" }],
    contradictions: ["user path not exercised"],
  });
  assert.equal(incomplete.outcome, "actionable remainder");
  assert.ok(incomplete.remainder.length > 0);
  assert.ok(incomplete.remainder.some((entry) => entry.includes("implementation slice needs an owning task")));
  const rendered = renderConvergence(incomplete);
  assert.match(rendered, /Plan and tasks: actionable/);
  assert.match(rendered, /Functional decomposition: actionable/);
  assert.match(rendered, /Acceptance and verification: actionable/);
  assert.match(rendered, /Next task: task-2; owner: wiring/);
  assert.match(rendered, /Remainder: /);
  assert.doesNotMatch(rendered, PASSING_SECTION_LINE);
  assert.doesNotMatch(rendered, /Outcome: verified/);
});

test("functional convergence rejects duplicate slices, owners, and missing mappings", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [
      { id: "task-1", child: "search-flow", evidence: "commit one" },
      { id: "task-2", child: "search-flow", evidence: "commit two" },
      { id: "task-3", child: "missing-flow", evidence: "commit three" },
    ],
    children: [
      { id: "search-flow", evidence: "mapped" },
      { id: "search-flow", evidence: "mapped again" },
      { id: "empty-flow", evidence: "" },
    ],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("search-flow functional slice is linked more than once")));
  assert.ok(result.remainder.some((entry) => entry.includes("search-flow slice has more than one owning task")));
  assert.ok(result.remainder.some((entry) => entry.includes("missing-flow")));
  assert.ok(result.remainder.some((entry) => entry.includes("empty-flow slice needs evidence")));
});

test("functional convergence validates review-lens identifiers and ownership", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", child: "search-flow", evidence: "mapped" }],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses: [
      { id: "implementation", owner: "task-1", evidence: "mapped" },
      { id: "implementation", owner: "task-1", evidence: "mapped again" },
      { id: "unknown", owner: "task-1", evidence: "mapped third" },
    ],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("implementation review lens is declared more than once")));
  assert.ok(result.remainder.some((entry) => entry.includes("unknown lens")));
  assert.ok(result.remainder.some((entry) => entry.includes("wiring/usability review lens needs an owning task")));
});

test("functional convergence rejects evidence reused across owners", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", child: "search-flow", evidence: "same-proof" }],
    children: [{ id: "search-flow", evidence: "same-proof" }],
    reviewLenses: [{ id: "implementation", owner: "task-1", evidence: "same-proof" }],
    acceptance: [{ id: "AC-1", evidence: "same-proof" }],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(
    result.remainder.filter((entry) => entry.includes("evidence same-proof is mapped more than once")).length >= 2,
  );
});

test("functional convergence rejects repeated evidence references", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", child: "search-flow", evidence: ["commit", "lens-implementation"] }],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses: [
      {
        id: "implementation",
        owner: "task-1",
        evidence: ["lens-implementation", "lens-implementation"],
        acceptanceEvidence: "planned-acceptance",
        verificationEvidence: "planned-verification",
      },
    ],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("references evidence lens-implementation more than once")));
});

test("functional convergence rejects evidence reused across review lenses", () => {
  const reviewLenses = REQUIRED_REVIEW_LENSES.map((id, index) => ({
    id,
    owner: "task-1",
    evidence: index === 1 ? "lens-implementation" : `lens-${id}`,
    acceptanceEvidence: index === 1 ? "matrix-evidence-1" : `matrix-evidence-${index + 1}`,
    verificationEvidence: index === 1 ? "matrix-proof-1" : `matrix-proof-${index + 1}`,
  }));
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit", ...new Set(reviewLenses.map((lens) => lens.evidence))],
        acceptanceEvidence: reviewLenses.map((lens) => lens.acceptanceEvidence),
        verificationEvidence: reviewLenses.map((lens) => lens.verificationEvidence),
      },
    ],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("reuses evidence lens-implementation")));
});

test("functional convergence requires lens acceptance and verification evidence before push", () => {
  const reviewLenses = REQUIRED_REVIEW_LENSES.map((id) => ({
    id,
    owner: "task-1",
    evidence: `lens-${id}`,
  }));
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [{ id: "task-1", child: "search-flow", evidence: ["commit", ...reviewLenses.map((lens) => lens.evidence)] }],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
  });

  assert.ok(
    result.remainder.filter((entry) => entry.includes("needs acceptance and verification evidence")).length >= 4,
  );
});

test("functional convergence reports malformed collection entries", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [null, { evidence: "orphan" }],
    children: ["not a child", { id: 42, evidence: "numeric" }],
    reviewLenses: [null],
    acceptance: [42],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("task entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("child entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("linked child needs a functional slice id")));
  assert.ok(result.remainder.some((entry) => entry.includes("review lens entry 1 must be an object")));
  assert.ok(result.remainder.some((entry) => entry.includes("acceptance criterion entry 1 must be an object")));
});

test("functional convergence rejects missing acceptance identifiers", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", parentLevel: "convergence", evidence: "commit" }],
    acceptance: [{ evidence: "proof" }],
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("acceptance criterion 1 needs a non-empty id")));
});

test("functional convergence rejects a task without an identifier", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{}],
    acceptance: [{ id: "AC-1", evidence: "proof" }],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("task entry 1 needs a non-empty id")));
});

test("functional convergence keeps provider child ids separate from slice ids", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", child: "search-flow", evidence: "commit" }],
    children: [{ id: "issue-42", slice: "search-flow", evidence: "proof" }],
  });

  assert.ok(!result.remainder.some((entry) => entry.includes("functional slice identifiers disagree")));
  assert.ok(!result.remainder.some((entry) => entry.includes("missing functional slice search-flow")));
});

test("functional convergence rejects an independent task that has no linked child", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [
      { id: "task-1", parentLevel: "convergence", independent: true, evidence: "mapped one" },
      { id: "task-2", parentLevel: "convergence", independent: false, evidence: "mapped two" },
      { id: "task-3", parentLevel: "convergence", evidence: "mapped three" },
      { id: "task-4", child: "search-flow", independent: true, evidence: "mapped four" },
    ],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
  });

  const independent = result.remainder.filter((entry) => entry.includes("marked independent"));
  assert.equal(independent.length, 1, JSON.stringify(independent));
  assert.ok(independent[0].includes("task-1"), independent[0]);
  assert.ok(independent[0].includes("no linked child issue"), independent[0]);
});

test("functional convergence reports one remainder for an independent task with no mapping at all", () => {
  const result = evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", independent: true, evidence: "mapped one" }],
    children: [],
  });

  const forTask = result.remainder.filter((entry) => entry.startsWith("task-1 "));
  assert.equal(forTask.length, 1, JSON.stringify(forTask));
  assert.ok(forTask[0].includes("needs a functional slice or parent-level convergence marker"), forTask[0]);
});
