import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceDebrisFinding } from "./workspace-debris.js";

test("reports an unreferenced old candidate as separate workspace debris", () => {
  const finding = workspaceDebrisFinding(
    { path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 },
    [{ path: "src/live.ts", language: "typescript", content: "export const live = true;\n" }],
    ["src/live.ts", "scratch/old.ts"],
    "C:/repo",
    ["dynamic runtime loading"],
  );

  assert.deepEqual(finding, {
    classification: "advisory",
    review: "possible workspace debris",
    path: "scratch/old.ts",
    kind: "untracked",
    modifiedTimestampMs: 0,
    ageSource: "mtime",
    ageUncertainty:
      "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
    ignore: undefined,
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: ["dynamic runtime loading"],
  });
});
test("labels a high-confidence-looking debris candidate for review with mtime uncertainty", () => {
  const finding = workspaceDebrisFinding(
    { path: "scratch/very-old.ts", kind: "untracked", modifiedTimestampMs: 0 },
    [],
    ["scratch/very-old.ts"],
    "C:/repo",
    ["runtime reflection"],
  );

  assert.ok(finding);
  assert.equal(finding.classification, "advisory");
  assert.equal(finding.review, "possible workspace debris");
  assert.equal(finding.ageSource, "mtime");
  assert.equal(finding.ageUncertainty.includes("Copying, restoring, extracting, or rebuilding can change it."), true);
  assert.deepEqual(finding.unobservedReferenceMechanisms, ["runtime reflection"]);
  assert.equal(JSON.stringify(finding).toLowerCase().includes("delete"), false);
});
