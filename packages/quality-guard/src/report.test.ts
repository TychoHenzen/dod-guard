import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQualityReport } from "./report.js";

test("scores every scanned file and keeps architecture outside the score", () => {
  const report = buildQualityReport(
    {
      profile: "default",
      files: [
        { path: "src/clean.ts", language: "ts", classification: "production" },
        { path: "tests/noisy.test.ts", language: "ts", classification: "test" },
      ],
      violations: [
        { file: "tests/noisy.test.ts", line: 4, rule: "complexity", severity: "error", message: "12 > 10" },
        { file: "tests/noisy.test.ts", line: 8, rule: "else-branch", severity: "warn", message: "prefer guard" },
        { file: "tests/noisy.test.ts", line: 9, rule: "todo-marker", severity: "warn", message: "TODO" },
      ],
    },
    {
      placement: [{ kind: "generic-bucket", directory: "src/utils" }],
      dependencies: [],
      cycles: [],
      encapsulation: [],
      errors: [],
    },
  );

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(
    report.files.map((file) => [file.path, file.classification, file.score]),
    [
      ["src/clean.ts", "production", 100],
      ["tests/noisy.test.ts", "test", 93],
    ],
  );
  assert.equal(report.summaries.production.minimumScore, 100);
  assert.equal(report.summaries.test.averageScore, 93);
  assert.equal(report.architecture.placement.length, 1);
});

test("scores stop at zero and findings have deterministic order", () => {
  const violations = Array.from({ length: 21 }, (_, index) => ({
    file: "src/bad.ts",
    line: 21 - index,
    rule: "complexity",
    severity: "error" as const,
    message: "too complex",
  }));
  const report = buildQualityReport(
    {
      profile: "strict",
      files: [{ path: "src/bad.ts", language: "ts", classification: "production" }],
      violations,
    },
    { placement: [], dependencies: [], cycles: [], encapsulation: [], errors: [] },
  );

  assert.equal(report.files[0]?.score, 0);
  assert.deepEqual(
    report.files[0]?.findings.slice(0, 2).map((finding) => finding.line),
    [1, 2],
  );
});
