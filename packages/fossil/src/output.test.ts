import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceDebrisTableRows } from "./output.js";
import type { WorkspaceDebrisFinding } from "./types.js";

function finding(path: string, kind: "untracked" | "ignored"): WorkspaceDebrisFinding {
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path,
    kind,
    modifiedTimestampMs: 0,
    ageSource: "mtime",
    ageUncertainty: "mtime only",
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: [],
  };
}

// covers: fossil/workspace-debris :: Review-only reporting :: Large ignored tree is summarized
test("summarizes ignored trees of at least twenty findings only in normal table rows", () => {
  const findings = [
    ...Array.from({ length: 20 }, (_, index) => finding(`generated/file-${index}.tmp`, "ignored")),
    finding("logs/one.tmp", "ignored"),
    finding("scratch/old.ts", "untracked"),
  ];
  const before = structuredClone(findings);

  const normalRows = workspaceDebrisTableRows(findings, "normal");
  const verboseRows = workspaceDebrisTableRows(findings, "verbose");

  assert.deepEqual(normalRows, [
    { kind: "ignored-directory-summary", directory: "generated", count: 20 },
    { kind: "finding", finding: findings[20] },
    { kind: "finding", finding: findings[21] },
  ]);
  assert.equal(verboseRows.length, 22);
  assert.deepEqual(
    verboseRows.map((row) => row.kind),
    Array.from({ length: 22 }, () => "finding"),
  );
  assert.deepEqual(findings, before);
});
