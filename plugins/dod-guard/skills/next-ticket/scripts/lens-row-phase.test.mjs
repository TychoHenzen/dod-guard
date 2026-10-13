import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as gate from "../../complete-pr/scripts/finalization-gate.mjs";
import { issue855Shape, observedFromPlanned, proof, recordsWithRequiredKeys } from "./structured-workflow-fixtures.mjs";

const { evaluateStructuredFinalization } = gate;
// The live #904 lens records, tasks, and criteria with the matrix of its one
// implementation handoff comment, all bound to the #904 pushed head.
const issue904 = JSON.parse(await readFile(new URL("./fixtures/issue-904-handoff.json", import.meta.url), "utf8"));

const PUSHED_HEAD = "0123456789abcdef0123456789abcdef01234567";
const RECOVERY_REMAINDER = "reliability review lens must cover required path(s): recovery";
const lensRemainder = (result) => result.remainder.filter((entry) => entry.includes("review lens"));

test("planned-mode convergence rejects the #855 pre-correction shape on the recovery path", () => {
  const result = proof.evaluateConvergence(issue855Shape());

  assert.equal(result.outcome, "actionable remainder");
  assert.deepEqual(result.remainder, [RECOVERY_REMAINDER]);
  assert.deepEqual(result.sections["Functional decomposition"], [RECOVERY_REMAINDER]);
});

test("planned-mode convergence verifies the #855 shape after the record correction", () => {
  const result = proof.evaluateConvergence(issue855Shape({ corrected: true }));

  assert.equal(result.outcome, "verified");
  assert.deepEqual(result.remainder, []);
});

test("planned-mode lens remainders equal finalization's on the derived all-pass matrix", () => {
  const shapes = {
    "855 pre-correction": issue855Shape(),
    "855 corrected": issue855Shape({ corrected: true }),
    "wiring path missing": issue855Shape({ corrected: true, wiringPathMissing: true }),
  };
  const expected = {
    "855 pre-correction": [RECOVERY_REMAINDER],
    "855 corrected": [],
    "wiring path missing": ["wiring/usability review lens must cover required path(s): browser/e2e"],
  };
  for (const [name, planned] of Object.entries(shapes)) {
    const refinement = proof.evaluateConvergence(planned);
    const finalization = evaluateStructuredFinalization(observedFromPlanned(planned, PUSHED_HEAD));

    assert.deepEqual(lensRemainder(refinement), expected[name], name);
    assert.deepEqual(lensRemainder(finalization), lensRemainder(refinement), name);
    assert.deepEqual(finalization.remainder, refinement.remainder, name);
  }
});

test("post-push convergence applies the same lens-path rule as finalization", () => {
  const result = proof.evaluateConvergence(observedFromPlanned(issue855Shape(), PUSHED_HEAD));

  assert.deepEqual(result.remainder, [RECOVERY_REMAINDER]);
});

test("planned mode reports the planned-matrix errors and the lens-row checks", () => {
  const input = issue855Shape({ corrected: true });
  input.plannedAcceptanceMatrix = input.plannedAcceptanceMatrix
    .filter((row) => row.id !== "R2")
    .map((row) => (row.id === "R1" ? { ...row, status: "pass" } : row));
  input.reviewLenses[3].verificationEvidence = ["proof-ac1-archived", "proof-ac1-archived"];
  input.records["lens-ownership"] = input.reviewLenses;
  const result = proof.evaluateConvergence(input);

  assert.ok(result.remainder.includes("acceptance matrix: R1 has status pass, which is not a planned status"));
  assert.ok(result.remainder.includes("acceptance matrix: missing pending acceptance row for AC-2"));
  assert.ok(result.remainder.includes("implementation review lens references undeclared acceptance evidence ev-ac2-unclaimed"));
  assert.ok(result.remainder.includes("reliability review lens verification evidence references proof-ac1-archived more than once"));
});

test("a refinement call without a planned matrix keeps the master verdict", () => {
  const { plannedAcceptanceMatrix, ...sevenKeys } = issue855Shape();

  assert.equal(proof.evaluateConvergence(sevenKeys).outcome, "verified");
});

test("a seven-key scratch-helper call keeps the export names, input keys, and result fields", () => {
  const sevenKeys = {
    records: recordsWithRequiredKeys(issue904.reviewLenses),
    tasks: issue904.tasks,
    children: [],
    reviewLenses: issue904.reviewLenses,
    acceptance: issue904.acceptance,
    acceptanceMatrix: issue904.acceptanceMatrix,
    headSha: issue904.headSha,
  };
  const convergence = proof.evaluateConvergence(sevenKeys);
  const finalization = evaluateStructuredFinalization(sevenKeys);

  assert.deepEqual(Object.keys(gate), ["evaluateStructuredFinalization"]);
  assert.equal(typeof proof.evaluateConvergence, "function");
  assert.deepEqual(Object.keys(convergence), ["outcome", "remainder", "sections", "nextAction"]);
  assert.deepEqual(convergence.remainder, []);
  assert.deepEqual(Object.keys(finalization), ["outcome", "remainder", "sections", "nextAction", "nextStep"]);
  assert.equal(finalization.outcome, "verified");
  assert.equal(finalization.nextStep, "project-status.mjs");

  const stale = evaluateStructuredFinalization({ ...sevenKeys, headSha: "119d2c3049d92993b948e8d91126848cb753351f" });
  assert.equal(stale.nextStep, "stop");
  assert.ok(stale.remainder.includes("implementation review lens is not bound to handoff head 119d2c3049d92993b948e8d91126848cb753351f"));
});

test("finalization refuses a handoff with no pushed head or observed matrix", () => {
  const { plannedAcceptanceMatrix, ...sevenKeys } = issue855Shape({ corrected: true });
  for (const handoff of [sevenKeys, issue855Shape({ corrected: true })]) {
    const result = evaluateStructuredFinalization(handoff);

    assert.equal(result.outcome, "actionable remainder");
    assert.equal(result.nextStep, "stop");
    assert.ok(result.remainder.includes("finalization needs an exact pushed head"));
  }
});
