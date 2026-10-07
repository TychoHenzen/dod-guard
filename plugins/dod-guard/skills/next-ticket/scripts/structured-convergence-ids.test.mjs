import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceMatrix, lensEvidence, proof, recordsWithRequiredKeys } from "./structured-workflow-fixtures.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const proofScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "structured-workflow-proof.mjs");

test("normalizes task identifiers before matching owners", () => {
  const reviewLenses = [
    {
      id: " implementation ",
      owner: "task-1",
      evidence: " lens-implementation ",
      headSha: "normalization-head",
      acceptanceEvidence: "evidence-1",
      verificationEvidence: "proof-1",
    },
  ];
  const result = proof.evaluateConvergence({
    headSha: "normalization-head",
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: " task-1 ",
        child: "search-flow",
        evidence: [" commit ", " lens-implementation "],
        acceptanceEvidence: ["evidence-1"],
        verificationEvidence: ["proof-1"],
      },
    ],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "proof" }],
    acceptanceMatrix: acceptanceMatrix("normalization-head"),
  });

  assert.ok(!result.remainder.some((entry) => entry.includes("implementation review lens")));
  assert.ok(!result.remainder.some((entry) => entry.includes("missing owner task-1")));
});

test("review-lens owner IDs cannot collide with slice IDs", () => {
  const result = proof.evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [
      { id: "task-1", child: "slice-a", evidence: "task-proof" },
      { id: "slice-a", child: "slice-b", evidence: "owner-proof" },
    ],
    children: [
      { id: "slice-a", evidence: "slice-a-proof" },
      { id: "slice-b", evidence: "slice-b-proof" },
    ],
    reviewLenses: [{ id: "implementation", owner: "slice-a", evidence: "owner-proof" }],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("both a task id and a functional slice id")));
});

test("structured convergence rejects a placeholder lens-ownership record", () => {
  const result = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{ id: "task-1", child: "search-flow", evidence: "commit" }],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses: proof.REQUIRED_REVIEW_LENSES.map((id) => ({ id, owner: "task-1", evidence: `lens-${id}` })),
  });

  assert.ok(result.remainder.some((entry) => entry.includes("lens-ownership record must be an array")));
});

test("structured convergence rejects lens-ownership records that drift from review lenses", () => {
  const lensOwnership = proof.REQUIRED_REVIEW_LENSES.map((id) => ({
    id,
    owner: "task-1",
    evidence: `record-${id}`,
  }));
  const reviewLenses = proof.REQUIRED_REVIEW_LENSES.map((id) => ({
    id,
    owner: "task-1",
    evidence: `review-${id}`,
  }));
  const result = proof.evaluateConvergence({
    records: recordsWithRequiredKeys(lensOwnership),
    tasks: [
      {
        id: "task-1",
        child: "search-flow",
        evidence: ["commit", ...reviewLenses.map((lens) => lens.evidence)],
      },
    ],
    children: [{ id: "search-flow", evidence: "slice-proof" }],
    reviewLenses,
  });

  assert.ok(
    result.remainder.some((entry) => entry.includes("lens-ownership record does not match review-lens evidence")),
  );
});

test("structured convergence reports malformed lens-ownership entries", () => {
  const result = proof.evaluateConvergence({
    records: recordsWithRequiredKeys([null]),
    tasks: [],
    children: [],
    reviewLenses: [],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("lens-ownership entry 1 must be an object")));
});

test("ordinary fixes bypass structured records", () => {
  assert.deepEqual(proof.evaluateConvergence({ path: "ordinary" }), {
    outcome: "ordinary",
    remainder: [],
  });
});

test("structured convergence verifies a parent-level task without children", () => {
  const reviewLenses = proof.REQUIRED_REVIEW_LENSES.map((id, index) => ({
    id,
    owner: "task-1",
    evidence: `lens-${id}`,
    headSha: "parent-head",
    acceptanceEvidence: lensEvidence(id, index, "evidence"),
    verificationEvidence: lensEvidence(id, index, "proof"),
  }));
  const result = proof.evaluateConvergence({
    headSha: "parent-head",
    records: recordsWithRequiredKeys(reviewLenses),
    tasks: [
      {
        id: "task-1",
        parentLevel: "convergence",
        evidence: ["parent-proof", ...reviewLenses.map((lens) => lens.evidence)],
        acceptanceEvidence: acceptanceMatrix("parent-head").map((row) => row.evidence),
        verificationEvidence: acceptanceMatrix("parent-head").map((row) => row.proof),
      },
    ],
    children: [],
    reviewLenses,
    acceptance: [{ id: "AC-1", evidence: "parent acceptance" }],
    acceptanceMatrix: acceptanceMatrix("parent-head"),
  });

  assert.equal(result.outcome, "verified");
});

test("structured convergence rejects a matrix tied to a different head", () => {
  const result = proof.evaluateConvergence({
    headSha: "new-head",
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", child: "implementation", evidence: "commit new-head" }],
    children: [{ id: "search-flow", evidence: "mapped" }],
    acceptance: [{ id: "AC-1", evidence: "structured proof passed" }],
    acceptanceMatrix: acceptanceMatrix("old-head"),
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("expected new-head")));
});

test("structured convergence requires an exact pushed head", () => {
  const result = proof.evaluateConvergence({
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", parentLevel: "convergence", evidence: "commit" }],
    acceptance: [{ id: "AC-1", evidence: "proof" }],
    acceptanceMatrix: [],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("needs an exact pushed head")));
});

test("structured convergence requires an acceptance matrix after the head is known", () => {
  const result = proof.evaluateConvergence({
    headSha: "new-head",
    records: recordsWithRequiredKeys([]),
    tasks: [{ id: "task-1", parentLevel: "convergence", evidence: "commit" }],
    acceptance: [{ id: "AC-1", evidence: "proof" }],
  });

  assert.ok(result.remainder.some((entry) => entry.includes("needs an acceptance matrix")));
});

test("structured proof CLI separates known paths and rejects unknown scenarios", () => {
  const run = (scenario) => spawnSync(process.execPath, [proofScript, scenario], { encoding: "utf8" });
  const passing = run("passing");
  assert.equal(passing.status, 0);
  assert.match(passing.stdout, /^## Convergence\n- Handoff: \S+#issuecomment-1 \(head abc1234\)\n- Remainder: none\n$/);

  const incomplete = run("incomplete");
  assert.equal(incomplete.status, 0);
  assert.match(incomplete.stdout, /Outcome: actionable remainder/);
  assert.match(incomplete.stdout, /Next task: task-2; owner: wiring/);
  assert.doesNotMatch(
    incomplete.stdout,
    /^- (?:Requirements and clarifications|Plan and tasks|Functional decomposition|Acceptance and verification): (?:mapped to evidence|exercised)$/m,
  );

  const ordinary = run("ordinary");
  assert.equal(ordinary.status, 0);
  assert.match(ordinary.stdout, /Outcome: ordinary/);
  assert.doesNotMatch(ordinary.stdout, /Requirements and clarifications/);

  const unknown = run("typo");
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown proof scenario/);
  assert.doesNotMatch(unknown.stdout, /Outcome: verified/);
});
