import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACCEPTANCE_MATRIX_PATHS } from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";
import { evaluateStructuredFinalization } from "./finalization-gate.mjs";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const standard = await readFile(new URL("../../../standards/github-request-discipline.md", import.meta.url), "utf8");
const proof = await import("../../next-ticket/scripts/structured-workflow-proof.mjs");
const completeRecords = () =>
  proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {});
const validConvergenceInput = () => ({
  records: completeRecords(),
  tasks: [{
    id: "task-1",
    child: "search-flow",
    evidence: [
      "commit-proof",
      ...proof.REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`),
    ],
      acceptanceEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-evidence-${index + 1}`),
      verificationEvidence: ACCEPTANCE_MATRIX_PATHS.map((_, index) => `matrix-proof-${index + 1}`),
  }, {
    id: "task-2",
    child: "settings-flow",
    evidence: "settings-proof",
  }],
  children: [
    { id: "search-flow", evidence: "slice-proof" },
    { id: "settings-flow", evidence: "settings-slice-proof" },
  ],
  reviewLenses: proof.REQUIRED_REVIEW_LENSES.map((id, index) => ({
    id,
    owner: "task-1",
    evidence: `lens-${id}`,
    headSha: "proof-head",
    acceptanceEvidence: `matrix-evidence-${index + 1}`,
    verificationEvidence: `matrix-proof-${index + 1}`,
  })),
  acceptance: [{ id: "AC-1", evidence: "acceptance-proof" }],
  acceptanceMatrix: ACCEPTANCE_MATRIX_PATHS.map((path, index) => ({
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
});

test("finalizes each structured parent child only after the guarded merge", () => {
  const finalization = skill.slice(skill.indexOf("## Finalize the parent unit"));

  assert.match(finalization, /Only after the helper returns a verified merge result/);
  assert.match(finalization, /each linked child to match one independently delivered and\s+verified functional slice/);
  assert.match(finalization, /There is no fixed child\s+count or category set/);
  assert.match(finalization, /structured-workflow-proof\.mjs/);
  assert.match(finalization, /stop on any actionable\s+remainder/);
  assert.match(finalization, /calls the exported\s+`evaluateConvergence` API/);
  assert.match(finalization, /require `outcome: "verified"`/);
  assert.match(finalization, /Resolve the\s+shared Project number, REST item IDs, Status-field ID, and `Done` option ID once/);
  assert.match(finalization, /project-status\.mjs <owner> <project-number> <status-field-node-id> <done-option-id> Done <child-item-id> \.\.\. <parent-item-id>/);
  assert.match(finalization, /child item IDs first and the parent\s+item ID last/);
  assert.match(finalization, /runner resolves the live REST field and item IDs/);
  assert.match(finalization, /reads\s+each item back\s+from the shared Project before continuing/);
  assert.match(finalization, /For every code-backed\s+child, verify\s+its pushed commit is\s+included in the verified merge/);
  assert.match(finalization, /Close a\s+still-open code-backed\s+child only after\s+that verification/);
  assert.match(finalization, /Never finalize a parent or child\s+before the helper's merge result/);
  assert.match(finalization, /never\s+alter unrelated Project items/);
});

test("shares the global ProjectV2 resolution and sequential readback contract", () => {
  assert.match(standard, /numeric Project number is the REST path identifier/);
  assert.match(standard, /typed connector; otherwise use the REST ProjectsV2 endpoints/);
  assert.match(standard, /only for a capability with no connector or REST equivalent/);
  assert.match(standard, /write every child\s+before the parent, then read each item/);
  assert.match(standard, /skills\/complete-pr\/scripts\/project-status\.mjs/);
});

test("finalization relies on executable functional convergence proof", () => {
  assert.equal(proof.scenarioResult("passing").outcome, "verified");
  const passing = proof.evaluateConvergence(validConvergenceInput());
  assert.equal(passing.outcome, "verified");
  const resultInput = validConvergenceInput();
  resultInput.tasks[0].child = "missing-flow";
  resultInput.children[0].id = "implemented-flow";
  const result = proof.evaluateConvergence(resultInput);

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("missing functional slice")));
  assert.ok(result.remainder.some((entry) => entry.includes("implemented-flow slice needs an owning task")));
  assert.ok(!result.remainder.some((entry) => entry.includes("review lens")));

  const missingLensInput = validConvergenceInput();
  missingLensInput.reviewLenses = missingLensInput.reviewLenses.slice(0, 1);
  const missingLens = proof.evaluateConvergence(missingLensInput);
  assert.equal(missingLens.outcome, "actionable remainder");
  assert.ok(missingLens.remainder.some((entry) => entry.includes("wiring/usability review lens needs an owning task")));

  const duplicateSliceInput = validConvergenceInput();
  duplicateSliceInput.tasks[1].child = "search-flow";
  duplicateSliceInput.tasks[1].evidence = "other-proof";
  const duplicateSlice = proof.evaluateConvergence(duplicateSliceInput);

  assert.ok(duplicateSlice.remainder.some((entry) => entry.includes("search-flow slice has more than one owning task")));
  assert.equal(duplicateSlice.outcome, "actionable remainder");

  const duplicateEvidenceInput = validConvergenceInput();
  duplicateEvidenceInput.tasks[1].evidence = duplicateEvidenceInput.tasks[0].evidence;
  const duplicateEvidence = proof.evaluateConvergence(duplicateEvidenceInput);

  assert.ok(duplicateEvidence.remainder.some((entry) => entry.includes("evidence commit-proof is mapped more than once")));
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
      entry.includes("implementation review lens needs acceptance-matrix acceptance evidence"),
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
});

test("keeps routine ProjectV2 guidance out of GraphQL", async () => {
  const skillPaths = [
    "../../add-backlog-idea/SKILL.md",
    "../../next-ticket/SKILL.md",
    "../../setup-repository/SKILL.md",
    "../../refine-backlog-item/SKILL.md",
  ];
  for (const skillPath of skillPaths) {
    const text = await readFile(new URL(skillPath, import.meta.url), "utf8");
    assert.doesNotMatch(text, /(?:projectsV2|ProjectV2)[^\n]*(?:GraphQL|updateProjectV2Field|gh project item-edit)/i);
  }
});
