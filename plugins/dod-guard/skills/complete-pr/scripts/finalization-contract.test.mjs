import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
const standard = await readFile(new URL("../../../standards/github-request-discipline.md", import.meta.url), "utf8");
const proof = await import("../../next-ticket/scripts/structured-workflow-proof.mjs");

test("finalizes each structured parent child only after the guarded merge", () => {
  const finalization = skill.slice(skill.indexOf("## Finalize the parent unit"));

  assert.match(finalization, /Only after the helper returns a verified merge result/);
  assert.match(finalization, /each linked child to match one independently delivered and\s+verified functional slice/);
  assert.match(finalization, /There is no fixed child\s+count or category set/);
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
  const result = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [{
      id: "task-1",
      child: "missing-flow",
      evidence: ["commit", ...proof.REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`)],
    }],
    children: [{ id: "implemented-flow", evidence: "mapped" }],
    reviewLenses: proof.REQUIRED_REVIEW_LENSES.map((id) => ({ id, owner: "task-1", evidence: `lens-${id}` })),
  });

  assert.equal(result.outcome, "actionable remainder");
  assert.ok(result.remainder.some((entry) => entry.includes("missing functional slice")));
  assert.ok(result.remainder.some((entry) => entry.includes("implemented-flow slice needs an owning task")));
  assert.ok(!result.remainder.some((entry) => entry.includes("review lens")));

  const duplicateSlice = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [
      { id: "task-1", child: "same-flow", evidence: "same-proof" },
      { id: "task-2", child: "same-flow", evidence: "other-proof" },
    ],
    children: [
      { id: "same-flow", evidence: "slice-proof" },
      { id: "same-flow", evidence: "other-slice-proof" },
      { id: "other-flow", evidence: "other-evidence" },
    ],
  });

  assert.ok(duplicateSlice.remainder.some((entry) => entry.includes("same-flow functional slice is linked more than once")));

  const duplicateEvidence = proof.evaluateConvergence({
    records: proof.REQUIRED_RECORDS.reduce((records, name) => ({ ...records, [name]: true }), {}),
    tasks: [
      { id: "task-1", child: "first-flow", evidence: "same-proof" },
      { id: "task-2", child: "second-flow", evidence: "same-proof" },
    ],
    children: [
      { id: "first-flow", evidence: "first-slice-proof" },
      { id: "second-flow", evidence: "second-slice-proof" },
    ],
  });

  assert.ok(duplicateEvidence.remainder.some((entry) => entry.includes("evidence same-proof is mapped more than once")));
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
