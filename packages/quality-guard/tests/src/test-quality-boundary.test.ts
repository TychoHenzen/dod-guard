import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTestQuality } from "../../src/test-quality/analyze.js";

test("requires an input and expected oracle for declared boundaries", () => {
  const report = analyzeTestQuality({
    schemaVersion: 1,
    sources: [
      {
        path: "src/parser.py",
        language: "python",
        behaviors: [{ id: "edge", kind: "boundary" }],
      },
    ],
    tests: [],
  });

  assert.equal(report.status, "invalid");
  assert.equal(
    report.errors.some((error) => error.includes("input and expected")),
    true,
  );
});

test("requires bug records to name affected behavior", () => {
  const report = analyzeTestQuality({
    schemaVersion: 1,
    sources: [
      {
        path: "src/service.ts",
        language: "ts",
        behaviors: [{ id: "bug.behavior", kind: "behavior" }],
      },
    ],
    tests: [],
    bugs: [{ id: "BUG-1", sourcePath: "src/service.ts", behaviorIds: [] }],
  });

  assert.equal(report.status, "invalid");
  assert.equal(
    report.errors.some((error) =>
      error.includes("at least one affected behavior"),
    ),
    true,
  );
});
